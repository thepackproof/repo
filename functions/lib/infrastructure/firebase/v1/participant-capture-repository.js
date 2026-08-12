"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirestoreParticipantCaptureRepository = void 0;
const firestore_1 = require("firebase-admin/firestore");
const errors_1 = require("../../../application/v1/errors");
const evidence_1 = require("../../../domain/v1/evidence");
const transactions_1 = require("../../../domain/v1/transactions");
const merchant_transaction_service_1 = require("../../../application/v1/merchant-transaction-service");
const outbox_1 = require("./outbox");
function date(value, field) {
    if (!(value instanceof firestore_1.Timestamp))
        throw new Error(`Persisted participant/capture resource has invalid ${field}.`);
    return value.toDate();
}
function requiredString(value, field) {
    if (typeof value !== 'string' || !value)
        throw new Error(`Persisted participant/capture resource has invalid ${field}.`);
    return value;
}
function optionalString(value) {
    return typeof value === 'string' && value ? value : null;
}
function storedClaim(claim) {
    return {
        ...claim,
        expiresAt: firestore_1.Timestamp.fromDate(new Date(claim.expiresAt)),
        claimedAt: claim.claimedAt ? firestore_1.Timestamp.fromDate(new Date(claim.claimedAt)) : null,
        createdAt: firestore_1.Timestamp.fromDate(new Date(claim.createdAt)),
        updatedAt: firestore_1.Timestamp.fromDate(new Date(claim.updatedAt)),
    };
}
function claimDto(id, data) {
    return transactions_1.participantClaimDtoSchema.parse({
        id,
        object: data.object,
        schemaVersion: data.schemaVersion,
        transactionId: data.transactionId,
        role: data.role,
        status: data.status,
        expiresAt: date(data.expiresAt, 'participantClaim.expiresAt').toISOString(),
        claimedAt: data.claimedAt instanceof firestore_1.Timestamp ? data.claimedAt.toDate().toISOString() : null,
        createdAt: date(data.createdAt, 'participantClaim.createdAt').toISOString(),
        updatedAt: date(data.updatedAt, 'participantClaim.updatedAt').toISOString(),
    });
}
function storedEvidenceSession(session) {
    return {
        ...session,
        expiresAt: firestore_1.Timestamp.fromDate(new Date(session.expiresAt)),
        startedAt: session.startedAt ? firestore_1.Timestamp.fromDate(new Date(session.startedAt)) : null,
        completedAt: session.completedAt ? firestore_1.Timestamp.fromDate(new Date(session.completedAt)) : null,
        createdAt: firestore_1.Timestamp.fromDate(new Date(session.createdAt)),
        updatedAt: firestore_1.Timestamp.fromDate(new Date(session.updatedAt)),
    };
}
function evidenceSessionDto(id, data) {
    return evidence_1.evidenceSessionDtoSchema.parse({
        id,
        object: data.object,
        schemaVersion: data.schemaVersion,
        transactionId: data.transactionId,
        commerceContextId: data.commerceContextId,
        returnPassportId: data.returnPassportId,
        actorRole: data.actorRole,
        type: data.type,
        protocolVersion: data.protocolVersion,
        allowedArtifactTypes: data.allowedArtifactTypes,
        status: data.status,
        captureState: data.captureState,
        syncState: data.syncState,
        processingState: data.processingState,
        maximumRedemptions: data.maximumRedemptions,
        redemptionCount: data.redemptionCount,
        requestedEvidenceCount: data.requestedEvidenceCount,
        captureProfileId: data.captureProfileId,
        captureGroupId: data.captureGroupId,
        expiresAt: date(data.expiresAt, 'evidenceSession.expiresAt').toISOString(),
        startedAt: data.startedAt instanceof firestore_1.Timestamp ? data.startedAt.toDate().toISOString() : null,
        completedAt: data.completedAt instanceof firestore_1.Timestamp ? data.completedAt.toDate().toISOString() : null,
        createdAt: date(data.createdAt, 'evidenceSession.createdAt').toISOString(),
        updatedAt: date(data.updatedAt, 'evidenceSession.updatedAt').toISOString(),
    });
}
function claimSnapshot(id, data) {
    return {
        claim: claimDto(id, data),
        organizationId: requiredString(data.organizationId, 'participantClaim.organizationId'),
        externalReferenceHash: requiredString(data.externalReferenceHash, 'participantClaim.externalReferenceHash'),
        tokenHash: optionalString(data.tokenHash),
        claimedActorId: optionalString(data.claimedActorId),
    };
}
function sessionSnapshot(id, data) {
    return {
        session: evidenceSessionDto(id, data),
        organizationId: requiredString(data.organizationId, 'evidenceSession.organizationId'),
        actorId: requiredString(data.actorId, 'evidenceSession.actorId'),
        participantClaimId: requiredString(data.participantClaimId, 'evidenceSession.participantClaimId'),
        tokenHash: optionalString(data.redemptionTokenHash),
    };
}
function captureSession(id, data) {
    const allowedEvidenceTypes = data.allowedEvidenceTypes;
    if (!Array.isArray(allowedEvidenceTypes) || allowedEvidenceTypes.some((entry) => typeof entry !== 'string')) {
        throw new Error('Persisted capture session has invalid allowedEvidenceTypes.');
    }
    return {
        id,
        evidenceSessionId: requiredString(data.evidenceSessionId, 'captureSession.evidenceSessionId'),
        uid: requiredString(data.uid, 'captureSession.uid'),
        transactionId: requiredString(data.transactionId, 'captureSession.transactionId'),
        nonce: requiredString(data.nonce, 'captureSession.nonce'),
        appId: requiredString(data.appId, 'captureSession.appId'),
        sessionMode: data.sessionMode === 'BATCH' ? 'BATCH' : 'SINGLE',
        maxEvidenceCount: Number(data.maxEvidenceCount),
        captureProfileId: optionalString(data.captureProfileId),
        captureGroupId: optionalString(data.captureGroupId),
        allowedEvidenceTypes: allowedEvidenceTypes,
        issuedAt: date(data.issuedAt, 'captureSession.issuedAt'),
        captureWindowEndsAt: date(data.captureWindowEndsAt, 'captureSession.captureWindowEndsAt'),
        redemptionExpiresAt: date(data.redemptionExpiresAt, 'captureSession.redemptionExpiresAt'),
        runtimeArtifactHash: optionalString(data.runtimeArtifactHash),
        operationKeyHash: requiredString(data.operationKeyHash, 'captureSession.operationKeyHash'),
    };
}
function transactionCommerceContextId(data) {
    return optionalString(data.commerceContextId) ?? optionalString(data.source?.commerceContextId);
}
class FirestoreParticipantCaptureRepository {
    firestore;
    constructor(firestore) {
        this.firestore = firestore;
    }
    async findTransactionForOrganization(transactionId, organizationId) {
        const snap = await this.firestore.collection('transactions').doc(transactionId).get();
        const data = snap.data();
        if (!snap.exists || !data || data.sourceType !== 'MERCHANT_API' || data.organizationId !== organizationId)
            return null;
        const rawParticipants = Array.isArray(data.apiParticipants) ? data.apiParticipants : [];
        const participantReferences = rawParticipants.map((entry) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry))
                throw new Error('Persisted transaction has invalid apiParticipants.');
            const participant = entry;
            return {
                role: requiredString(participant.role, 'apiParticipants.role'),
                externalReference: requiredString(participant.externalReference, 'apiParticipants.externalReference'),
            };
        });
        const rawRequirements = data.captureRequirements?.requiredArtifactTypes;
        if (!Array.isArray(rawRequirements) || rawRequirements.some((entry) => typeof entry !== 'string')) {
            throw new Error('Persisted transaction has invalid capture requirements.');
        }
        return {
            id: snap.id,
            organizationId,
            status: requiredString(data.apiStatus, 'apiStatus'),
            commerceContextId: transactionCommerceContextId(data),
            participantReferences,
            requiredArtifactTypes: rawRequirements,
        };
    }
    async createOrReplayInvitation(mutation) {
        const claimRef = this.firestore.collection('participantClaims').doc(mutation.claim.id);
        const transactionRef = this.firestore.collection('transactions').doc(mutation.claim.transactionId);
        const outboxRef = this.firestore.collection('domainOutbox').doc(mutation.event.id);
        return this.firestore.runTransaction(async (tx) => {
            const [claim, transaction, outbox] = await Promise.all([tx.get(claimRef), tx.get(transactionRef), tx.get(outboxRef)]);
            const transactionData = transaction.data();
            if (!transaction.exists || !transactionData || transactionData.sourceType !== 'MERCHANT_API'
                || transactionData.organizationId !== mutation.organizationId) {
                throw new errors_1.ApplicationError('NOT_FOUND', 'TRANSACTION_NOT_FOUND', 'The requested transaction was not found.');
            }
            if (claim.exists) {
                const data = claim.data();
                if (data.requestFingerprint !== mutation.requestFingerprint) {
                    throw new errors_1.ApplicationError('CONFLICT', 'IDEMPOTENCY_KEY_REUSED', 'This idempotency key was already used with a different participant invitation.');
                }
                if (data.organizationId !== mutation.organizationId || data.transactionId !== mutation.claim.transactionId) {
                    throw new Error('Persisted participant claim conflicts with its derived identity.');
                }
                if (!outbox.exists)
                    tx.create(outboxRef, (0, outbox_1.storedOutboxEvent)(mutation.event));
                return { created: false, claim: claimDto(claim.id, data) };
            }
            tx.create(claimRef, {
                ...storedClaim(mutation.claim),
                organizationId: mutation.organizationId,
                externalReferenceHash: mutation.externalReferenceHash,
                tokenHash: mutation.tokenHash,
                claimedActorId: null,
                operationKeyHash: (0, merchant_transaction_service_1.sha256)(mutation.operationKey),
                requestFingerprint: mutation.requestFingerprint,
            });
            tx.set(transactionRef, {
                participantClaimStates: { [mutation.claim.role]: { claimId: mutation.claim.id, status: 'ISSUED' } },
                updatedAt: firestore_1.Timestamp.fromDate(mutation.event.occurredAt),
            }, { merge: true });
            if (!outbox.exists)
                tx.create(outboxRef, (0, outbox_1.storedOutboxEvent)(mutation.event));
            return { created: true, claim: mutation.claim };
        });
    }
    async claimParticipant(claimId, decide) {
        const claimRef = this.firestore.collection('participantClaims').doc(claimId);
        return this.firestore.runTransaction(async (tx) => {
            const claimDocument = await tx.get(claimRef);
            const snapshot = claimDocument.exists ? claimSnapshot(claimDocument.id, claimDocument.data()) : null;
            const decision = decide(snapshot);
            if (decision.type === 'REPLAY')
                return decision.result;
            if (!snapshot)
                throw new Error('Participant claim decision requires an existing claim.');
            const transactionRef = this.firestore.collection('transactions').doc(snapshot.claim.transactionId);
            const transaction = await tx.get(transactionRef);
            const transactionData = transaction.data();
            if (!transaction.exists || !transactionData || transactionData.organizationId !== snapshot.organizationId) {
                throw new Error('Participant claim references a missing or inconsistent transaction.');
            }
            const actorField = snapshot.claim.role === 'SELLER' ? 'sellerId'
                : snapshot.claim.role === 'BUYER' || snapshot.claim.role === 'RECEIVER' ? 'buyerId'
                    : null;
            if (actorField && transactionData[actorField] && transactionData[actorField] !== decision.actorId) {
                throw new errors_1.ApplicationError('CONFLICT', 'TRANSACTION_ROLE_ALREADY_CLAIMED', 'This transaction role belongs to another PackProof account.');
            }
            const claimedAt = decision.event.occurredAt;
            const outboxRef = this.firestore.collection('domainOutbox').doc(decision.event.id);
            const timelineRef = transactionRef.collection('events').doc(decision.event.id);
            const [outbox, timeline] = await Promise.all([tx.get(outboxRef), tx.get(timelineRef)]);
            tx.update(claimRef, {
                status: 'CLAIMED',
                claimedActorId: decision.actorId,
                claimedAt: firestore_1.Timestamp.fromDate(claimedAt),
                updatedAt: firestore_1.Timestamp.fromDate(claimedAt),
                tokenHash: firestore_1.FieldValue.delete(),
            });
            tx.set(transactionRef, {
                ...(actorField ? { [actorField]: decision.actorId } : {}),
                participantIds: firestore_1.FieldValue.arrayUnion(decision.actorId),
                participantBindings: {
                    [snapshot.claim.role]: {
                        claimId: snapshot.claim.id,
                        actorId: decision.actorId,
                        externalReferenceHash: snapshot.externalReferenceHash,
                        claimState: 'CLAIMED',
                        claimedAt: firestore_1.Timestamp.fromDate(claimedAt),
                    },
                },
                participantClaimStates: { [snapshot.claim.role]: { claimId: snapshot.claim.id, status: 'CLAIMED' } },
                apiStatus: transactionData.apiStatus === 'CREATED' ? 'CAPTURE_PENDING' : transactionData.apiStatus,
                updatedAt: firestore_1.Timestamp.fromDate(claimedAt),
            }, { merge: true });
            if (!timeline.exists) {
                tx.create(timelineRef, {
                    actorId: decision.actorId,
                    type: 'PARTICIPANT_CLAIMED',
                    summary: `Authenticated participant claimed the ${snapshot.claim.role.toLowerCase()} role.`,
                    metadata: { participantClaimId: snapshot.claim.id, role: snapshot.claim.role, schemaVersion: 1 },
                    createdAt: firestore_1.Timestamp.fromDate(claimedAt),
                });
            }
            if (!outbox.exists)
                tx.create(outboxRef, (0, outbox_1.storedOutboxEvent)(decision.event));
            const claimed = transactions_1.participantClaimDtoSchema.parse({
                ...snapshot.claim,
                status: 'CLAIMED',
                claimedAt: claimedAt.toISOString(),
                updatedAt: claimedAt.toISOString(),
            });
            return { claim: claimed, transactionId: claimed.transactionId, role: claimed.role, replayed: false };
        });
    }
    async findClaimForOrganization(claimId, organizationId) {
        const snap = await this.firestore.collection('participantClaims').doc(claimId).get();
        if (!snap.exists || snap.data()?.organizationId !== organizationId)
            return null;
        return claimSnapshot(snap.id, snap.data());
    }
    async createOrReplayEvidenceSession(mutation) {
        const sessionRef = this.firestore.collection('evidenceSessions').doc(mutation.session.id);
        const claimRef = this.firestore.collection('participantClaims').doc(mutation.participantClaimId);
        const transactionRef = this.firestore.collection('transactions').doc(mutation.session.transactionId);
        const outboxRef = this.firestore.collection('domainOutbox').doc(mutation.event.id);
        return this.firestore.runTransaction(async (tx) => {
            const [session, claim, transaction, outbox] = await Promise.all([
                tx.get(sessionRef), tx.get(claimRef), tx.get(transactionRef), tx.get(outboxRef),
            ]);
            if (session.exists) {
                const data = session.data();
                if (data.requestFingerprint !== mutation.requestFingerprint) {
                    throw new errors_1.ApplicationError('CONFLICT', 'IDEMPOTENCY_KEY_REUSED', 'This idempotency key was already used with a different evidence-session request.');
                }
                if (data.organizationId !== mutation.organizationId || data.participantClaimId !== mutation.participantClaimId) {
                    throw new Error('Persisted evidence session conflicts with its derived identity.');
                }
                if (!outbox.exists)
                    tx.create(outboxRef, (0, outbox_1.storedOutboxEvent)(mutation.event));
                return { created: false, session: evidenceSessionDto(session.id, data) };
            }
            const claimData = claim.data();
            const transactionData = transaction.data();
            if (!claim.exists || !claimData || claimData.organizationId !== mutation.organizationId
                || claimData.transactionId !== mutation.session.transactionId || claimData.status !== 'CLAIMED'
                || claimData.claimedActorId !== mutation.actorId) {
                throw new errors_1.ApplicationError('FAILED_PRECONDITION', 'PARTICIPANT_NOT_CLAIMED', 'The participant claim is not currently bound to the intended actor.');
            }
            if (!transaction.exists || !transactionData || transactionData.organizationId !== mutation.organizationId) {
                throw new errors_1.ApplicationError('NOT_FOUND', 'TRANSACTION_NOT_FOUND', 'The requested transaction was not found.');
            }
            tx.create(sessionRef, {
                ...storedEvidenceSession(mutation.session),
                organizationId: mutation.organizationId,
                participantClaimId: mutation.participantClaimId,
                actorId: mutation.actorId,
                redemptionTokenHash: mutation.tokenHash,
                operationKeyHash: (0, merchant_transaction_service_1.sha256)(mutation.operationKey),
                requestFingerprint: mutation.requestFingerprint,
                appCheckContext: null,
            });
            tx.set(transactionRef, {
                evidenceSessionIds: firestore_1.FieldValue.arrayUnion(mutation.session.id),
                captureStatus: 'NOT_STARTED',
                updatedAt: firestore_1.Timestamp.fromDate(mutation.event.occurredAt),
            }, { merge: true });
            if (!outbox.exists)
                tx.create(outboxRef, (0, outbox_1.storedOutboxEvent)(mutation.event));
            return { created: true, session: mutation.session };
        });
    }
    async findEvidenceSessionForOrganization(evidenceSessionId, organizationId) {
        const snap = await this.firestore.collection('evidenceSessions').doc(evidenceSessionId).get();
        if (!snap.exists || snap.data()?.organizationId !== organizationId)
            return null;
        return sessionSnapshot(snap.id, snap.data());
    }
    async findEvidenceSessionForActor(evidenceSessionId, actorId) {
        const snap = await this.firestore.collection('evidenceSessions').doc(evidenceSessionId).get();
        if (!snap.exists || snap.data()?.actorId !== actorId)
            return null;
        return sessionSnapshot(snap.id, snap.data());
    }
    async redeemEvidenceSession(evidenceSessionId, captureSessionId, decide) {
        const sessionRef = this.firestore.collection('evidenceSessions').doc(evidenceSessionId);
        const captureRef = this.firestore.collection('captureSessions').doc(captureSessionId);
        return this.firestore.runTransaction(async (tx) => {
            const [sessionDocument, captureDocument] = await Promise.all([tx.get(sessionRef), tx.get(captureRef)]);
            const snapshot = sessionDocument.exists ? sessionSnapshot(sessionDocument.id, sessionDocument.data()) : null;
            const existingCapture = captureDocument.exists ? captureSession(captureDocument.id, captureDocument.data()) : null;
            const decision = decide(snapshot, existingCapture);
            if (decision.type === 'REPLAY')
                return decision.result;
            if (!snapshot)
                throw new Error('Evidence-session redemption requires an existing session.');
            const capture = decision.captureSession;
            const nextRedemptionCount = snapshot.session.redemptionCount + 1;
            const startedAt = snapshot.session.startedAt ?? capture.issuedAt.toISOString();
            const nextSession = evidence_1.evidenceSessionDtoSchema.parse({
                ...snapshot.session,
                status: 'CAPTURING',
                captureState: 'CAPTURING',
                redemptionCount: nextRedemptionCount,
                startedAt,
                updatedAt: capture.issuedAt.toISOString(),
            });
            const outboxRef = this.firestore.collection('domainOutbox').doc(decision.event.id);
            const transactionRef = this.firestore.collection('transactions').doc(snapshot.session.transactionId);
            const timelineRef = transactionRef.collection('events').doc(decision.event.id);
            const [outbox, timeline] = await Promise.all([tx.get(outboxRef), tx.get(timelineRef)]);
            tx.create(captureRef, {
                id: capture.id,
                evidenceSessionId: capture.evidenceSessionId,
                uid: capture.uid,
                transactionId: capture.transactionId,
                returnPassportId: null,
                connectSessionId: null,
                nonce: capture.nonce,
                appId: capture.appId,
                tokenReplayDetected: false,
                runtimeArtifactHash: capture.runtimeArtifactHash,
                captureProfileId: capture.captureProfileId,
                captureGroupId: capture.captureGroupId,
                sessionMode: capture.sessionMode,
                maxEvidenceCount: capture.maxEvidenceCount,
                allowedEvidenceTypes: capture.allowedEvidenceTypes,
                operationKeyHash: capture.operationKeyHash,
                requestFingerprints: [],
                uploadBindings: {},
                issuedAt: firestore_1.Timestamp.fromDate(capture.issuedAt),
                captureWindowEndsAt: firestore_1.Timestamp.fromDate(capture.captureWindowEndsAt),
                redemptionExpiresAt: firestore_1.Timestamp.fromDate(capture.redemptionExpiresAt),
                usedAt: null,
            });
            tx.update(sessionRef, {
                status: nextSession.status,
                captureState: nextSession.captureState,
                redemptionCount: nextRedemptionCount,
                startedAt: firestore_1.Timestamp.fromDate(new Date(startedAt)),
                updatedAt: firestore_1.Timestamp.fromDate(capture.issuedAt),
                appCheckContext: { appId: capture.appId, verifiedAt: firestore_1.Timestamp.fromDate(capture.issuedAt) },
                ...(nextRedemptionCount >= snapshot.session.maximumRedemptions ? { redemptionTokenHash: firestore_1.FieldValue.delete() } : {}),
            });
            tx.set(transactionRef, {
                captureStatus: 'IN_PROGRESS',
                apiStatus: 'CAPTURE_IN_PROGRESS',
                updatedAt: firestore_1.Timestamp.fromDate(capture.issuedAt),
            }, { merge: true });
            if (!timeline.exists) {
                tx.create(timelineRef, {
                    actorId: capture.uid,
                    type: 'EVIDENCE_SESSION_STARTED',
                    summary: 'Participant entered an actor-bound native evidence capture session.',
                    metadata: { evidenceSessionId, captureSessionId, schemaVersion: 1 },
                    createdAt: firestore_1.Timestamp.fromDate(capture.issuedAt),
                });
            }
            if (!outbox.exists)
                tx.create(outboxRef, (0, outbox_1.storedOutboxEvent)(decision.event));
            return captureResult(capture, nextSession, false);
        });
    }
    async cancelEvidenceSession(evidenceSessionId, organizationId, actor, requestId, now) {
        const sessionRef = this.firestore.collection('evidenceSessions').doc(evidenceSessionId);
        return this.firestore.runTransaction(async (tx) => {
            const sessionDocument = await tx.get(sessionRef);
            if (!sessionDocument.exists || sessionDocument.data()?.organizationId !== organizationId) {
                throw new errors_1.ApplicationError('NOT_FOUND', 'EVIDENCE_SESSION_NOT_FOUND', 'The requested evidence session was not found.');
            }
            const snapshot = sessionSnapshot(sessionDocument.id, sessionDocument.data());
            if (snapshot.session.status === 'CANCELLED')
                return { session: snapshot.session, changed: false };
            if (!['CREATED', 'READY', 'CAPTURING', 'FAILED_RETRYABLE'].includes(snapshot.session.status)) {
                throw new errors_1.ApplicationError('FAILED_PRECONDITION', 'EVIDENCE_SESSION_NOT_CANCELLABLE', 'This evidence session can no longer be cancelled.');
            }
            const cancelled = evidence_1.evidenceSessionDtoSchema.parse({
                ...snapshot.session,
                status: 'CANCELLED',
                captureState: 'CANCELLED',
                updatedAt: now.toISOString(),
            });
            const event = {
                id: `evt_${(0, merchant_transaction_service_1.sha256)(`EVIDENCE_SESSION_CANCELLED\n${evidenceSessionId}`).slice(0, 40)}`,
                schemaVersion: 1,
                type: 'EVIDENCE_SESSION_CANCELLED',
                organizationId,
                actor,
                resourceType: 'evidence_session',
                resourceId: evidenceSessionId,
                requestId,
                occurredAt: now,
                data: { transactionId: snapshot.session.transactionId },
            };
            const outboxRef = this.firestore.collection('domainOutbox').doc(event.id);
            const transactionRef = this.firestore.collection('transactions').doc(snapshot.session.transactionId);
            const timelineRef = transactionRef.collection('events').doc(event.id);
            const [outbox, timeline] = await Promise.all([tx.get(outboxRef), tx.get(timelineRef)]);
            tx.update(sessionRef, {
                status: 'CANCELLED',
                captureState: 'CANCELLED',
                updatedAt: firestore_1.Timestamp.fromDate(now),
                redemptionTokenHash: firestore_1.FieldValue.delete(),
            });
            if (!timeline.exists) {
                tx.create(timelineRef, {
                    actorId: actor.id,
                    type: 'EVIDENCE_SESSION_CANCELLED',
                    summary: 'Merchant cancelled the evidence session.',
                    metadata: { evidenceSessionId, schemaVersion: 1 },
                    createdAt: firestore_1.Timestamp.fromDate(now),
                });
            }
            if (!outbox.exists)
                tx.create(outboxRef, (0, outbox_1.storedOutboxEvent)(event));
            return { session: cancelled, changed: true };
        });
    }
}
exports.FirestoreParticipantCaptureRepository = FirestoreParticipantCaptureRepository;
function captureResult(capture, session, replayed) {
    return {
        evidenceSession: session,
        captureAttestation: {
            mode: 'JIT_APP_CHECK',
            captureSessionId: capture.id,
            nonce: capture.nonce,
            appId: capture.appId,
            issuedAt: capture.issuedAt.toISOString(),
            captureWindowEndsAt: capture.captureWindowEndsAt.toISOString(),
            tokenReplayDetected: false,
            reasonCodes: [],
            sessionMode: capture.sessionMode,
            maxEvidenceCount: capture.maxEvidenceCount,
            captureGroupId: capture.captureGroupId,
        },
        replayed,
    };
}
//# sourceMappingURL=participant-capture-repository.js.map