import { createHash, randomBytes } from 'node:crypto';
import { FieldValue, Timestamp, type DocumentReference } from 'firebase-admin/firestore';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { adminAuth, db, publicAppUrl, tikTokClientKey, tikTokClientSecret, tikTokRedirectUri } from './config';
import { expiresIn, hash, randomToken } from './helpers';

const tikTokEnabled = process.env.ENABLE_TIKTOK_AUTH === 'true';
const secrets = tikTokEnabled ? [tikTokClientKey, tikTokClientSecret] : [];

function requireTikTokEnabled(): void {
  if (!tikTokEnabled) throw new HttpsError('failed-precondition', 'TikTok sign-in is not enabled for this PackProof environment.');
}

async function buildTikTokAuthorization(targetUid: string | null, purpose: 'APP_AUTH' | 'WEB_DELETE') {
  requireTikTokEnabled();
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomToken(32);
  await db.collection('oauthStates').doc(hash(state)).set({
    provider: 'tiktok', purpose, targetUid, verifier, used: false,
    expiresAt: expiresIn(600), createdAt: FieldValue.serverTimestamp(),
  });
  const params = new URLSearchParams({
    client_key: tikTokClientKey.value(), response_type: 'code', scope: 'user.info.basic',
    redirect_uri: tikTokRedirectUri.value(), state, code_challenge: challenge, code_challenge_method: 'S256',
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
}

export const createTikTokAuthSession = onCall({ enforceAppCheck: true, secrets }, async (request) => {
  return { authorizationUrl: await buildTikTokAuthorization(request.auth?.uid ?? null, 'APP_AUTH') };
});

export const webTikTokDeletionStart = onRequest({ secrets }, async (request, response) => {
  if (!tikTokEnabled) { response.status(404).send('TikTok sign-in is not enabled.'); return; }
  if (request.method !== 'GET') { response.status(405).send('Method not allowed'); return; }
  response.redirect(302, await buildTikTokAuthorization(null, 'WEB_DELETE'));
});

type TikTokTokenResponse = { access_token?: string; open_id?: string; refresh_token?: string; error?: string; error_description?: string };
type TikTokUserResponse = { data?: { user?: { open_id?: string; union_id?: string; display_name?: string; avatar_url?: string } }; error?: { code?: string; message?: string } };

export const tiktokAuthCallback = onRequest({ secrets }, async (request, response) => {
  if (!tikTokEnabled) { response.status(404).send('TikTok sign-in is not enabled.'); return; }
  const code = String(request.query.code ?? '');
  const state = String(request.query.state ?? '');
  const stateRef = db.collection('oauthStates').doc(hash(state));
  const stateSnap = state ? await stateRef.get() : null;
  const stateData = stateSnap?.data();
  if (!code || !state || !stateSnap?.exists || stateData?.used
    || (stateData?.expiresAt as Timestamp).toMillis() < Date.now()) {
    response.status(400).send('This TikTok sign-in attempt is invalid or expired. Return to PackProof and try again.');
    return;
  }

  try {
    const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: tikTokClientKey.value(),
        client_secret: tikTokClientSecret.value(),
        code,
        grant_type: 'authorization_code',
        redirect_uri: tikTokRedirectUri.value(),
        code_verifier: stateData!.verifier,
      }),
    });
    const token = await tokenResponse.json() as TikTokTokenResponse;
    if (!tokenResponse.ok || !token.access_token || !token.open_id) throw new Error(token.error_description ?? token.error ?? 'TikTok token exchange failed.');

    const userResponse = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const userPayload = await userResponse.json() as TikTokUserResponse;
    const profile = userPayload.data?.user;
    if (!userResponse.ok || !profile?.open_id) throw new Error(userPayload.error?.message ?? 'TikTok profile lookup failed.');

    const providerKey = hash(`tiktok:${profile.open_id}`);
    const providerRef = db.collection('providerLinks').doc(providerKey);
    const providerSnap = await providerRef.get();
    const existingUid = providerSnap.data()?.uid as string | undefined;
    const targetUid = stateData!.targetUid as string | null;
    if (stateData!.purpose === 'WEB_DELETE') {
      if (existingUid) {
        const scheduledAt = Timestamp.fromMillis(Date.now() + 7 * 86400_000);
        await db.collection('users').doc(existingUid).set({ deletionRequestedAt: FieldValue.serverTimestamp(), deletionScheduledAt: scheduledAt }, { merge: true });
      }
      await consumeOauthState(stateRef);
      response.redirect(302, `${publicAppUrl.value().replace(/\/$/, '')}/deletion-confirmed.html`);
      return;
    }
    if (targetUid && existingUid && existingUid !== targetUid) throw new Error('That TikTok account is already linked to another PackProof account.');
    const uid = targetUid ?? existingUid ?? `tiktok:${providerKey.slice(0, 32)}`;

    try {
      await adminAuth.getUser(uid);
      await adminAuth.updateUser(uid, { displayName: profile.display_name?.slice(0, 120), photoURL: profile.avatar_url });
    } catch {
      await adminAuth.createUser({ uid, displayName: profile.display_name?.slice(0, 120) ?? 'TikTok user', photoURL: profile.avatar_url });
    }
    await providerRef.set({ provider: 'tiktok', providerUserHash: providerKey, uid, linkedAt: FieldValue.serverTimestamp() });
    await db.collection('users').doc(uid).set({
      uid,
      displayName: profile.display_name?.slice(0, 120) ?? 'TikTok user',
      photoURL: profile.avatar_url ?? null,
      providers: FieldValue.arrayUnion('tiktok.com'),
      plan: 'FREE',
      moderationState: 'ACTIVE',
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    const customToken = await adminAuth.createCustomToken(uid, { tiktok: true });
    const grant = randomToken(32);
    await db.collection('authGrants').doc(hash(grant)).set({ uid, customToken, used: false, expiresAt: expiresIn(300), createdAt: FieldValue.serverTimestamp() });
    await consumeOauthState(stateRef);
    response.redirect(302, `packproof://auth/tiktok?grant=${encodeURIComponent(grant)}`);
  } catch (error) {
    response.status(400).send(`TikTok sign-in could not be completed. ${error instanceof Error ? error.message : ''}`);
  }
});

async function consumeOauthState(stateRef: DocumentReference): Promise<void> {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(stateRef);
    const data = snap.data();
    if (!snap.exists || data?.used) throw new Error('This TikTok sign-in attempt is no longer usable.');
    tx.update(stateRef, {
      used: true,
      usedAt: FieldValue.serverTimestamp(),
      verifier: FieldValue.delete(),
    });
  });
}

export const redeemTikTokGrant = onCall({ enforceAppCheck: true }, async (request) => {
  requireTikTokEnabled();
  const grant = String((request.data as { grant?: unknown })?.grant ?? '');
  if (grant.length < 20 || grant.length > 160) throw new HttpsError('invalid-argument', 'Invalid sign-in grant.');
  const ref = db.collection('authGrants').doc(hash(grant));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    if (!snap.exists || data?.used || (data?.expiresAt as Timestamp).toMillis() < Date.now()) throw new HttpsError('permission-denied', 'This sign-in grant is invalid or expired.');
    tx.update(ref, { used: true, usedAt: FieldValue.serverTimestamp(), customToken: FieldValue.delete() });
    return { customToken: data!.customToken as string };
  });
});
