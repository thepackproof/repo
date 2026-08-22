"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionWorkspaceApplicationService = void 0;
exports.projectWorkspaceFromLoadedFacts = projectWorkspaceFromLoadedFacts;
exports.projectWorkspaceFromSummary = projectWorkspaceFromSummary;
const operation_log_1 = require("./operation-log");
const errors_1 = require("./errors");
const workspace_projection_1 = require("../../ux/workspace-projection");
const transaction_workspace_1 = require("./transaction-workspace");
function notFound() {
    return new errors_1.ApplicationError('NOT_FOUND', 'TRANSACTION_NOT_FOUND', 'The requested PackProof was not found.');
}
function forbidden() {
    return new errors_1.ApplicationError('FORBIDDEN', 'WORKSPACE_ACCESS_DENIED', 'You are not authorized to access this PackProof.');
}
function projectWorkspaceFromLoadedFacts(input) {
    const slices = (0, transaction_workspace_1.hydrateWorkspaceSlices)(input.record, input.artifacts, input.returns, input.commerce);
    const processing = (0, transaction_workspace_1.evidenceProcessingFromRecords)(input.artifacts);
    const inviteSentAt = input.timeline ? (0, transaction_workspace_1.inviteSentAtFromTimeline)(input.timeline) : null;
    return (0, workspace_projection_1.projectTransactionWorkspace)({
        transaction: (0, transaction_workspace_1.toWorkspaceTransaction)(input.record),
        viewerId: input.actorId,
        protocol: slices.protocol,
        proof: slices.proof,
        returnPassport: slices.returnWorkflow,
        returnProtocol: slices.returnWorkflow
            ? (0, transaction_workspace_1.protocolFromEvidence)(input.artifacts, { returnPassportId: slices.returnWorkflow.id })
            : null,
        inviteSentAt,
        evidenceProcessing: processing.phase ? { phase: processing.phase } : null,
        pendingCount: processing.pendingCount,
        generatedAt: input.generatedAt,
    });
}
function projectWorkspaceFromSummary(record, actorId, summary, generatedAt) {
    return (0, workspace_projection_1.projectTransactionWorkspace)({
        transaction: (0, transaction_workspace_1.toWorkspaceTransaction)(record),
        viewerId: actorId,
        protocol: summary.protocol,
        proof: summary.proof,
        returnPassport: summary.returnWorkflow,
        returnProtocol: summary.returnProtocol,
        inviteSentAt: summary.inviteSentAt,
        pendingCount: summary.pendingCount,
        generatedAt,
    });
}
class TransactionWorkspaceApplicationService {
    repository;
    now;
    constructor(repository, now = () => new Date()) {
        this.repository = repository;
        this.now = now;
    }
    async getWorkspace(actorId, transactionId) {
        return (0, operation_log_1.withOperationLog)('workspace.detail', () => this.getWorkspaceInner(actorId, transactionId), {
            transactionIdHash: transactionId.slice(-8),
        });
    }
    async listWorkspaces(actorId, options = {}) {
        const started = Date.now();
        const metrics = {
            workspaceCount: 0,
            firestoreReads: options.records ? 0 : 1,
            summaryHits: 0,
            hydratedCount: 0,
            evidenceHydrationMs: 0,
            commerceHydrationMs: 0,
            proofEligibilityMs: 0,
        };
        try {
            const limit = Math.min(Math.max(options.limit ?? 50, 1), 50);
            const records = options.records ?? await this.repository.listForParticipant(actorId, limit);
            const selected = options.transactionIds?.length
                ? records.filter((record) => options.transactionIds.includes(record.id))
                : records;
            const summaries = await this.loadSummaries(selected.map((record) => record.id));
            metrics.firestoreReads += summaries.reads;
            const generatedAt = this.now().toISOString();
            const workspaces = await Promise.all(selected.map((record) => this.projectListed(actorId, record, summaries.byId.get(record.id) ?? null, generatedAt, metrics)));
            metrics.workspaceCount = workspaces.length;
            (0, operation_log_1.writeOperationLog)({
                operation: 'workspace.list',
                durationMs: Date.now() - started,
                result: 'OK',
                transactionIdHash: actorId.slice(-8),
                firestoreReads: metrics.firestoreReads,
                workspaceCount: metrics.workspaceCount,
                summaryHits: metrics.summaryHits,
                hydratedCount: metrics.hydratedCount,
                evidenceHydrationMs: metrics.evidenceHydrationMs,
                commerceHydrationMs: metrics.commerceHydrationMs,
                proofEligibilityMs: metrics.proofEligibilityMs,
            });
            return workspaces;
        }
        catch (error) {
            (0, operation_log_1.writeOperationLog)({
                operation: 'workspace.list',
                durationMs: Date.now() - started,
                result: 'ERROR',
                errorClass: error instanceof Error ? error.name : 'unknown',
            });
            throw error;
        }
    }
    async getWorkspaceInner(actorId, transactionId) {
        const record = await this.requireParticipant(actorId, transactionId);
        const hydrateStarted = Date.now();
        const [artifacts, returns, timeline, commerce] = await Promise.all([
            this.repository.listEvidence(record.id),
            this.repository.listReturns(record.id),
            this.repository.listTimeline(record.id),
            record.commerceContextId ? this.repository.findCommerceContext(record.commerceContextId) : Promise.resolve(null),
        ]);
        const evidenceHydrationMs = Date.now() - hydrateStarted;
        const proofStarted = Date.now();
        const workspace = projectWorkspaceFromLoadedFacts({
            record,
            actorId,
            artifacts,
            returns,
            commerce,
            timeline,
            generatedAt: this.now().toISOString(),
        });
        (0, operation_log_1.writeOperationLog)({
            operation: 'workspace.hydrate',
            durationMs: Date.now() - hydrateStarted,
            result: 'OK',
            transactionIdHash: transactionId.slice(-8),
            firestoreReads: 4 + (record.commerceContextId ? 1 : 0),
            evidenceHydrationMs,
            commerceHydrationMs: record.commerceContextId ? evidenceHydrationMs : 0,
            proofEligibilityMs: Date.now() - proofStarted,
        });
        await this.persistSummary(record, workspace, artifacts, returns, timeline);
        return workspace;
    }
    async projectListed(actorId, record, summary, generatedAt, metrics) {
        const revision = record.updatedAt.toISOString();
        if (summary && summary.transactionRevision === revision) {
            metrics.summaryHits += 1;
            return projectWorkspaceFromSummary(record, actorId, summary, generatedAt);
        }
        metrics.hydratedCount += 1;
        const hydrateStarted = Date.now();
        const [artifacts, returns, commerce, timeline] = await Promise.all([
            this.repository.listEvidence(record.id),
            this.repository.listReturns(record.id),
            record.commerceContextId ? this.repository.findCommerceContext(record.commerceContextId) : Promise.resolve(null),
            this.repository.listTimeline(record.id),
        ]);
        metrics.firestoreReads += 3 + (record.commerceContextId ? 1 : 0);
        metrics.evidenceHydrationMs += Date.now() - hydrateStarted;
        const proofStarted = Date.now();
        const workspace = projectWorkspaceFromLoadedFacts({
            record,
            actorId,
            artifacts,
            returns,
            commerce,
            timeline,
            generatedAt,
        });
        metrics.proofEligibilityMs += Date.now() - proofStarted;
        await this.persistSummary(record, workspace, artifacts, returns, timeline);
        return workspace;
    }
    async loadSummaries(ids) {
        if (!ids.length || !this.repository.listWorkspaceSummaries) {
            return { byId: new Map(), reads: 0 };
        }
        const rows = await this.repository.listWorkspaceSummaries(ids);
        return { byId: new Map(rows.map((row) => [row.transactionId, row])), reads: 1 };
    }
    async persistSummary(record, workspace, artifacts, returns, timeline) {
        if (!this.repository.putWorkspaceSummary)
            return;
        const slices = (0, transaction_workspace_1.hydrateWorkspaceSlices)(record, artifacts, returns, null);
        await this.repository.putWorkspaceSummary({
            transactionId: record.id,
            transactionRevision: record.updatedAt.toISOString(),
            protocol: workspace.protocol,
            returnProtocol: slices.returnWorkflow
                ? (0, transaction_workspace_1.protocolFromEvidence)(artifacts, { returnPassportId: slices.returnWorkflow.id })
                : null,
            proof: workspace.proof,
            returnWorkflow: slices.returnWorkflow,
            inviteSentAt: (0, transaction_workspace_1.inviteSentAtFromTimeline)(timeline),
            pendingCount: workspace.evidenceProcessing.pendingCount,
            updatedAt: this.now().toISOString(),
        }).catch(() => undefined);
    }
    async requireParticipant(actorId, transactionId) {
        const record = await this.repository.findForParticipant(transactionId, actorId);
        if (!record)
            throw notFound();
        if (!record.participantIds.includes(actorId))
            throw forbidden();
        return record;
    }
}
exports.TransactionWorkspaceApplicationService = TransactionWorkspaceApplicationService;
//# sourceMappingURL=transaction-workspace-service.js.map