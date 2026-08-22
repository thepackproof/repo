"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HC1_CLIENT_RETRY = void 0;
exports.retryAfterMs = retryAfterMs;
function retryAfterMs(input) {
    const attempt = Math.max(1, input.attempt);
    if (attempt >= input.maxAttempts) {
        return { attempt, retry: false, delayMs: 0 };
    }
    if (input.serverRetryAfterMs != null && input.serverRetryAfterMs >= 0) {
        return { attempt, retry: true, delayMs: Math.min(input.serverRetryAfterMs, input.maxDelayMs) };
    }
    const exp = Math.min(input.maxDelayMs, input.baseDelayMs * (2 ** (attempt - 1)));
    const random = input.random ?? Math.random;
    const jitter = Math.floor(random() * Math.max(0, input.jitterMs));
    return { attempt, retry: true, delayMs: Math.min(input.maxDelayMs, exp + jitter) };
}
exports.HC1_CLIENT_RETRY = {
    maxAttempts: 6,
    baseDelayMs: 1_000,
    maxDelayMs: 60_000,
    jitterMs: 750,
};
//# sourceMappingURL=retry-policy.js.map