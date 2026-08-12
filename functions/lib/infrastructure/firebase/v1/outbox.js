"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storedOutboxEvent = storedOutboxEvent;
const firestore_1 = require("firebase-admin/firestore");
function storedOutboxEvent(event) {
    return {
        eventId: event.id,
        schemaVersion: event.schemaVersion,
        type: event.type,
        organizationId: event.organizationId,
        actor: event.actor,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        requestId: event.requestId,
        occurredAt: firestore_1.Timestamp.fromDate(event.occurredAt),
        data: event.data,
        deliveryState: 'PENDING',
        attemptCount: 0,
        createdAt: firestore_1.Timestamp.fromDate(event.occurredAt),
        updatedAt: firestore_1.Timestamp.fromDate(event.occurredAt),
    };
}
//# sourceMappingURL=outbox.js.map