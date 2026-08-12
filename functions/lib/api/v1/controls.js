"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirestoreAuditWriter = exports.FirestoreRateLimiter = exports.FirestoreIdempotencyStore = void 0;
const node_crypto_1 = require("node:crypto");
const firestore_1 = require("firebase-admin/firestore");
const errors_1 = require("../../application/v1/errors");
const core_1 = require("./core");
class FirestoreIdempotencyStore {
    firestore;
    leaseSeconds;
    constructor(firestore, leaseSeconds = 30) {
        this.firestore = firestore;
        this.leaseSeconds = leaseSeconds;
    }
    async execute(context, operation) {
        const recordId = (0, core_1.sha256)((0, core_1.canonicalize)({
            principalId: context.principalId,
            operation: context.operation,
            key: context.key,
        }));
        const ref = this.firestore.collection('apiIdempotencyRecords').doc(recordId);
        const ownerToken = (0, node_crypto_1.randomUUID)();
        const now = Date.now();
        const reservation = await this.firestore.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const existing = snap.data();
            if (existing && existing.requestFingerprint !== context.requestFingerprint) {
                throw new errors_1.ApplicationError('CONFLICT', 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used with a materially different request.');
            }
            if (existing?.state === 'COMPLETE' && existing.result) {
                return { replayed: true, operationId: existing.operationId, result: existing.result };
            }
            if (existing?.state === 'PROCESSING' && existing.leaseExpiresAt && existing.leaseExpiresAt.toMillis() > now) {
                throw new errors_1.ApplicationError('RETRYABLE_CONFLICT', 'IDEMPOTENCY_REQUEST_IN_PROGRESS', 'An equivalent request is still being processed.', [], 1);
            }
            const operationId = existing?.operationId ?? (0, core_1.createTransactionId)();
            tx.set(ref, {
                principalId: context.principalId,
                operation: context.operation,
                keyHash: (0, core_1.sha256)(context.key),
                requestFingerprint: context.requestFingerprint,
                state: 'PROCESSING',
                operationId,
                ownerToken,
                leaseExpiresAt: firestore_1.Timestamp.fromMillis(now + this.leaseSeconds * 1_000),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
                ...(snap.exists ? {} : { createdAt: firestore_1.FieldValue.serverTimestamp() }),
            }, { merge: true });
            return { replayed: false, operationId };
        });
        if (reservation.replayed) {
            return { value: reservation.result, replayed: true, operationId: reservation.operationId };
        }
        try {
            const value = await operation(reservation.operationId);
            await this.firestore.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                const record = snap.data();
                if (!record || record.ownerToken !== ownerToken || record.state !== 'PROCESSING') {
                    throw new errors_1.ApplicationError('RETRYABLE_CONFLICT', 'IDEMPOTENCY_LEASE_LOST', 'The idempotent operation lease expired before completion.', [], 1);
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
    }
}
exports.FirestoreIdempotencyStore = FirestoreIdempotencyStore;
class FirestoreRateLimiter {
    firestore;
    constructor(firestore) {
        this.firestore = firestore;
    }
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