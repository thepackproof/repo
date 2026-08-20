"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PortalWorkspaceApplicationService = exports.nativeCaptureHandoffActions = void 0;
exports.protocolFromEvidence = protocolFromEvidence;
exports.toPortalTransactionDto = toPortalTransactionDto;
const errors_1 = require("./errors");
const merchant_evidence_service_1 = require("./merchant-evidence-service");
const merchant_transaction_service_1 = require("./merchant-transaction-service");
const passport_projection_1 = require("./passport-projection");
const package_seal_protocol_1 = require("../../package-seal-protocol");
exports.nativeCaptureHandoffActions = [
    'START_PACKING',
    'RECORD_SEAL',
    'RECORD_ARRIVAL',
    'RECORD_UNBOXING',
    'RECORD_RETURN_PACKING',
    'RECORD_RETURN_SEAL',
    'RECORD_RETURN_UNBOXING',
];
const EMPTY_PROTOCOL = {
    hasPackingVideo: false,
    hasSealReference: false,
    hasArrivalPhoto: false,
    hasUnboxingVideo: false,
    sellerReferenceComplete: false,
    buyerArrivalComplete: false,
    outboundComplete: false,
};
function notFound() {
    return new errors_1.ApplicationError('NOT_FOUND', 'TRANSACTION_NOT_FOUND', 'The requested PackProof was not found.');
}
function forbidden() {
    return new errors_1.ApplicationError('FORBIDDEN', 'PORTAL_ACCESS_DENIED', 'You are not authorized to access this PackProof.');
}
function protocolFromEvidence(records) {
    const outbound = records.filter((record) => !record.returnPassportId);
    const ready = (predicate) => outbound.some((record) => predicate(record) && (0, package_seal_protocol_1.evidenceReadyForWorkflow)({
        ...record,
        assurance: record.assurance ?? undefined,
    }));
    const hasPackingVideo = ready((record) => (0, package_seal_protocol_1.isOutboundPackingEvidenceType)(record.type));
    const hasSealReference = ready((record) => (0, package_seal_protocol_1.isOutboundSealEvidenceType)(record.type));
    const hasArrivalPhoto = ready((record) => record.type === 'DELIVERY_PHOTO');
    const hasUnboxingVideo = ready((record) => record.type === 'UNBOXING_VIDEO');
    return {
        hasPackingVideo,
        hasSealReference,
        hasArrivalPhoto,
        hasUnboxingVideo,
        sellerReferenceComplete: hasPackingVideo && hasSealReference,
        buyerArrivalComplete: hasArrivalPhoto && hasUnboxingVideo,
        outboundComplete: hasPackingVideo && hasSealReference && hasArrivalPhoto && hasUnboxingVideo,
    };
}
function toPortalTransactionDto(record, protocol = EMPTY_PROTOCOL) {
    return {
        id: record.id,
        object: 'portal_transaction',
        schemaVersion: 1,
        sellerId: record.sellerId,
        buyerId: record.buyerId,
        participantIds: record.participantIds,
        status: record.consumerStatus || record.status,
        title: record.title,
        category: record.category ?? '',
        description: record.description,
        priceMinor: record.amount?.minorUnits ?? null,
        currency: record.amount?.currency ?? null,
        identifiers: record.identifiers,
        conditionNotes: record.conditionNotes,
        terms: record.terms,
        confirmedBy: record.confirmedBy,
        handoffConfirmedBy: record.handoffConfirmedBy,
        completedBy: record.completedBy,
        passportId: record.passportId,
        passportDisplayId: record.passportDisplayId,
        source: record.sourceType || record.sourcePlatform || record.externalOrderId
            ? { type: record.sourceType, platform: record.sourcePlatform, externalOrderId: record.externalOrderId }
            : null,
        protocol,
        lockedAt: record.lockedAt?.toISOString() ?? null,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
    };
}
function nativePathForAction(action, transactionId) {
    if (action === 'START_PACKING' || action === 'RECORD_RETURN_PACKING') {
        return { appPath: `/pack/${encodeURIComponent(transactionId)}`, queryAction: 'pack' };
    }
    if (action === 'RECORD_SEAL' || action === 'RECORD_RETURN_SEAL') {
        return { appPath: `/pack/${encodeURIComponent(transactionId)}?beat=label`, queryAction: 'seal' };
    }
    if (action === 'RECORD_ARRIVAL') {
        return { appPath: `/capture/${encodeURIComponent(transactionId)}?type=DELIVERY_PHOTO&session=task`, queryAction: 'arrival' };
    }
    if (action === 'RECORD_UNBOXING') {
        return { appPath: `/capture/${encodeURIComponent(transactionId)}?type=UNBOXING_VIDEO&session=task`, queryAction: 'unbox' };
    }
    if (action === 'RECORD_RETURN_UNBOXING') {
        return { appPath: `/capture/${encodeURIComponent(transactionId)}?type=RETURN_UNBOXING_VIDEO&session=task`, queryAction: 'return-unbox' };
    }
    return { appPath: `/task/${encodeURIComponent(transactionId)}`, queryAction: 'task' };
}
class PortalWorkspaceApplicationService {
    repository;
    audit;
    linkBaseUrl;
    now;
    constructor(repository, audit, linkBaseUrl, now = () => new Date()) {
        this.repository = repository;
        this.audit = audit;
        this.linkBaseUrl = linkBaseUrl;
        this.now = now;
    }
    async session(principal) {
        return { actorId: principal.actorId, channel: 'WEB_PORTAL' };
    }
    async listTransactions(principal, limit = 50) {
        const records = await this.repository.listForParticipant(principal.actorId, Math.min(Math.max(limit, 1), 50));
        return records.map((record) => toPortalTransactionDto(record));
    }
    async getTransaction(principal, transactionId) {
        const record = await this.requireParticipant(principal, transactionId);
        const evidence = await this.repository.listEvidence(record.id);
        return toPortalTransactionDto(record, protocolFromEvidence(evidence));
    }
    async getTimeline(principal, transactionId) {
        const record = await this.requireParticipant(principal, transactionId);
        return this.repository.listTimeline(record.id);
    }
    async listEvidence(principal, transactionId) {
        const record = await this.requireParticipant(principal, transactionId);
        const records = await this.repository.listEvidence(record.id);
        return records.map((item) => (0, merchant_evidence_service_1.toMerchantEvidenceArtifactDto)(item));
    }
    async getPassport(principal, transactionId) {
        const transaction = await this.requireParticipant(principal, transactionId);
        const [records, timeline, returns] = await Promise.all([
            this.repository.listEvidence(transaction.id),
            this.repository.listTimeline(transaction.id),
            this.repository.listReturns(transaction.id),
        ]);
        (0, passport_projection_1.assertPassportEligible)(transaction, records);
        const issuedAt = this.now();
        const identity = (0, passport_projection_1.boundOrIssuedIdentity)(transaction, issuedAt);
        if (identity.bind) {
            const bound = await this.repository.bindPassportIdentity(transaction.id, {
                passportId: identity.passportId,
                displayId: identity.displayId,
                issuedAt: identity.issuedAt,
            });
            identity.passportId = bound.passportId;
            identity.displayId = bound.displayId;
            identity.issuedAt = bound.issuedAt;
        }
        const commerce = transaction.commerceContextId
            ? await this.repository.findCommerceContext(transaction.commerceContextId)
            : null;
        return (0, passport_projection_1.projectPassport)({
            transaction,
            artifacts: records,
            shipment: transaction.shipment,
            delivery: transaction.delivery,
            returns,
            timeline,
            commerce,
            identity: {
                passportId: identity.passportId,
                displayId: identity.displayId,
                issuedAt: identity.issuedAt.toISOString(),
            },
            verificationBaseUrl: this.verificationBaseUrl(),
            reviewQuery: null,
            now: issuedAt.toISOString(),
        });
    }
    async createMobileHandoff(principal, transactionId, action, requestId) {
        if (!exports.nativeCaptureHandoffActions.includes(action)) {
            throw new errors_1.ApplicationError('INVALID_ARGUMENT', 'UNSUPPORTED_PORTAL_HANDOFF', 'Browser capture is not available. Continue this step on your phone.');
        }
        const record = await this.requireParticipant(principal, transactionId);
        const links = nativePathForAction(action, record.id);
        const base = this.verificationBaseUrl();
        const universalLink = `${base}/portal/open?transaction=${encodeURIComponent(record.id)}&action=${encodeURIComponent(links.queryAction)}`;
        const handoff = {
            object: 'portal_mobile_handoff',
            schemaVersion: 1,
            channel: 'WEB_PORTAL',
            transactionId: record.id,
            action,
            captureOnNativeOnly: true,
            universalLink,
            appLink: `packproof:/${links.appPath}`,
            storeUrl: 'https://play.google.com/store/apps/details?id=com.packproof.app',
        };
        const event = {
            id: `evt_${(0, merchant_transaction_service_1.sha256)(`PORTAL_MOBILE_HANDOFF\n${record.id}\n${action}\n${requestId}`).slice(0, 40)}`,
            schemaVersion: 1,
            type: 'PORTAL_MOBILE_HANDOFF_ISSUED',
            organizationId: record.organizationId,
            actor: { type: 'USER', id: principal.actorId },
            resourceType: 'transaction',
            resourceId: record.id,
            requestId,
            occurredAt: this.now(),
            data: { channel: 'WEB_PORTAL', action },
        };
        await this.audit.append({
            eventId: event.id,
            organizationId: record.organizationId,
            type: event.type,
            actor: principal,
            resourceType: 'transaction',
            resourceId: record.id,
            requestId,
            metadata: { apiVersion: 'v1', channel: 'WEB_PORTAL', action },
        }).catch(() => undefined);
        return handoff;
    }
    verificationBaseUrl() {
        return this.linkBaseUrl().replace(/\/$/, '') || 'https://packproof.link';
    }
    async requireParticipant(principal, transactionId) {
        const record = await this.repository.findForParticipant(transactionId, principal.actorId);
        if (!record) {
            // Distinguish missing vs unauthorized only after a participant-scoped read.
            throw notFound();
        }
        if (!record.participantIds.includes(principal.actorId))
            throw forbidden();
        return record;
    }
}
exports.PortalWorkspaceApplicationService = PortalWorkspaceApplicationService;
//# sourceMappingURL=portal-workspace-service.js.map