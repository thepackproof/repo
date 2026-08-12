"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HmacConnectSessionTokenIssuer = void 0;
const node_crypto_1 = require("node:crypto");
class HmacConnectSessionTokenIssuer {
    issue(sessionId, signingSecret) {
        return (0, node_crypto_1.createHmac)('sha256', signingSecret)
            .update(`connect-session-token-v1\n${sessionId}`)
            .digest('base64url');
    }
    digest(token) {
        return (0, node_crypto_1.createHash)('sha256').update(token).digest('hex');
    }
}
exports.HmacConnectSessionTokenIssuer = HmacConnectSessionTokenIssuer;
//# sourceMappingURL=connect-session-token-issuer.js.map