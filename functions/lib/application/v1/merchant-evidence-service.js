"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MerchantEvidenceApplicationService = void 0;
exports.toMerchantEvidenceArtifactDto = toMerchantEvidenceArtifactDto;
const package_seal_protocol_1 = require("../../package-seal-protocol");
const errors_1 = require("./errors");
const merchant_transaction_service_1 = require("./merchant-transaction-service");
const REPORT_URL_TTL_MS = 15 * 60 * 1000;
const ACTIVE_RETURN_STATUSES = ['REQUESTED', 'AUTHORIZED', 'PACKED', 'IN_TRANSIT', 'RECEIVED_REVIEW', 'DISPUTED'];
const RETURN_ELIGIBLE_CONSUMER_STATUSES = ['SHIPPED', 'BUYER_REVIEW', 'COMPLETED', 'DISPUTED'];
function trackingMatch(scanned, submitted) {
    if (!scanned)
        return 'NOT_SCANNED';
    return scanned === submitted ? 'MATCHED' : 'MISMATCH';
}
const LIMITATIONS = {
    physicalCorrespondence: 'NOT_AVAILABLE',
    businessLegalRelevance: 'REVIEW_REQUIRED',
    doesNotAuthenticateItem: true,
    doesNotProveCustody: true,
    doesNotDecideFraudOrFault: true,
    doesNotGuaranteeDisputeOutcome: true,
    dossierIsPresentationOnly: true,
    manifestAuthenticationScope: 'PACKPROOF_SERVICE_ONLY',
    humanReviewDisclaimer: package_seal_protocol_1.HUMAN_REVIEW_DISCLAIMER,
};
function notFound(code, message) {
    return new errors_1.ApplicationError('NOT_FOUND', code, message);
}
function publicAssurance(record) {
    const stored = record.assurance;
    const byteMismatch = record.clientHashMatched === false || record.clientSizeMatched === false || record.contentTypeMatched === false
        || stored?.byteIntegrity.status === 'MISMATCH';
    return {
        acquisitionQuality: stored?.acquisitionQuality ?? { status: 'NOT_EVALUATED', reasonCodes: ['NO_CALIBRATED_QUALITY_GATE'] },
        appDeviceContext: stored?.appDeviceContext ?? { status: 'NOT_RECORDED', reasonCodes: [] },
        byteIntegrity: stored?.byteIntegrity ?? {
            status: byteMismatch ? 'MISMATCH' : record.clientHashMatched === true && record.clientSizeMatched === true ? 'MATCHED' : 'SERVER_HASH_ONLY',
            reasonCodes: byteMismatch ? ['INTEGRITY_OR_MEDIA_TYPE_MISMATCH'] : [],
        },
        physicalCorrespondence: { status: 'NOT_AVAILABLE', reasonCodes: ['NO_VALIDATED_PHYSICAL_MATCHER_ENABLED'] },
        carrierContext: stored?.carrierContext ?? {
            status: record.carrierTrackingMatchStatus ?? 'NOT_EVALUATED',
            reasonCodes: record.carrierTrackingMatchStatus === 'MISMATCH' ? ['OBSERVED_TRACKING_DOES_NOT_MATCH_EXPECTED_CONTEXT'] : [],
        },
        businessLegalRelevance: { status: 'REVIEW_REQUIRED', reasonCodes: ['EXTERNAL_POLICY_AND_HUMAN_INTERPRETATION_REQUIRED'] },
    };
}
function evidenceStatus(record) {
    const integrityFailed = record.clientHashMatched === false || record.clientSizeMatched === false || record.contentTypeMatched === false
        || record.assurance?.byteIntegrity.status === 'MISMATCH';
    if (record.serverFinalized || record.serverVerified)
        return integrityFailed ? 'QUARANTINED' : 'FINALIZED';
    if (record.sha256)
        return 'UPLOADED';
    return 'RESERVED';
}
function roleOf(value) {
    if (value === 'SELLER' || value === 'BUYER' || value === 'RECEIVER' || value === 'RETURN_SENDER' || value === 'RETURN_RECIPIENT' || value === 'WITNESS') {
        return value;
    }
    return null;
}
function toMerchantEvidenceArtifactDto(record) {
    const status = evidenceStatus(record);
    const finalized = status === 'FINALIZED' || status === 'QUARANTINED';
    return {
        id: record.id,
        object: 'evidence_artifact',
        schemaVersion: 1,
        transactionId: record.transactionId,
        type: record.type,
        status,
        role: roleOf(record.role),
        contentType: record.contentType,
        sizeBytes: record.sizeBytes,
        sha256: record.sha256,
        manifestSha256: record.manifestSha256,
        evidenceBundleSha256: record.evidenceBundleSha256,
        manifestAuthenticationScope: record.manifestAuthenticationScope === 'PACKPROOF_SERVICE_ONLY' ? 'PACKPROOF_SERVICE_ONLY' : finalized ? 'PACKPROOF_SERVICE_ONLY' : null,
        workflowReady: (0, package_seal_protocol_1.evidenceReadyForWorkflow)({
            serverFinalized: record.serverFinalized,
            serverVerified: record.serverVerified,
            clientHashMatched: record.clientHashMatched,
            clientSizeMatched: record.clientSizeMatched,
            contentTypeMatched: record.contentTypeMatched,
            assurance: record.assurance ?? undefined,
        }),
        assurance: finalized ? publicAssurance(record) : record.assurance ? publicAssurance(record) : null,
        carrierTrackingMatchStatus: record.carrierTrackingMatchStatus,
        finalizedAt: record.finalizedAt?.toISOString() ?? null,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
    };
}
function presence(artifacts, types) {
    const matches = artifacts.filter((item) => types.includes(item.type));
    if (!matches.length)
        return 'ABSENT';
    return matches.some((item) => item.workflowReady) ? 'PRESENT' : 'PRESENT_WITH_LIMITATIONS';
}
function documentation(artifacts, transaction, returns, timeline) {
    const packing = artifacts.filter((item) => ((0, package_seal_protocol_1.isOutboundPackingEvidenceType)(item.type)
        || (0, package_seal_protocol_1.isOutboundSealEvidenceType)(item.type)
        || item.type === 'RETURN_PACKING_VIDEO'
        || item.type === 'RETURN_SHIPPING_LABEL'));
    const arrival = artifacts.filter((item) => ['DELIVERY_PHOTO', 'UNBOXING_VIDEO', 'RETURN_UNBOXING_VIDEO'].includes(item.type));
    const returning = artifacts.filter((item) => item.type.startsWith('RETURN_') || Boolean(returns.length));
    return [
        { category: 'TERMS_AND_CONDITIONS', present: transaction.terms !== null, artifactIds: [] },
        { category: 'ITEM_AND_ORDER_DESCRIPTION', present: Boolean(transaction.title), artifactIds: [] },
        { category: 'PACKING_AND_SEAL_REFERENCE', present: packing.length > 0, artifactIds: packing.map((item) => item.id) },
        { category: 'ARRIVAL_OR_DELIVERY_OBSERVATION', present: arrival.length > 0, artifactIds: arrival.map((item) => item.id) },
        { category: 'RETURN_DOCUMENTATION', present: returning.length > 0 || returns.length > 0, artifactIds: artifacts.filter((item) => item.type.startsWith('RETURN_')).map((item) => item.id) },
        { category: 'HASHED_EVIDENCE_INVENTORY', present: artifacts.length > 0, artifactIds: artifacts.map((item) => item.id) },
        { category: 'AUDIT_TIMELINE', present: timeline.length > 0, artifactIds: [] },
    ];
}
function reportSummary(record) {
    return {
        id: record.id,
        object: 'evidence_report',
        schemaVersion: 1,
        transactionId: record.transactionId,
        status: 'AVAILABLE',
        reportSha256: record.sha256,
        evidenceCount: record.evidenceCount,
        presentationOnly: true,
        generatedAt: record.createdAt.toISOString(),
    };
}
function reportDto(record, download) {
    return {
        id: record.id,
        object: 'evidence_report',
        schemaVersion: 1,
        transactionId: record.transactionId,
        status: 'AVAILABLE',
        reportSha256: record.sha256,
        evidenceCount: record.evidenceCount,
        presentationOnly: true,
        generatedAt: record.createdAt.toISOString(),
        downloadUrl: download?.url ?? null,
        downloadUrlExpiresAt: download?.expiresAt.toISOString() ?? null,
    };
}
function normalizeTracking(value) {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
function firstScannedTracking(...values) {
    for (const value of values) {
        if (!value)
            continue;
        const normalized = normalizeTracking(value);
        if (normalized)
            return normalized;
    }
    return '';
}
class MerchantEvidenceApplicationService {
    repository;
    idempotency;
    audit;
    authorization;
    reports;
    urls;
    config;
    now;
    constructor(repository, idempotency, audit, authorization, reports, urls, config, now = () => new Date()) {
        this.repository = repository;
        this.idempotency = idempotency;
        this.audit = audit;
        this.authorization = authorization;
        this.reports = reports;
        this.urls = urls;
        this.config = config;
        this.now = now;
    }
    async requireAccessible(principal, transactionId) {
        this.authorization.requireEnvironment(principal, this.config.environment);
        const transaction = await this.repository.findAccessibleTransaction(transactionId, principal);
        if (!transaction)
            throw notFound('TRANSACTION_NOT_FOUND', 'The requested transaction was not found.');
        return transaction;
    }
    async listEvidence(principal, transactionId) {
        this.authorization.requireScope(principal, 'evidence:read');
        await this.requireAccessible(principal, transactionId);
        const records = await this.repository.listEvidence(transactionId);
        return records.map(toMerchantEvidenceArtifactDto);
    }
    async getEvidence(principal, transactionId, artifactId) {
        this.authorization.requireScope(principal, 'evidence:read');
        await this.requireAccessible(principal, transactionId);
        const record = await this.repository.findEvidence(transactionId, artifactId);
        if (!record)
            throw notFound('EVIDENCE_NOT_FOUND', 'The requested evidence artifact was not found.');
        return toMerchantEvidenceArtifactDto(record);
    }
    async getTimeline(principal, transactionId) {
        this.authorization.requireScope(principal, 'transactions:read');
        await this.requireAccessible(principal, transactionId);
        return this.repository.listTimeline(transactionId);
    }
    async listReturns(principal, transactionId) {
        this.authorization.requireScope(principal, 'transactions:read');
        await this.requireAccessible(principal, transactionId);
        return this.repository.listReturns(transactionId);
    }
    async getReturn(principal, transactionId, returnPassportId) {
        this.authorization.requireScope(principal, 'transactions:read');
        await this.requireAccessible(principal, transactionId);
        const record = await this.repository.findReturn(transactionId, returnPassportId);
        if (!record)
            throw notFound('RETURN_PASSPORT_NOT_FOUND', 'The requested return passport was not found.');
        return record;
    }
    async getShipment(principal, transactionId) {
        this.authorization.requireScope(principal, 'shipments:read');
        const transaction = await this.requireAccessible(principal, transactionId);
        if (!transaction.shipment)
            throw notFound('SHIPMENT_NOT_FOUND', 'No shipment is associated with this transaction.');
        return transaction.shipment;
    }
    async getReviewPackage(principal, transactionId) {
        this.authorization.requireScope(principal, 'evidence:read');
        const transaction = await this.requireAccessible(principal, transactionId);
        const [records, timeline, returns, reports] = await Promise.all([
            this.repository.listEvidence(transactionId),
            this.repository.listTimeline(transactionId),
            this.repository.listReturns(transactionId),
            this.repository.listReports(transactionId),
        ]);
        const evidence = records.map(toMerchantEvidenceArtifactDto);
        const latest = reports.at(-1) ?? null;
        return {
            id: `review_${(0, merchant_transaction_service_1.sha256)(transactionId).slice(0, 40)}`,
            object: 'review_package',
            schemaVersion: 1,
            transactionId,
            title: transaction.title,
            merchantReference: transaction.merchantReference,
            status: transaction.status,
            amount: transaction.amount,
            terms: transaction.terms,
            protocolCompleteness: {
                sellerPackingVideo: presence(evidence.filter((item) => !item.type.startsWith('RETURN_')), package_seal_protocol_1.outboundPackingEvidenceTypes),
                sellerSealReference: presence(evidence.filter((item) => !item.type.startsWith('RETURN_')), package_seal_protocol_1.outboundSealEvidenceTypes),
                buyerArrivalObservation: presence(evidence, ['DELIVERY_PHOTO']),
                buyerUnboxing: presence(evidence, ['UNBOXING_VIDEO']),
                returnPackingVideo: presence(evidence, ['RETURN_PACKING_VIDEO']),
                returnSealReference: presence(evidence, ['RETURN_SHIPPING_LABEL']),
            },
            documentationCategories: documentation(evidence, transaction, returns, timeline),
            evidence,
            shipment: transaction.shipment,
            delivery: transaction.delivery,
            returns,
            latestReport: latest ? reportSummary(latest) : null,
            timeline,
            limitations: LIMITATIONS,
            createdAt: transaction.createdAt.toISOString(),
            updatedAt: transaction.updatedAt.toISOString(),
        };
    }
    async createReport(principal, transactionId, idempotencyKey, requestId) {
        this.authorization.requireScope(principal, 'evidence:read');
        await this.requireAccessible(principal, transactionId);
        const execution = await this.idempotency.execute({
            principalId: `${principal.organizationId}:${principal.apiClientId}`,
            operation: 'POST /v1/transactions/{transactionId}/reports',
            key: idempotencyKey,
            requestFingerprint: (0, merchant_transaction_service_1.sha256)((0, merchant_transaction_service_1.canonicalize)({ transactionId })),
            leaseSeconds: 900,
        }, async (operationId, fence) => {
            const generated = await fence.runSideEffect('generate-evidence-report', () => (this.reports.generate(transactionId, `merchant:${principal.apiClientId}`, { reportId: operationId })));
            const createdAt = this.now();
            const stored = {
                id: generated.reportId,
                transactionId,
                sha256: generated.sha256,
                storagePath: generated.storagePath,
                evidenceCount: generated.evidenceCount,
                createdAt,
            };
            const expiresAt = new Date(createdAt.getTime() + REPORT_URL_TTL_MS);
            const downloadUrl = await fence.runSideEffect('sign-evidence-report-url', () => this.urls.sign(generated.storagePath, expiresAt));
            await fence.runSideEffect('audit-evidence-report-available', () => this.audit.append({
                eventId: `report_created_${generated.reportId}`,
                organizationId: principal.organizationId,
                type: 'EVIDENCE_REPORT_AVAILABLE',
                actor: principal,
                resourceType: 'EVIDENCE_REPORT',
                resourceId: generated.reportId,
                requestId,
                metadata: { apiVersion: 'v1', transactionId, reportSha256: generated.sha256, presentationOnly: true },
            }));
            return { report: reportDto(stored, { url: downloadUrl, expiresAt }), storagePath: generated.storagePath };
        });
        if (execution.replayed) {
            const expiresAt = new Date(this.now().getTime() + REPORT_URL_TTL_MS);
            const downloadUrl = await this.urls.sign(execution.value.storagePath, expiresAt);
            return { report: { ...execution.value.report, downloadUrl, downloadUrlExpiresAt: expiresAt.toISOString() }, replayed: true };
        }
        return { report: execution.value.report, replayed: false };
    }
    async getReport(principal, transactionId, reportId) {
        this.authorization.requireScope(principal, 'evidence:read');
        await this.requireAccessible(principal, transactionId);
        const record = await this.repository.findReport(transactionId, reportId);
        if (!record)
            throw notFound('EVIDENCE_REPORT_NOT_FOUND', 'The requested evidence report was not found.');
        const expiresAt = new Date(this.now().getTime() + REPORT_URL_TTL_MS);
        const downloadUrl = await this.urls.sign(record.storagePath, expiresAt);
        return reportDto(record, { url: downloadUrl, expiresAt });
    }
    async associateShipment(principal, transactionId, input, idempotencyKey, requestId) {
        this.authorization.requireScope(principal, 'shipments:write');
        const transaction = await this.requireAccessible(principal, transactionId);
        const execution = await this.idempotency.execute({
            principalId: `${principal.organizationId}:${principal.apiClientId}`,
            operation: 'POST /v1/transactions/{transactionId}/shipment',
            key: idempotencyKey,
            requestFingerprint: (0, merchant_transaction_service_1.sha256)((0, merchant_transaction_service_1.canonicalize)({ transactionId, ...input })),
        }, async (_operationId, fence) => {
            await fence.assertOwned();
            const records = await this.repository.listEvidence(transactionId);
            const artifacts = records.map(toMerchantEvidenceArtifactDto);
            const packing = artifacts.find((item) => (0, package_seal_protocol_1.isOutboundPackingEvidenceType)(item.type) && item.workflowReady);
            const seal = artifacts.find((item) => (0, package_seal_protocol_1.isOutboundSealEvidenceType)(item.type) && item.workflowReady);
            const decision = (0, package_seal_protocol_1.shipmentEvidenceDecision)({ packingReady: Boolean(packing), sealReady: Boolean(seal) });
            if (!decision.ok || !packing || !seal) {
                throw new errors_1.ApplicationError('FAILED_PRECONDITION', decision.ok ? 'SEAL_REFERENCE_REQUIRED' : `${decision.missing}_REQUIRED`, package_seal_protocol_1.SHIPMENT_PRECONDITION_MESSAGES[decision.ok ? 'SEAL_REFERENCE' : decision.missing]);
            }
            const packingRecord = records.find((item) => item.id === packing.id);
            const sealRecord = records.find((item) => item.id === seal.id);
            const submitted = normalizeTracking(input.trackingNumber);
            const scanned = firstScannedTracking(sealRecord.scannedTrackingNumber, packingRecord.scannedTrackingNumber);
            const labelEvidenceMatchStatus = !scanned
                ? 'NOT_SCANNED'
                : scanned === submitted
                    ? 'MATCHED'
                    : 'MISMATCH';
            const occurredAt = this.now();
            const event = {
                id: `evt_${(0, merchant_transaction_service_1.sha256)(`shipment-associated\n${transactionId}\n${idempotencyKey}`).slice(0, 40)}`,
                schemaVersion: 1,
                type: 'SHIPMENT_ASSOCIATED',
                organizationId: principal.organizationId,
                actor: { type: 'MERCHANT_API_CLIENT', id: principal.apiClientId },
                resourceType: 'shipment',
                resourceId: transactionId,
                requestId,
                occurredAt,
                data: {
                    origin: 'MERCHANT_API',
                    carrier: input.carrier,
                    packingEvidenceId: packing.id,
                    sealEvidenceId: seal.id,
                    labelEvidenceMatchStatus,
                },
            };
            const shipment = await this.repository.associateShipment(transactionId, {
                carrier: input.carrier,
                trackingNumber: input.trackingNumber,
                packingEvidenceId: packing.id,
                sealEvidenceId: seal.id,
                scannedTrackingNumber: scanned || null,
                labelEvidenceMatchStatus,
                markConsumerShipped: ['TERMS_LOCKED', 'PACKED'].includes(transaction.consumerStatus),
                occurredAt,
            }, event);
            await fence.runSideEffect('audit-shipment-associated', () => this.audit.append({
                eventId: `shipment_associated_${transactionId}_${(0, merchant_transaction_service_1.sha256)(idempotencyKey).slice(0, 16)}`,
                organizationId: principal.organizationId,
                type: 'SHIPMENT_ASSOCIATED',
                actor: principal,
                resourceType: 'SHIPMENT',
                resourceId: shipment.id,
                requestId,
                metadata: { apiVersion: 'v1', transactionId, labelEvidenceMatchStatus },
            }));
            return { shipment };
        });
        return { shipment: execution.value.shipment, replayed: execution.replayed };
    }
    async createReturn(principal, transactionId, input, idempotencyKey, requestId) {
        this.authorization.requireScope(principal, 'transactions:write');
        const transaction = await this.requireAccessible(principal, transactionId);
        const execution = await this.idempotency.execute({
            principalId: `${principal.organizationId}:${principal.apiClientId}`,
            operation: 'POST /v1/transactions/{transactionId}/returns',
            key: idempotencyKey,
            requestFingerprint: (0, merchant_transaction_service_1.sha256)((0, merchant_transaction_service_1.canonicalize)({ transactionId, reason: input.reason })),
        }, async (operationId, fence) => {
            await fence.assertOwned();
            if (!transaction.sellerId || !transaction.buyerId) {
                throw new errors_1.ApplicationError('FAILED_PRECONDITION', 'PARTICIPANTS_REQUIRED', 'A return passport requires both transaction participants to be claimed.');
            }
            if (transaction.terms?.returns === 'NO_RETURNS' && transaction.consumerStatus !== 'DISPUTED') {
                throw new errors_1.ApplicationError('FAILED_PRECONDITION', 'RETURNS_NOT_AUTHORIZED', 'The locked terms do not authorize returns.');
            }
            const shipped = Boolean(transaction.shipment) || RETURN_ELIGIBLE_CONSUMER_STATUSES.includes(transaction.consumerStatus);
            if (!shipped) {
                throw new errors_1.ApplicationError('FAILED_PRECONDITION', 'RETURN_NOT_READY', 'A return passport can begin only after shipment.');
            }
            const existing = await this.repository.listReturns(transactionId);
            if (existing.some((item) => ACTIVE_RETURN_STATUSES.includes(item.status))) {
                throw new errors_1.ApplicationError('CONFLICT', 'ACTIVE_RETURN_EXISTS', 'An active return passport already exists for this transaction.');
            }
            const records = await this.repository.listEvidence(transactionId);
            const originalEvidenceHashes = records
                .filter((item) => item.serverFinalized || item.serverVerified)
                .map((item) => item.sha256)
                .filter((hash) => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash));
            const occurredAt = this.now();
            const returnPassportId = `return_${(0, merchant_transaction_service_1.sha256)(operationId).slice(0, 40)}`;
            const event = {
                id: `evt_${(0, merchant_transaction_service_1.sha256)(`return-requested\n${transactionId}\n${idempotencyKey}`).slice(0, 40)}`,
                schemaVersion: 1,
                type: 'RETURN_PASSPORT_REQUESTED',
                organizationId: principal.organizationId,
                actor: { type: 'MERCHANT_API_CLIENT', id: principal.apiClientId },
                resourceType: 'return_passport',
                resourceId: returnPassportId,
                requestId,
                occurredAt,
                data: { origin: 'MERCHANT_API', transactionId },
            };
            const returnPassport = await this.repository.createReturn(transactionId, {
                id: returnPassportId,
                reason: input.reason,
                initiatedBy: `merchant:${principal.apiClientId}`,
                returningParticipantId: transaction.buyerId,
                recipientId: transaction.sellerId,
                participantIds: [transaction.sellerId, transaction.buyerId],
                originalEvidenceHashes,
                occurredAt,
            }, event);
            await fence.runSideEffect('audit-return-requested', () => this.audit.append({
                eventId: `return_requested_${returnPassportId}`,
                organizationId: principal.organizationId,
                type: 'RETURN_PASSPORT_REQUESTED',
                actor: principal,
                resourceType: 'RETURN_PASSPORT',
                resourceId: returnPassportId,
                requestId,
                metadata: { apiVersion: 'v1', transactionId },
            }));
            return { returnPassport };
        });
        return { returnPassport: execution.value.returnPassport, replayed: execution.replayed };
    }
    async associateReturnShipment(principal, transactionId, returnPassportId, input, idempotencyKey, requestId) {
        this.authorization.requireScope(principal, 'shipments:write');
        await this.requireAccessible(principal, transactionId);
        const execution = await this.idempotency.execute({
            principalId: `${principal.organizationId}:${principal.apiClientId}`,
            operation: 'POST /v1/transactions/{transactionId}/returns/{returnPassportId}/shipment',
            key: idempotencyKey,
            requestFingerprint: (0, merchant_transaction_service_1.sha256)((0, merchant_transaction_service_1.canonicalize)({ transactionId, returnPassportId, ...input })),
        }, async (_operationId, fence) => {
            await fence.assertOwned();
            const current = await this.repository.findReturn(transactionId, returnPassportId);
            if (!current)
                throw notFound('RETURN_PASSPORT_NOT_FOUND', 'The requested return passport was not found.');
            if (!['AUTHORIZED', 'PACKED'].includes(current.status)) {
                throw new errors_1.ApplicationError('FAILED_PRECONDITION', 'RETURN_NOT_READY_FOR_SHIPPING', 'The return is not ready for shipping.');
            }
            const records = await this.repository.listEvidence(transactionId);
            const artifacts = records.map(toMerchantEvidenceArtifactDto);
            const packing = artifacts.find((item) => item.type === 'RETURN_PACKING_VIDEO' && item.workflowReady
                && records.find((record) => record.id === item.id)?.returnPassportId === returnPassportId);
            const seal = artifacts.find((item) => item.type === 'RETURN_SHIPPING_LABEL' && item.workflowReady
                && records.find((record) => record.id === item.id)?.returnPassportId === returnPassportId);
            const decision = (0, package_seal_protocol_1.shipmentEvidenceDecision)({ packingReady: Boolean(packing), sealReady: Boolean(seal), kind: 'return' });
            if (!decision.ok || !packing || !seal) {
                throw new errors_1.ApplicationError('FAILED_PRECONDITION', decision.ok ? 'RETURN_SEAL_REFERENCE_REQUIRED' : `${decision.missing}_REQUIRED`, package_seal_protocol_1.SHIPMENT_PRECONDITION_MESSAGES[decision.ok ? 'RETURN_SEAL_REFERENCE' : decision.missing]);
            }
            const packingRecord = records.find((item) => item.id === packing.id);
            const sealRecord = records.find((item) => item.id === seal.id);
            const submitted = normalizeTracking(input.trackingNumber);
            const scanned = firstScannedTracking(sealRecord.scannedTrackingNumber, packingRecord.scannedTrackingNumber);
            const labelEvidenceMatchStatus = trackingMatch(scanned, submitted);
            const occurredAt = this.now();
            const event = {
                id: `evt_${(0, merchant_transaction_service_1.sha256)(`return-shipped\n${transactionId}\n${returnPassportId}\n${idempotencyKey}`).slice(0, 40)}`,
                schemaVersion: 1,
                type: 'RETURN_SHIPPED',
                organizationId: principal.organizationId,
                actor: { type: 'MERCHANT_API_CLIENT', id: principal.apiClientId },
                resourceType: 'return_passport',
                resourceId: returnPassportId,
                requestId,
                occurredAt,
                data: {
                    origin: 'MERCHANT_API',
                    carrier: input.carrier,
                    packingEvidenceId: packing.id,
                    sealEvidenceId: seal.id,
                    labelEvidenceMatchStatus,
                },
            };
            const returnPassport = await this.repository.associateReturnShipment(transactionId, returnPassportId, {
                carrier: input.carrier,
                trackingNumber: input.trackingNumber,
                packingEvidenceId: packing.id,
                sealEvidenceId: seal.id,
                scannedTrackingNumber: scanned || null,
                labelEvidenceMatchStatus,
                occurredAt,
            }, event);
            await fence.runSideEffect('audit-return-shipped', () => this.audit.append({
                eventId: `return_shipped_${returnPassportId}_${(0, merchant_transaction_service_1.sha256)(idempotencyKey).slice(0, 16)}`,
                organizationId: principal.organizationId,
                type: 'RETURN_SHIPPED',
                actor: principal,
                resourceType: 'RETURN_PASSPORT',
                resourceId: returnPassportId,
                requestId,
                metadata: { apiVersion: 'v1', transactionId, labelEvidenceMatchStatus },
            }));
            return { returnPassport };
        });
        return { returnPassport: execution.value.returnPassport, replayed: execution.replayed };
    }
    async getDelivery(principal, transactionId) {
        this.authorization.requireScope(principal, 'shipments:read');
        const transaction = await this.requireAccessible(principal, transactionId);
        if (!transaction.delivery)
            throw notFound('DELIVERY_NOT_FOUND', 'No delivery is associated with this transaction.');
        return transaction.delivery;
    }
    async associateDelivery(principal, transactionId, input, idempotencyKey, requestId) {
        this.authorization.requireScope(principal, 'shipments:write');
        await this.requireAccessible(principal, transactionId);
        const execution = await this.idempotency.execute({
            principalId: `${principal.organizationId}:${principal.apiClientId}`,
            operation: 'POST /v1/transactions/{transactionId}/delivery',
            key: idempotencyKey,
            requestFingerprint: (0, merchant_transaction_service_1.sha256)((0, merchant_transaction_service_1.canonicalize)({ transactionId, ...input })),
        }, async (_operationId, fence) => {
            await fence.assertOwned();
            const records = await this.repository.listEvidence(transactionId);
            const artifacts = records.map(toMerchantEvidenceArtifactDto);
            const arrival = artifacts.find((item) => item.type === 'DELIVERY_PHOTO' && item.workflowReady);
            if (!arrival) {
                throw new errors_1.ApplicationError('FAILED_PRECONDITION', 'ARRIVAL_OBSERVATION_REQUIRED', package_seal_protocol_1.SHIPMENT_PRECONDITION_MESSAGES.ARRIVAL_OBSERVATION);
            }
            const arrivalRecord = records.find((item) => item.id === arrival.id);
            const submitted = input.trackingNumber ? normalizeTracking(input.trackingNumber) : '';
            const scanned = firstScannedTracking(arrivalRecord.scannedTrackingNumber);
            const labelEvidenceMatchStatus = submitted ? trackingMatch(scanned, submitted) : scanned ? 'NOT_SCANNED' : null;
            const occurredAt = this.now();
            const event = {
                id: `evt_${(0, merchant_transaction_service_1.sha256)(`delivery-associated\n${transactionId}\n${idempotencyKey}`).slice(0, 40)}`,
                schemaVersion: 1,
                type: 'DELIVERY_ASSOCIATED',
                organizationId: principal.organizationId,
                actor: { type: 'MERCHANT_API_CLIENT', id: principal.apiClientId },
                resourceType: 'delivery',
                resourceId: transactionId,
                requestId,
                occurredAt,
                data: {
                    origin: 'MERCHANT_API',
                    arrivalEvidenceId: arrival.id,
                    ...(input.carrier ? { carrier: input.carrier } : {}),
                    ...(labelEvidenceMatchStatus ? { labelEvidenceMatchStatus } : {}),
                },
            };
            const delivery = await this.repository.associateDelivery(transactionId, {
                arrivalEvidenceId: arrival.id,
                carrier: input.carrier ?? null,
                trackingNumber: input.trackingNumber ?? null,
                scannedTrackingNumber: scanned || null,
                labelEvidenceMatchStatus,
                occurredAt,
            }, event);
            await fence.runSideEffect('audit-delivery-associated', () => this.audit.append({
                eventId: `delivery_associated_${transactionId}_${(0, merchant_transaction_service_1.sha256)(idempotencyKey).slice(0, 16)}`,
                organizationId: principal.organizationId,
                type: 'DELIVERY_ASSOCIATED',
                actor: principal,
                resourceType: 'DELIVERY',
                resourceId: delivery.id,
                requestId,
                metadata: { apiVersion: 'v1', transactionId, labelEvidenceMatchStatus },
            }));
            return { delivery };
        });
        return { delivery: execution.value.delivery, replayed: execution.replayed };
    }
}
exports.MerchantEvidenceApplicationService = MerchantEvidenceApplicationService;
//# sourceMappingURL=merchant-evidence-service.js.map