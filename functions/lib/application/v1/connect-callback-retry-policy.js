"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONNECT_CALLBACK_LEASE_SECONDS = exports.CONNECT_CALLBACK_RETRY_BATCH_SIZE = exports.CONNECT_CALLBACK_RETRY_STATUSES = void 0;
exports.isConnectCallbackRetryStatus = isConnectCallbackRetryStatus;
exports.isDueConnectCallback = isDueConnectCallback;
exports.selectDueConnectCallbacks = selectDueConnectCallbacks;
exports.selectDueConnectCallbacksLegacyStatusBatch = selectDueConnectCallbacksLegacyStatusBatch;
exports.CONNECT_CALLBACK_RETRY_STATUSES = ['FAILED', 'PENDING'];
exports.CONNECT_CALLBACK_RETRY_BATCH_SIZE = 20;
exports.CONNECT_CALLBACK_LEASE_SECONDS = 120;
function isConnectCallbackRetryStatus(status) {
    return exports.CONNECT_CALLBACK_RETRY_STATUSES.includes(status);
}
function isDueConnectCallback(record, nowMs) {
    if (!isConnectCallbackRetryStatus(record.status))
        return false;
    if (record.nextAttemptAtMs == null)
        return true;
    return record.nextAttemptAtMs <= nowMs;
}
function selectDueConnectCallbacks(records, nowMs, limit = exports.CONNECT_CALLBACK_RETRY_BATCH_SIZE) {
    return records
        .filter((record) => isDueConnectCallback(record, nowMs))
        .sort((left, right) => (left.nextAttemptAtMs ?? 0) - (right.nextAttemptAtMs ?? 0) || left.id.localeCompare(right.id))
        .slice(0, limit);
}
function selectDueConnectCallbacksLegacyStatusBatch(records, nowMs, limit = exports.CONNECT_CALLBACK_RETRY_BATCH_SIZE) {
    const batch = records.filter((record) => isConnectCallbackRetryStatus(record.status)).slice(0, limit);
    return batch.filter((record) => isDueConnectCallback(record, nowMs));
}
//# sourceMappingURL=connect-callback-retry-policy.js.map