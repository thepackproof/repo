"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.acceptLegalPolicies = exports.getLegalAcceptanceStatus = void 0;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const config_1 = require("./config");
const helpers_1 = require("./helpers");
const legal_policy_1 = require("./legal-policy");
const callOptions = { enforceAppCheck: true };
exports.getLegalAcceptanceStatus = (0, https_1.onCall)(callOptions, async (request) => {
    const uid = (0, helpers_1.requireUid)(request);
    const id = (0, legal_policy_1.legalAcceptanceId)(uid);
    const snapshot = await config_1.db.collection('legalAcceptances').doc(id).get();
    return {
        accepted: snapshot.exists,
        termsVersion: legal_policy_1.CURRENT_TERMS_VERSION,
        privacyVersion: legal_policy_1.CURRENT_PRIVACY_VERSION,
        effectiveDate: legal_policy_1.LEGAL_POLICY_EFFECTIVE_DATE,
    };
});
exports.acceptLegalPolicies = (0, https_1.onCall)(callOptions, async (request) => {
    const uid = (0, helpers_1.requireUid)(request);
    let input;
    try {
        input = (0, legal_policy_1.parseLegalAcceptanceInput)(request.data);
    }
    catch (error) {
        throw new https_1.HttpsError('invalid-argument', error instanceof Error ? error.message : 'Legal acceptance is invalid.');
    }
    const id = (0, legal_policy_1.legalAcceptanceId)(uid);
    const ref = config_1.db.collection('legalAcceptances').doc(id);
    const acceptedAt = firestore_1.Timestamp.now();
    const recordedAt = await config_1.db.runTransaction(async (transaction) => {
        const existing = await transaction.get(ref);
        if (existing.exists) {
            const existingAcceptedAt = existing.get('acceptedAt');
            return existingAcceptedAt instanceof firestore_1.Timestamp ? existingAcceptedAt : acceptedAt;
        }
        transaction.create(ref, {
            id,
            accountId: uid,
            termsVersion: input.termsVersion,
            privacyVersion: input.privacyVersion,
            policyEffectiveDate: legal_policy_1.LEGAL_POLICY_EFFECTIVE_DATE,
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
        termsVersion: legal_policy_1.CURRENT_TERMS_VERSION,
        privacyVersion: legal_policy_1.CURRENT_PRIVACY_VERSION,
        effectiveDate: legal_policy_1.LEGAL_POLICY_EFFECTIVE_DATE,
        acceptedAt: recordedAt.toDate().toISOString(),
    };
});
//# sourceMappingURL=legal-acceptance.js.map