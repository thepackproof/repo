"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirebasePortalAuthenticator = void 0;
const core_1 = require("./core");
function portalAuthenticationError() {
    return new core_1.ApiError(401, 'INVALID_PORTAL_AUTHENTICATION', 'A valid PackProof user session and App Check token are required.', [], { 'WWW-Authenticate': 'Bearer realm="PackProof portal API", error="invalid_token"' });
}
class FirebasePortalAuthenticator {
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
            throw portalAuthenticationError();
        try {
            const identity = await this.auth.verifyIdToken(bearer[1], true);
            if (!identity.uid)
                throw portalAuthenticationError();
            let appId = 'emulator';
            if (process.env.FUNCTIONS_EMULATOR === 'true') {
                appId = 'emulator';
            }
            else {
                const attestation = await this.appCheck.verifyToken(appCheckToken);
                if (!attestation.appId)
                    throw portalAuthenticationError();
                appId = attestation.appId;
            }
            const user = await this.firestore.collection('users').doc(identity.uid).get();
            const account = user.data() ?? {};
            if (account.moderationState === 'SUSPENDED') {
                throw new core_1.ApiError(403, 'ACCOUNT_SUSPENDED', 'This PackProof account is suspended.');
            }
            if (account.deletionScheduledAt) {
                throw new core_1.ApiError(409, 'ACCOUNT_DELETION_PENDING', 'Cancel account deletion before using the PackProof portal.');
            }
            return { type: 'PORTAL_USER', actorId: identity.uid, appId, channel: 'WEB_PORTAL' };
        }
        catch (error) {
            if (error instanceof core_1.ApiError)
                throw error;
            throw portalAuthenticationError();
        }
    }
}
exports.FirebasePortalAuthenticator = FirebasePortalAuthenticator;
//# sourceMappingURL=portal-security.js.map