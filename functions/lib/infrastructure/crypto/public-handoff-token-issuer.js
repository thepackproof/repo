"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HmacPublicHandoffTokenIssuer = void 0;
const node_crypto_1 = require("node:crypto");
class HmacPublicHandoffTokenIssuer {
    getSigningSecret;
    constructor(getSigningSecret) {
        this.getSigningSecret = getSigningSecret;
    }
    issue(handoffId) {
        const secret = this.getSigningSecret();
        if (secret.length < 32)
            throw new Error('PUBLIC_HANDOFF_SIGNING_SECRET must contain at least 32 characters.');
        return (0, node_crypto_1.createHmac)('sha256', secret)
            .update(`public-commerce-handoff-token-v1\n${handoffId}`)
            .digest('base64url');
    }
    digest(token) {
        return (0, node_crypto_1.createHash)('sha256').update(token).digest('hex');
    }
}
exports.HmacPublicHandoffTokenIssuer = HmacPublicHandoffTokenIssuer;
//# sourceMappingURL=public-handoff-token-issuer.js.map