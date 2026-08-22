"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordVisibleToActor = recordVisibleToActor;
exports.recordsVisibleToActor = recordsVisibleToActor;
exports.merchantCanAccessTransaction = merchantCanAccessTransaction;
function recordVisibleToActor(record, actorId) {
    if (!record || !actorId)
        return null;
    return record.participantIds.includes(actorId) ? record : null;
}
function recordsVisibleToActor(records, actorId) {
    return records.filter((record) => recordVisibleToActor(record, actorId) !== null);
}
function merchantCanAccessTransaction(transaction, principal) {
    if (!transaction)
        return false;
    if (transaction.organizationId && transaction.organizationId === principal.organizationId)
        return true;
    if (transaction.integrationId && principal.integrationId && transaction.integrationId === principal.integrationId) {
        return true;
    }
    return false;
}
//# sourceMappingURL=authorization-boundary.js.map