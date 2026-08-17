"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PACKPROOF_SECURITY_HEADERS = void 0;
exports.applySecurityHeaders = applySecurityHeaders;
exports.constantTimeSecretEquals = constantTimeSecretEquals;
exports.requestIp = requestIp;
const node_crypto_1 = require("node:crypto");
exports.PACKPROOF_SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};
function applySecurityHeaders(response) {
    for (const [name, value] of Object.entries(exports.PACKPROOF_SECURITY_HEADERS)) {
        response.setHeader(name, value);
    }
}
function constantTimeSecretEquals(provided, expected) {
    if (!expected || expected.length < 16)
        return false;
    const digest = (value) => (0, node_crypto_1.createHmac)('sha256', 'packproof-secret-compare-v1').update(value, 'utf8').digest();
    return (0, node_crypto_1.timingSafeEqual)(digest(provided), digest(expected));
}
function requestIp(request) {
    return typeof request.ip === 'string' && request.ip.trim() ? request.ip.trim() : 'unavailable';
}
//# sourceMappingURL=http-security.js.map