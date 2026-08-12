import { randomUUID } from 'node:crypto';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ApplicationError } from '../../application/v1/errors';
import { canonicalize, createTransactionId, sha256 } from './core';
import type {
  AuditEventInput,
  AuditWriter,
  IdempotencyContext,
  IdempotencyExecution,
  IdempotencyStore,
  RateLimitDecision,
  RateLimiter,
  RateLimitPolicy,
} from './ports';

type StoredIdempotencyRecord<T> = {
  requestFingerprint: string;
  state: 'PROCESSING' | 'COMPLETE' | 'FAILED_RETRYABLE';
  operationId: string;
  ownerToken?: string;
  leaseExpiresAt?: Timestamp;
  result?: T;
};

export class FirestoreIdempotencyStore implements IdempotencyStore {
  constructor(
    private readonly firestore: Firestore,
    private readonly leaseSeconds = 30,
  ) {}

  async execute<T extends object>(
    context: IdempotencyContext,
    operation: (operationId: string) => Promise<T>,
  ): Promise<IdempotencyExecution<T>> {
    const recordId = sha256(canonicalize({
      principalId: context.principalId,
      operation: context.operation,
      key: context.key,
    }));
    const ref = this.firestore.collection('apiIdempotencyRecords').doc(recordId);
    const ownerToken = randomUUID();
    const now = Date.now();
    const reservation = await this.firestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.data() as StoredIdempotencyRecord<T> | undefined;
      if (existing && existing.requestFingerprint !== context.requestFingerprint) {
        throw new ApplicationError('CONFLICT', 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used with a materially different request.');
      }
      if (existing?.state === 'COMPLETE' && existing.result) {
        return { replayed: true as const, operationId: existing.operationId, result: existing.result };
      }
      if (existing?.state === 'PROCESSING' && existing.leaseExpiresAt && existing.leaseExpiresAt.toMillis() > now) {
        throw new ApplicationError('RETRYABLE_CONFLICT', 'IDEMPOTENCY_REQUEST_IN_PROGRESS', 'An equivalent request is still being processed.', [], 1);
      }
      const operationId = existing?.operationId ?? createTransactionId();
      tx.set(ref, {
        principalId: context.principalId,
        operation: context.operation,
        keyHash: sha256(context.key),
        requestFingerprint: context.requestFingerprint,
        state: 'PROCESSING',
        operationId,
        ownerToken,
        leaseExpiresAt: Timestamp.fromMillis(now + this.leaseSeconds * 1_000),
        updatedAt: FieldValue.serverTimestamp(),
        ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      }, { merge: true });
      return { replayed: false as const, operationId };
    });
    if (reservation.replayed) {
      return { value: reservation.result, replayed: true, operationId: reservation.operationId };
    }

    try {
      const value = await operation(reservation.operationId);
      await this.firestore.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const record = snap.data() as StoredIdempotencyRecord<T> | undefined;
        if (!record || record.ownerToken !== ownerToken || record.state !== 'PROCESSING') {
          throw new ApplicationError('RETRYABLE_CONFLICT', 'IDEMPOTENCY_LEASE_LOST', 'The idempotent operation lease expired before completion.', [], 1);
        }
        tx.update(ref, {
          state: 'COMPLETE',
          result: value,
          completedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          ownerToken: FieldValue.delete(),
          leaseExpiresAt: FieldValue.delete(),
        });
      });
      return { value, replayed: false, operationId: reservation.operationId };
    } catch (error) {
      // Never downgrade a COMPLETE record if the final commit succeeded but its
      // acknowledgement was lost. Release only the lease still owned here.
      await this.firestore.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const record = snap.data() as StoredIdempotencyRecord<T> | undefined;
        if (record?.state === 'PROCESSING' && record.ownerToken === ownerToken) {
          tx.update(ref, {
            state: 'FAILED_RETRYABLE',
            updatedAt: FieldValue.serverTimestamp(),
            ownerToken: FieldValue.delete(),
            leaseExpiresAt: FieldValue.delete(),
          });
        }
      }).catch(() => undefined);
      throw error;
    }
  }
}

export class FirestoreRateLimiter implements RateLimiter {
  constructor(private readonly firestore: Firestore) {}

  async consume(principalId: string, policy: RateLimitPolicy): Promise<RateLimitDecision> {
    const now = Date.now();
    const windowMs = policy.windowSeconds * 1_000;
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const resetAt = new Date(windowStart + windowMs);
    const id = sha256(`${principalId}\n${policy.name}\n${windowStart}`);
    const ref = this.firestore.collection('apiRateLimits').doc(id);
    return this.firestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const count = Number(snap.data()?.count ?? 0);
      if (count >= policy.limit) {
        return { allowed: false, limit: policy.limit, remaining: 0, resetAt };
      }
      const next = count + 1;
      tx.set(ref, {
        principalId,
        policy: policy.name,
        windowStart: Timestamp.fromMillis(windowStart),
        expiresAt: Timestamp.fromMillis(resetAt.getTime() + windowMs),
        count: next,
      });
      return { allowed: true, limit: policy.limit, remaining: policy.limit - next, resetAt };
    });
  }
}

export class FirestoreAuditWriter implements AuditWriter {
  constructor(private readonly firestore: Firestore) {}

  async append(event: AuditEventInput): Promise<void> {
    const streamRef = this.firestore.collection('apiAuditStreams').doc(event.organizationId);
    const eventRef = streamRef.collection('events').doc(event.eventId);
    await this.firestore.runTransaction(async (tx) => {
      const [existingEvent, streamSnap] = await Promise.all([tx.get(eventRef), tx.get(streamRef)]);
      if (existingEvent.exists) return;
      const sequence = Number(streamSnap.data()?.sequence ?? 0) + 1;
      const previousHash = String(streamSnap.data()?.headHash ?? 'GENESIS');
      const occurredAt = new Date().toISOString();
      const immutablePayload = {
        eventId: event.eventId,
        sequence,
        type: event.type,
        organizationId: event.organizationId,
        actor: {
          type: event.actor.type,
          apiClientId: event.actor.apiClientId,
          credentialId: event.actor.credentialId,
        },
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        requestId: event.requestId,
        occurredAt,
        metadata: event.metadata,
        previousHash,
      };
      const eventHash = sha256(canonicalize(immutablePayload));
      tx.create(eventRef, {
        ...immutablePayload,
        hashAlgorithm: 'SHA-256',
        eventHash,
        recordedAt: FieldValue.serverTimestamp(),
      });
      tx.set(streamRef, {
        organizationId: event.organizationId,
        sequence,
        headHash: eventHash,
        hashAlgorithm: 'SHA-256',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
  }
}
