"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeOperationLog = writeOperationLog;
exports.withOperationLog = withOperationLog;
function writeOperationLog(entry) {
    const payload = {
        schemaVersion: 1,
        ...entry,
        at: new Date().toISOString(),
    };
    if (entry.result === 'ERROR') {
        console.error(JSON.stringify(payload));
        return;
    }
    console.info(JSON.stringify(payload));
}
async function withOperationLog(operation, work, extras = {}) {
    const started = Date.now();
    try {
        const value = await work();
        writeOperationLog({ ...extras, operation, durationMs: Date.now() - started, result: 'OK' });
        return value;
    }
    catch (error) {
        writeOperationLog({
            ...extras,
            operation,
            durationMs: Date.now() - started,
            result: 'ERROR',
            errorClass: error instanceof Error ? error.name : 'unknown',
        });
        throw error;
    }
}
//# sourceMappingURL=operation-log.js.map