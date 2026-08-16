"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.passThroughIdempotencyFence = passThroughIdempotencyFence;
function passThroughIdempotencyFence(operationId, fenceToken = 1) {
    return {
        operationId,
        fenceToken,
        assertOwned: async () => undefined,
        runSideEffect: async (_name, effect) => effect(),
    };
}
//# sourceMappingURL=merchant-ports.js.map