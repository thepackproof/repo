"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirestoreAuditWriter = exports.FirestoreRateLimiter = exports.FirestoreIdempotencyStore = exports.EVIDENCE_REPORT_IDEMPOTENCY_LEASE_SECONDS = exports.DEFAULT_IDEMPOTENCY_LEASE_SECONDS = void 0;
exports.leaseSecondsForOperation = leaseSecondsForOperation;
exports.planIdempotencyAcquire = planIdempotencyAcquire;
const node_crypto_1 = require("node:crypto");
const firestore_1 = require("firebase-admin/firestore");
const errors_1 = require("../../application/v1/errors");
const core_1 = require("./core");
exports.DEFAULT_IDEMPOTENCY_LEASE_SECONDS = 120;
exports.EVIDENCE_REPORT_IDEMPOTENCY_LEASE_SECONDS = 900;
function leaseSecondsForOperation(operation, override, fallback = exports.DEFAULT_IDEMPOTENCY_LEASE_SECONDS) {
    if (override && Number.isSafeInteger(override) && override > 0)
        return override;
    if (operation.includes('/reports') || operation.toLowerCase().includes('evidence-report')) {
        return exports.EVIDENCE_REPORT_IDEMPOTENCY_LEASE_SECONDS;
    }
    return fallback;
}
function planIdempotencyAcquire(existing, requestFingerprint, nowMs) {
    if (existing && existing.requestFingerprint !== requestFingerprint)
        return { type: 'KEY_REUSED' };
    if (existing?.state === 'COMPLETE' && existing.result) {
        return { type: 'REPLAY', operationId: existing.operationId, result: existing.result };
    }
    if (existing?.state === 'PROCESSING') {
        if (existing.leaseExpiresAtMs && existing.leaseExpiresAtMs > nowMs)
            return { type: 'IN_PROGRESS' };
        return { type: 'ACQUIRE', operationId: existing.operationId, reclaimExpired: true };
    }
    return { type: 'ACQUIRE', operationId: existing?.operationId ?? null, reclaimExpired: false };
}
class FirestoreIdempotencyStore {
    firestore;
    defaultLeaseSeconds;
    now;
    constructor(firestore, defaultLeaseSeconds = exports.DEFAULT_IDEMPOTENCY_LEASE_SECONDS, now = () => Date.now()) {
        this.firestore = firestore;
        this.defaultLeaseSeconds = defaultLeaseSeconds;
        this.now = now;
    }
    async execute(context, operation) {
        const recordId = (0, core_1.sha256)((0, core_1.canonicalize)({
            principalId: context.principalId,
            operation: context.operation,
            key: context.key,
        }));
        const ref = this.firestore.collection('apiIdempotencyRecords').doc(recordId);
        const ownerToken = (0, node_crypto_1.randomUUID)();
        const leaseSeconds = leaseSecondsForOperation(context.operation, context.leaseSeconds, this.defaultLeaseSeconds);
        const reservation = await this.firestore.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const existing = snap.data();
            const plan = planIdempotencyAcquire(existing
                ? {
                    requestFingerprint: existing.requestFingerprint,
                    state: existing.state,
                    operationId: existing.operationId,
                    leaseExpiresAtMs: existing.leaseExpiresAt?.toMillis(),
                    result: existing.result,
                }
                : undefined, context.requestFingerprint, this.now());
            if (plan.type === 'KEY_REUSED') {
                throw new errors_1.ApplicationError('CONFLICT', 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used with a materially different request.');
            }
            if (plan.type === 'REPLAY') {
                return { replayed: true, operationId: plan.operationId, result: plan.result };
            }
            if (plan.type === 'IN_PROGRESS') {
                throw new errors_1.ApplicationError('RETRYABLE_CONFLICT', 'IDEMPOTENCY_REQUEST_IN_PROGRESS', 'An equivalent request is still being processed.', [], 1);
            }
            const operationId = plan.operationId ?? (0, core_1.createTransactionId)();
            const fenceToken = (existing?.fenceToken ?? 0) + 1;
            tx.set(ref, {
                principalId: context.principalId,
                operation: context.operation,
                keyHash: (0, core_1.sha256)(context.key),
                requestFingerprint: context.requestFingerprint,
                state: 'PROCESSING',
                operationId,
                ownerToken,
                fenceToken,
                leaseSeconds,
                leaseExpiresAt: firestore_1.Timestamp.fromMillis(this.now() + leaseSeconds * 1_000),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
                ...(snap.exists ? {} : { createdAt: firestore_1.FieldValue.serverTimestamp() }),
            }, { merge: true });
            return { replayed: false, operationId };
        });
        if (reservation.replayed) {
            return { value: reservation.result, replayed: true, operationId: reservation.operationId };
        }
        const renewEveryMs = Math.max(1_000, Math.floor(leaseSeconds * 1_000 / 3));
        const renewTimer = setInterval(() => {
            void this.renewLease(ref, ownerToken, leaseSeconds);
        }, renewEveryMs);
        renewTimer.unref?.();
        try {
            const value = await operation(reservation.operationId);
            await this.firestore.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                const record = snap.data();
                if (!record || record.ownerToken !== ownerToken || record.state !== 'PROCESSING') {
                    throw new errors_1.ApplicationError('RETRYABLE_CONFLICT', 'IDEMPOTENCY_LEASE_LOST', 'The idempotent operation lease is no longer owned by this invocation.', [], 1);
                }
                tx.update(ref, {
                    state: 'COMPLETE',
                    result: value,
                    completedAt: firestore_1.FieldValue.serverTimestamp(),
                    updatedAt: firestore_1.FieldValue.serverTimestamp(),
                    ownerToken: firestore_1.FieldValue.delete(),
                    leaseExpiresAt: firestore_1.FieldValue.delete(),
                });
            });
            return { value, replayed: false, operationId: reservation.operationId };
        }
        catch (error) {
            // Never downgrade a COMPLETE record if the final commit succeeded but its
            // acknowledgement was lost. Release only the lease still owned here.
            await this.firestore.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                const record = snap.data();
                if (record?.state === 'PROCESSING' && record.ownerToken === ownerToken) {
                    tx.update(ref, {
                        state: 'FAILED_RETRYABLE',
                        updatedAt: firestore_1.FieldValue.serverTimestamp(),
                        ownerToken: firestore_1.FieldValue.delete(),
                        leaseExpiresAt: firestore_1.FieldValue.delete(),
                    });
                }
            }).catch(() => undefined);
            throw error;
        }
        finally {
            clearInterval(renewTimer);
        }
    }
    async renewLease(ref, ownerToken, leaseSeconds) {
        await this.firestore.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const record = snap.data();
            if (record?.state !== 'PROCESSING' || record.ownerToken !== ownerToken)
                return;
            tx.update(ref, {
                leaseExpiresAt: firestore_1.Timestamp.fromMillis(this.now() + leaseSeconds * 1_000),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }).catch(() => undefined);
    }
}
exports.FirestoreIdempotencyStore = FirestoreIdempotencyStore;
class FirestoreRateLimiter {
    firestore;
    constructor(firestore) {
        this.firestore = firestore;
    }
    // Single-document windows are acceptable at current merchant volume.
    // Partition before enterprise burst scale; see docs/architecture/FIRESTORE_PARTITIONING_V1.md.
    async consume(principalId, policy) {
        const now = Date.now();
        const windowMs = policy.windowSeconds * 1_000;
        const windowStart = Math.floor(now / windowMs) * windowMs;
        const resetAt = new Date(windowStart + windowMs);
        const id = (0, core_1.sha256)(`${principalId}\n${policy.name}\n${windowStart}`);
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
                windowStart: firestore_1.Timestamp.fromMillis(windowStart),
                expiresAt: firestore_1.Timestamp.fromMillis(resetAt.getTime() + windowMs),
                count: next,
            });
            return { allowed: true, limit: policy.limit, remaining: policy.limit - next, resetAt };
        });
    }
}
exports.FirestoreRateLimiter = FirestoreRateLimiter;
class FirestoreAuditWriter {
    firestore;
    constructor(firestore) {
        this.firestore = firestore;
    }
    // One hash-chain head per organization is the integrity primitive.
    // Time-partition the head before high-volume integrations; see docs/architecture/FIRESTORE_PARTITIONING_V1.md.
    async append(event) {
        const streamRef = this.firestore.collection('apiAuditStreams').doc(event.organizationId);
        const eventRef = streamRef.collection('events').doc(event.eventId);
        await this.firestore.runTransaction(async (tx) => {
            const [existingEvent, streamSnap] = await Promise.all([tx.get(eventRef), tx.get(streamRef)]);
            if (existingEvent.exists)
                return;
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
            const eventHash = (0, core_1.sha256)((0, core_1.canonicalize)(immutablePayload));
            tx.create(eventRef, {
                ...immutablePayload,
                hashAlgorithm: 'SHA-256',
                eventHash,
                recordedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            tx.set(streamRef, {
                organizationId: event.organizationId,
                sequence,
                headHash: eventHash,
                hashAlgorithm: 'SHA-256',
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
        });
    }
}
exports.FirestoreAuditWriter = FirestoreAuditWriter;
//# sourceMappingURL=controls.js.map