import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from './config';
import { requireUid } from './helpers';
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  LEGAL_POLICY_EFFECTIVE_DATE,
  legalAcceptanceId,
  parseLegalAcceptanceInput,
} from './legal-policy';

const callOptions = { enforceAppCheck: true } as const;

export const getLegalAcceptanceStatus = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  const id = legalAcceptanceId(uid);
  const snapshot = await db.collection('legalAcceptances').doc(id).get();
  return {
    accepted: snapshot.exists,
    termsVersion: CURRENT_TERMS_VERSION,
    privacyVersion: CURRENT_PRIVACY_VERSION,
    effectiveDate: LEGAL_POLICY_EFFECTIVE_DATE,
  };
});

export const acceptLegalPolicies = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  let input;
  try {
    input = parseLegalAcceptanceInput(request.data);
  } catch (error) {
    throw new HttpsError('invalid-argument', error instanceof Error ? error.message : 'Legal acceptance is invalid.');
  }

  const id = legalAcceptanceId(uid);
  const ref = db.collection('legalAcceptances').doc(id);
  const acceptedAt = Timestamp.now();
  const recordedAt = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists) {
      const existingAcceptedAt = existing.get('acceptedAt');
      return existingAcceptedAt instanceof Timestamp ? existingAcceptedAt : acceptedAt;
    }
    transaction.create(ref, {
      id,
      accountId: uid,
      termsVersion: input.termsVersion,
      privacyVersion: input.privacyVersion,
      policyEffectiveDate: LEGAL_POLICY_EFFECTIVE_DATE,
      appVersion: input.appVersion,
      affirmation: input.affirmation,
      channel: 'ANDROID_CLICKWRAP',
      appId: request.app?.appId ?? null,
      acceptedAt,
    });
    return acceptedAt;
  });
  return {
    accepted: true,
    termsVersion: CURRENT_TERMS_VERSION,
    privacyVersion: CURRENT_PRIVACY_VERSION,
    effectiveDate: LEGAL_POLICY_EFFECTIVE_DATE,
    acceptedAt: recordedAt.toDate().toISOString(),
  };
});
