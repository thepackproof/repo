"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirebaseParticipantAuthenticator = void 0;
const core_1 = require("./core");
function participantAuthenticationError() {
    return new core_1.ApiError(401, 'INVALID_PARTICIPANT_AUTHENTICATION', 'A valid PackProof user session and App Check token are required.', [], { 'WWW-Authenticate': 'Bearer realm="PackProof participant API", error="invalid_token"' });
}
class FirebaseParticipantAuthenticator {
    auth;
    appCheck;
    firestore;
    constructor(auth, appCheck, firestore) {
        this.auth = auth;
        this.appCheck = appCheck;
        this.firestore = firestore;
    }
    async authenticate(authorization, appCheckToken) {
        const bearer = authorization ? /^Bearer\s+([^\s]+)$/i.exec(authorization.trim()) : null;
        if (!bearer || !appCheckToken || appCheckToken.length > 8_192)
            throw participantAuthenticationError();
        try {
            const [identity, attestation] = await Promise.all([
                this.auth.verifyIdToken(bearer[1], true),
                this.appCheck.verifyToken(appCheckToken),
            ]);
            if (!identity.uid || !attestation.appId)
                throw participantAuthenticationError();
            const user = await this.firestore.collection('users').doc(identity.uid).get();
            const account = user.data() ?? {};
            if (account.moderationState === 'SUSPENDED') {
                throw new core_1.ApiError(403, 'ACCOUNT_SUSPENDED', 'This PackProof account is suspended.');
            }
            if (account.deletionScheduledAt) {
                throw new core_1.ApiError(409, 'ACCOUNT_DELETION_PENDING', 'Cancel account deletion before claiming or redeeming a PackProof session.');
            }
            return { type: 'PACKPROOF_USER', actorId: identity.uid, appId: attestation.appId };
        }
        catch (error) {
            if (error instanceof core_1.ApiError)
                throw error;
            throw participantAuthenticationError();
        }
    }
}
exports.FirebaseParticipantAuthenticator = FirebaseParticipantAuthenticator;
//# sourceMappingURL=participant-security.js.map