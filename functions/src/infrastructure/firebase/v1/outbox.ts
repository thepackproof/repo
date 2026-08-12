import { Timestamp, type DocumentData } from 'firebase-admin/firestore';
import type { ApplicationEvent } from '../../../application/v1/events';

export function storedOutboxEvent(event: ApplicationEvent): DocumentData {
  return {
    eventId: event.id,
    schemaVersion: event.schemaVersion,
    type: event.type,
    organizationId: event.organizationId,
    actor: event.actor,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    requestId: event.requestId,
    occurredAt: Timestamp.fromDate(event.occurredAt),
    data: event.data,
    deliveryState: 'PENDING',
    attemptCount: 0,
    createdAt: Timestamp.fromDate(event.occurredAt),
    updatedAt: Timestamp.fromDate(event.occurredAt),
  };
}
