"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redeemTikTokGrant = exports.tiktokAuthCallback = exports.webTikTokDeletionStart = exports.createTikTokAuthSession = void 0;
const node_crypto_1 = require("node:crypto");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const config_1 = require("./config");
const helpers_1 = require("./helpers");
const http_security_1 = require("./http-security");
const tikTokEnabled = process.env.ENABLE_TIKTOK_AUTH === 'true';
const secrets = tikTokEnabled ? [config_1.tikTokClientKey, config_1.tikTokClientSecret] : [];
function requireTikTokEnabled() {
    if (!tikTokEnabled)
        throw new https_1.HttpsError('failed-precondition', 'TikTok sign-in is not enabled for this PackProof environment.');
}
async function buildTikTokAuthorization(targetUid, purpose) {
    requireTikTokEnabled();
    const verifier = (0, node_crypto_1.randomBytes)(48).toString('base64url');
    const challenge = (0, node_crypto_1.createHash)('sha256').update(verifier).digest('base64url');
    const state = (0, helpers_1.randomToken)(32);
    await config_1.db.collection('oauthStates').doc((0, helpers_1.hash)(state)).set({
        provider: 'tiktok', purpose, targetUid, verifier, used: false,
        expiresAt: (0, helpers_1.expiresIn)(600), createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    const params = new URLSearchParams({
        client_key: config_1.tikTokClientKey.value(), response_type: 'code', scope: 'user.info.basic',
        redirect_uri: config_1.tikTokRedirectUri.value(), state, code_challenge: challenge, code_challenge_method: 'S256',
    });
    return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
}
exports.createTikTokAuthSession = (0, https_1.onCall)({ enforceAppCheck: true, secrets }, async (request) => {
    return { authorizationUrl: await buildTikTokAuthorization(request.auth?.uid ?? null, 'APP_AUTH') };
});
exports.webTikTokDeletionStart = (0, https_1.onRequest)({ cors: false, secrets }, async (request, response) => {
    (0, http_security_1.applySecurityHeaders)(response);
    if (!tikTokEnabled) {
        response.status(404).send('TikTok sign-in is not enabled.');
        return;
    }
    if (request.method !== 'GET') {
        response.status(405).send('Method not allowed');
        return;
    }
    response.redirect(302, await buildTikTokAuthorization(null, 'WEB_DELETE'));
});
exports.tiktokAuthCallback = (0, https_1.onRequest)({ cors: false, secrets }, async (request, response) => {
    (0, http_security_1.applySecurityHeaders)(response);
    if (!tikTokEnabled) {
        response.status(404).send('TikTok sign-in is not enabled.');
        return;
    }
    const code = String(request.query.code ?? '');
    const state = String(request.query.state ?? '');
    const stateRef = config_1.db.collection('oauthStates').doc((0, helpers_1.hash)(state));
    const stateData = code && state ? await consumeOauthState(stateRef) : null;
    if (!stateData) {
        response.status(400).send('This TikTok sign-in attempt is invalid or expired. Return to PackProof and try again.');
        return;
    }
    try {
        const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_key: config_1.tikTokClientKey.value(),
                client_secret: config_1.tikTokClientSecret.value(),
                code,
                grant_type: 'authorization_code',
                redirect_uri: config_1.tikTokRedirectUri.value(),
                code_verifier: String(stateData.verifier ?? ''),
            }),
        });
        const token = await tokenResponse.json();
        if (!tokenResponse.ok || !token.access_token || !token.open_id)
            throw new Error('TikTok token exchange failed.');
        const userResponse = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name', {
            headers: { Authorization: `Bearer ${token.access_token}` },
        });
        const userPayload = await userResponse.json();
        const profile = userPayload.data?.user;
        if (!userResponse.ok || !profile?.open_id)
            throw new Error('TikTok profile lookup failed.');
        const providerKey = (0, helpers_1.hash)(`tiktok:${profile.open_id}`);
        const providerRef = config_1.db.collection('providerLinks').doc(providerKey);
        const providerSnap = await providerRef.get();
        const existingUid = providerSnap.data()?.uid;
        const targetUid = stateData.targetUid;
        if (stateData.purpose === 'WEB_DELETE') {
            if (existingUid) {
                const scheduledAt = firestore_1.Timestamp.fromMillis(Date.now() + 7 * 86400_000);
                await config_1.db.collection('users').doc(existingUid).set({ deletionRequestedAt: firestore_1.FieldValue.serverTimestamp(), deletionScheduledAt: scheduledAt }, { merge: true });
            }
            response.redirect(302, `${config_1.publicAppUrl.value().replace(/\/$/, '')}/deletion-confirmed.html`);
            return;
        }
        if (targetUid && existingUid && existingUid !== targetUid)
            throw new Error('That TikTok account is already linked to another PackProof account.');
        const uid = targetUid ?? existingUid ?? `tiktok:${providerKey.slice(0, 32)}`;
        try {
            await config_1.adminAuth.getUser(uid);
            await config_1.adminAuth.updateUser(uid, { displayName: profile.display_name?.slice(0, 120), photoURL: profile.avatar_url });
        }
        catch {
            await config_1.adminAuth.createUser({ uid, displayName: profile.display_name?.slice(0, 120) ?? 'TikTok user', photoURL: profile.avatar_url });
        }
        await providerRef.set({ provider: 'tiktok', providerUserHash: providerKey, uid, linkedAt: firestore_1.FieldValue.serverTimestamp() });
        await config_1.db.collection('users').doc(uid).set({
            uid,
            displayName: profile.display_name?.slice(0, 120) ?? 'TikTok user',
            photoURL: profile.avatar_url ?? null,
            providers: firestore_1.FieldValue.arrayUnion('tiktok.com'),
            plan: 'FREE',
            moderationState: 'ACTIVE',
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        const customToken = await config_1.adminAuth.createCustomToken(uid, { tiktok: true });
        const grant = (0, helpers_1.randomToken)(32);
        await config_1.db.collection('authGrants').doc((0, helpers_1.hash)(grant)).set({ uid, customToken, used: false, expiresAt: (0, helpers_1.expiresIn)(300), createdAt: firestore_1.FieldValue.serverTimestamp() });
        response.redirect(302, `packproof://auth/tiktok?grant=${encodeURIComponent(grant)}`);
    }
    catch {
        response.status(400).send('TikTok sign-in could not be completed. Return to PackProof and try again.');
    }
});
async function consumeOauthState(stateRef) {
    return config_1.db.runTransaction(async (tx) => {
        const snap = await tx.get(stateRef);
        const data = snap.data();
        if (!snap.exists || !data || data.used || data.expiresAt.toMillis() < Date.now())
            return null;
        tx.update(stateRef, {
            used: true,
            usedAt: firestore_1.FieldValue.serverTimestamp(),
            verifier: firestore_1.FieldValue.delete(),
        });
        return data;
    });
}
exports.redeemTikTokGrant = (0, https_1.onCall)({ enforceAppCheck: true }, async (request) => {
    requireTikTokEnabled();
    const grant = String(request.data?.grant ?? '');
    if (grant.length < 20 || grant.length > 160)
        throw new https_1.HttpsError('invalid-argument', 'Invalid sign-in grant.');
    const ref = config_1.db.collection('authGrants').doc((0, helpers_1.hash)(grant));
    return config_1.db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.data();
        if (!snap.exists || data?.used || (data?.expiresAt).toMillis() < Date.now())
            throw new https_1.HttpsError('permission-denied', 'This sign-in grant is invalid or expired.');
        tx.update(ref, { used: true, usedAt: firestore_1.FieldValue.serverTimestamp(), customToken: firestore_1.FieldValue.delete() });
        return { customToken: data.customToken };
    });
});
//# sourceMappingURL=tiktok.js.map