import { randomUUID } from 'node:crypto';
import { FieldValue, Timestamp, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { ApplicationError } from '../../application/v1/errors';
import { canonicalize, createTransactionId, sha256 } from './core';
import type {
  AuditEventInput,
  AuditWriter,
  IdempotencyContext,
  IdempotencyExecution,
  IdempotencyFence,
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
  fenceToken?: number;
  leaseExpiresAt?: Timestamp;
  result?: T;
};

export const DEFAULT_IDEMPOTENCY_LEASE_SECONDS = 120;
export const EVIDENCE_REPORT_IDEMPOTENCY_LEASE_SECONDS = 900;

export function leaseSecondsForOperation(
  operation: string,
  override?: number,
  fallback = DEFAULT_IDEMPOTENCY_LEASE_SECONDS,
): number {
  if (override && Number.isSafeInteger(override) && override > 0) return override;
  if (operation.includes('/reports') || operation.toLowerCase().includes('evidence-report')) {
    return EVIDENCE_REPORT_IDEMPOTENCY_LEASE_SECONDS;
  }
  return fallback;
}

export type IdempotencyAcquirePlan =
  | { type: 'REPLAY'; operationId: string; result: unknown }
  | { type: 'IN_PROGRESS' }
  | { type: 'KEY_REUSED' }
  | { type: 'ACQUIRE'; operationId: string | null; reclaimExpired: boolean };

export function planIdempotencyAcquire(
  existing: {
    requestFingerprint: string;
    state: string;
    operationId: string;
    leaseExpiresAtMs?: number;
    result?: unknown;
  } | undefined,
  requestFingerprint: string,
  nowMs: number,
): IdempotencyAcquirePlan {
  if (existing && existing.requestFingerprint !== requestFingerprint) return { type: 'KEY_REUSED' };
  if (existing?.state === 'COMPLETE' && existing.result) {
    return { type: 'REPLAY', operationId: existing.operationId, result: existing.result };
  }
  if (existing?.state === 'PROCESSING') {
    if (existing.leaseExpiresAtMs && existing.leaseExpiresAtMs > nowMs) return { type: 'IN_PROGRESS' };
    return { type: 'ACQUIRE', operationId: existing.operationId, reclaimExpired: true };
  }
  return { type: 'ACQUIRE', operationId: existing?.operationId ?? null, reclaimExpired: false };
}

export class FirestoreIdempotencyStore implements IdempotencyStore {
  constructor(
    private readonly firestore: Firestore,
    private readonly defaultLeaseSeconds = DEFAULT_IDEMPOTENCY_LEASE_SECONDS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async execute<T extends object>(
    context: IdempotencyContext,
    operation: (operationId: string, fence: IdempotencyFence) => Promise<T>,
  ): Promise<IdempotencyExecution<T>> {
    const recordId = sha256(canonicalize({
      principalId: context.principalId,
      operation: context.operation,
      key: context.key,
    }));
    const ref = this.firestore.collection('apiIdempotencyRecords').doc(recordId);
    const ownerToken = randomUUID();
    const leaseSeconds = leaseSecondsForOperation(context.operation, context.leaseSeconds, this.defaultLeaseSeconds);
    const reservation = await this.firestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.data() as StoredIdempotencyRecord<T> | undefined;
      const plan = planIdempotencyAcquire(
        existing
          ? {
            requestFingerprint: existing.requestFingerprint,
            state: existing.state,
            operationId: existing.operationId,
            leaseExpiresAtMs: existing.leaseExpiresAt?.toMillis(),
            result: existing.result,
          }
          : undefined,
        context.requestFingerprint,
        this.now(),
      );
      if (plan.type === 'KEY_REUSED') {
        throw new ApplicationError('CONFLICT', 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used with a materially different request.');
      }
      if (plan.type === 'REPLAY') {
        return { replayed: true as const, operationId: plan.operationId, result: plan.result as T };
      }
      if (plan.type === 'IN_PROGRESS') {
        throw new ApplicationError('RETRYABLE_CONFLICT', 'IDEMPOTENCY_REQUEST_IN_PROGRESS', 'An equivalent request is still being processed.', [], 1);
      }
      const operationId = plan.operationId ?? createTransactionId();
      const fenceToken = (existing?.fenceToken ?? 0) + 1;
      tx.set(ref, {
        principalId: context.principalId,
        operation: context.operation,
        keyHash: sha256(context.key),
        requestFingerprint: context.requestFingerprint,
        state: 'PROCESSING',
        operationId,
        ownerToken,
        fenceToken,
        leaseSeconds,
        leaseExpiresAt: Timestamp.fromMillis(this.now() + leaseSeconds * 1_000),
        updatedAt: FieldValue.serverTimestamp(),
        ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      }, { merge: true });
      return { replayed: false as const, operationId, fenceToken };
    });
    if (reservation.replayed) {
      return { value: reservation.result, replayed: true, operationId: reservation.operationId };
    }

    const renewEveryMs = Math.max(1_000, Math.floor(leaseSeconds * 1_000 / 3));
    const renewTimer = setInterval(() => {
      void this.renewLease(ref, ownerToken, leaseSeconds);
    }, renewEveryMs);
    renewTimer.unref?.();

    const assertOwned = async (): Promise<void> => {
      const snap = await ref.get();
      const record = snap.data() as StoredIdempotencyRecord<T> | undefined;
      if (!record || record.ownerToken !== ownerToken || record.state !== 'PROCESSING' || record.fenceToken !== reservation.fenceToken) {
        throw new ApplicationError('RETRYABLE_CONFLICT', 'IDEMPOTENCY_LEASE_LOST', 'The idempotent operation lease is no longer owned by this invocation.', [], 1);
      }
    };
    const fence: IdempotencyFence = {
      operationId: reservation.operationId,
      fenceToken: reservation.fenceToken,
      assertOwned,
      runSideEffect: async (_name, effect) => {
        await assertOwned();
        return effect();
      },
    };

    try {
      const value = await operation(reservation.operationId, fence);
      await this.firestore.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const record = snap.data() as StoredIdempotencyRecord<T> | undefined;
        if (!record || record.ownerToken !== ownerToken || record.state !== 'PROCESSING' || record.fenceToken !== reservation.fenceToken) {
          throw new ApplicationError('RETRYABLE_CONFLICT', 'IDEMPOTENCY_LEASE_LOST', 'The idempotent operation lease is no longer owned by this invocation.', [], 1);
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
    } finally {
      clearInterval(renewTimer);
    }
  }

  private async renewLease(
    ref: DocumentReference,
    ownerToken: string,
    leaseSeconds: number,
  ): Promise<void> {
    await this.firestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const record = snap.data() as StoredIdempotencyRecord<unknown> | undefined;
      if (record?.state !== 'PROCESSING' || record.ownerToken !== ownerToken) return;
      tx.update(ref, {
        leaseExpiresAt: Timestamp.fromMillis(this.now() + leaseSeconds * 1_000),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }).catch(() => undefined);
  }
}

export class FirestoreRateLimiter implements RateLimiter {
  constructor(private readonly firestore: Firestore) {}

  // Single-document windows are acceptable at current merchant volume.
  // Partition before enterprise burst scale; see docs/architecture/FIRESTORE_PARTITIONING_V1.md.

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

  // One hash-chain head per organization is the integrity primitive.
  // Time-partition the head before high-volume integrations; see docs/architecture/FIRESTORE_PARTITIONING_V1.md.

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
