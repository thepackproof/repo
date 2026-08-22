"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PortalWorkspaceApplicationService = exports.protocolFromEvidence = exports.nativeCaptureHandoffActions = void 0;
exports.toPortalTransactionDto = toPortalTransactionDto;
const errors_1 = require("./errors");
const merchant_evidence_service_1 = require("./merchant-evidence-service");
const merchant_transaction_service_1 = require("./merchant-transaction-service");
const proof_application_service_1 = require("./proof-application-service");
const transaction_workspace_service_1 = require("./transaction-workspace-service");
const transaction_workspace_1 = require("./transaction-workspace");
Object.defineProperty(exports, "protocolFromEvidence", { enumerable: true, get: function () { return transaction_workspace_1.protocolFromEvidence; } });
exports.nativeCaptureHandoffActions = [
    'START_PACKING',
    'RECORD_SEAL',
    'RECORD_ARRIVAL',
    'RECORD_UNBOXING',
    'RECORD_RETURN_PACKING',
    'RECORD_RETURN_SEAL',
    'RECORD_RETURN_UNBOXING',
];
function notFound() {
    return new errors_1.ApplicationError('NOT_FOUND', 'TRANSACTION_NOT_FOUND', 'The requested PackProof was not found.');
}
function forbidden() {
    return new errors_1.ApplicationError('FORBIDDEN', 'PORTAL_ACCESS_DENIED', 'You are not authorized to access this PackProof.');
}
function toPortalTransactionDto(record, workspace) {
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
        proof: workspace.proof,
        workspace,
        source: record.sourceType || record.sourcePlatform || record.externalOrderId
            ? { type: record.sourceType, platform: record.sourcePlatform, externalOrderId: record.externalOrderId }
            : null,
        protocol: workspace.protocol,
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
    workspaces;
    constructor(repository, audit, linkBaseUrl, now = () => new Date()) {
        this.repository = repository;
        this.audit = audit;
        this.linkBaseUrl = linkBaseUrl;
        this.now = now;
        this.workspaces = new transaction_workspace_service_1.TransactionWorkspaceApplicationService(repository, now);
    }
    async session(principal) {
        return { actorId: principal.actorId, channel: 'WEB_PORTAL' };
    }
    async listWorkspaces(actorId, limit = 50) {
        return this.workspaces.listWorkspaces(actorId, { limit });
    }
    async getWorkspace(actorId, transactionId) {
        return this.workspaces.getWorkspace(actorId, transactionId);
    }
    async listHydratedForActor(actorId, limit = 50) {
        const records = await this.repository.listForParticipant(actorId, Math.min(Math.max(limit, 1), 50));
        const workspaces = await this.workspaces.listWorkspaces(actorId, { records });
        const byId = new Map(workspaces.map((workspace) => [workspace.transactionId, workspace]));
        return records.flatMap((record) => {
            const workspace = byId.get(record.id);
            return workspace ? [toPortalTransactionDto(record, workspace)] : [];
        });
    }
    async listTransactions(principal, limit = 50) {
        return this.listHydratedForActor(principal.actorId, limit);
    }
    async getHydratedForActor(actorId, transactionId) {
        const record = await this.repository.findForParticipant(transactionId, actorId);
        if (!record || !record.participantIds.includes(actorId)) {
            throw notFound();
        }
        const workspace = await this.workspaces.getWorkspace(actorId, transactionId);
        return toPortalTransactionDto(record, workspace);
    }
    async getTransaction(principal, transactionId) {
        return this.getHydratedForActor(principal.actorId, transactionId);
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
        const commerce = transaction.commerceContextId
            ? await this.repository.findCommerceContext(transaction.commerceContextId)
            : null;
        const proofs = new proof_application_service_1.ProofApplicationService(this.repository, () => this.verificationBaseUrl(), this.now);
        return proofs.getCurrentProof({
            transaction,
            artifacts: records,
            timeline,
            returns,
            commerce,
        }, null, { bindIdentity: false });
    }
    async issueProofIdentity(principal, transactionId) {
        const transaction = await this.requireParticipant(principal, transactionId);
        const records = await this.repository.listEvidence(transaction.id);
        const commerce = transaction.commerceContextId
            ? await this.repository.findCommerceContext(transaction.commerceContextId)
            : null;
        const proofs = new proof_application_service_1.ProofApplicationService(this.repository, () => this.verificationBaseUrl(), this.now);
        return proofs.issueProofIdentity({
            transaction,
            artifacts: records,
            commerce,
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