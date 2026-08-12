"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Sha256TokenVerifier = void 0;
const node_crypto_1 = require("node:crypto");
class Sha256TokenVerifier {
    verify(token, expectedHash) {
        const actual = (0, node_crypto_1.createHash)('sha256').update(token).digest('hex');
        const left = Buffer.from(actual);
        const right = Buffer.from(expectedHash);
        return left.length === right.length && (0, node_crypto_1.timingSafeEqual)(left, right);
    }
}
exports.Sha256TokenVerifier = Sha256TokenVerifier;
//# sourceMappingURL=sha256-token-verifier.js.map