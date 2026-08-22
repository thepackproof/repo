"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.protocolFromEvidence = protocolFromEvidence;
exports.toWorkspaceTransaction = toWorkspaceTransaction;
exports.workspaceProofFromFacts = workspaceProofFromFacts;
exports.workspaceReturnFromRecords = workspaceReturnFromRecords;
exports.hydrateWorkspaceSlices = hydrateWorkspaceSlices;
const package_seal_protocol_1 = require("../../package-seal-protocol");
const proof_application_service_1 = require("./proof-application-service");
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
function toWorkspaceTransaction(record) {
    return {
        id: record.id,
        sellerId: record.sellerId ?? '',
        buyerId: record.buyerId,
        participantIds: record.participantIds,
        status: (record.consumerStatus || record.status),
        title: record.title,
        category: record.category ?? '',
        description: record.description,
        priceMinor: record.amount?.minorUnits ?? 0,
        currency: record.amount?.currency ?? 'USD',
        identifiers: record.identifiers,
        conditionNotes: record.conditionNotes,
        terms: {
            saleType: (record.terms?.saleType === 'LOCAL_HANDOFF' ? 'LOCAL_HANDOFF' : 'SHIPPED'),
            shippingResponsibility: (record.terms?.shippingResponsibility ?? 'SELLER'),
            returns: (record.terms?.returns ?? 'AS_AGREED'),
            returnWindowDays: record.terms?.returnWindowDays ?? 0,
            customTerms: record.terms?.customTerms ?? '',
        },
        confirmedBy: record.confirmedBy,
        handoffConfirmedBy: record.handoffConfirmedBy,
        completedBy: record.completedBy,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
        lockedAt: record.lockedAt?.toISOString() ?? null,
        passportId: record.passportId,
        passportDisplayId: record.passportDisplayId,
        source: record.sourceType || record.sourcePlatform || record.externalOrderId
            ? { type: record.sourceType ?? undefined, platform: record.sourcePlatform ?? undefined, externalOrderId: record.externalOrderId ?? undefined }
            : null,
    };
}
function workspaceProofFromFacts(transaction, artifacts, commerce) {
    const result = (0, proof_application_service_1.evaluateProofAvailabilityFromFacts)({ transaction, artifacts, commerce });
    return {
        availability: result.availability,
        passportId: result.passportId,
        displayId: result.displayId,
    };
}
function returnWorkspaceActors(item) {
    const extra = item;
    return {
        initiatedBy: extra.initiatedBy ?? '',
        returningParticipantId: extra.returningParticipantId ?? '',
        recipientId: extra.recipientId ?? '',
        completedBy: extra.completedBy ?? [],
    };
}
function workspaceReturnFromRecords(returns) {
    const active = returns.find((item) => !['COMPLETED', 'CANCELLED'].includes(item.status)) ?? null;
    if (!active)
        return null;
    return {
        id: active.id,
        status: active.status,
        ...returnWorkspaceActors(active),
        updatedAt: active.updatedAt,
    };
}
function hydrateWorkspaceSlices(record, artifacts, returns, commerce) {
    return {
        protocol: protocolFromEvidence(artifacts),
        proof: workspaceProofFromFacts(record, artifacts, commerce),
        returnWorkflow: workspaceReturnFromRecords(returns),
    };
}
//# sourceMappingURL=transaction-workspace.js.map