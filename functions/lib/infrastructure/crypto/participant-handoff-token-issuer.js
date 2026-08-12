"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HmacParticipantHandoffTokenIssuer = void 0;
const node_crypto_1 = require("node:crypto");
const tokenPrefix = {
    'participant-claim': 'pp_claim_v1_',
    'evidence-session': 'pp_capture_v1_',
};
class HmacParticipantHandoffTokenIssuer {
    secret;
    constructor(secret) {
        this.secret = secret;
    }
    issue(purpose, resourceId) {
        const secret = this.secret();
        if (secret.length < 32)
            throw new Error('PARTICIPANT_HANDOFF_SIGNING_SECRET is not configured.');
        const mac = (0, node_crypto_1.createHmac)('sha256', secret)
            .update(`packproof-${purpose}-token-v1\n${resourceId}`)
            .digest('base64url');
        return `${tokenPrefix[purpose]}${mac}`;
    }
    digest(token) {
        return (0, node_crypto_1.createHash)('sha256').update(token, 'utf8').digest('hex');
    }
    verify(token, expectedDigest) {
        const actual = Buffer.from(this.digest(token), 'hex');
        const expected = /^[a-f0-9]{64}$/.test(expectedDigest) ? Buffer.from(expectedDigest, 'hex') : Buffer.alloc(0);
        return actual.length === expected.length && (0, node_crypto_1.timingSafeEqual)(actual, expected);
    }
}
exports.HmacParticipantHandoffTokenIssuer = HmacParticipantHandoffTokenIssuer;
//# sourceMappingURL=participant-handoff-token-issuer.js.map