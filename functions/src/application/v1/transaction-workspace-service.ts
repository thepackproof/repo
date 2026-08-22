import { withOperationLog, writeOperationLog } from './operation-log';
import { ApplicationError } from './errors';
import type { AccessibleMerchantTransaction, StoredEvidenceRecord } from './merchant-evidence-ports';
import type { MerchantReturnPassportDto, MerchantTimelineEventDto } from './merchant-evidence-types';
import type { PortalWorkspaceRecord, PortalWorkspaceRepository } from './portal-workspace-service';
import type { PassportCommerceInput } from '../../domain/v1/passport';
import { projectTransactionWorkspace, type TransactionWorkspaceProjectionV1 } from '../../ux/workspace-projection';
import {
  evidenceProcessingFromRecords,
  hydrateWorkspaceSlices,
  inviteSentAtFromTimeline,
  protocolFromEvidence,
  toWorkspaceTransaction,
  type WorkspaceProofSlice,
  type WorkspaceReturnSlice,
} from './transaction-workspace';

export type WorkspaceSummaryRecord = {
  transactionId: string;
  transactionRevision: string;
  protocol: TransactionWorkspaceProjectionV1['protocol'];
  returnProtocol: TransactionWorkspaceProjectionV1['protocol'] | null;
  proof: WorkspaceProofSlice;
  returnWorkflow: WorkspaceReturnSlice;
  inviteSentAt: string | null;
  pendingCount: number;
  updatedAt: string;
};

export type WorkspaceRepository = PortalWorkspaceRepository & {
  listWorkspaceSummaries?(ids: readonly string[]): Promise<WorkspaceSummaryRecord[]>;
  putWorkspaceSummary?(summary: WorkspaceSummaryRecord): Promise<void>;
};

export type WorkspaceListMetrics = {
  workspaceCount: number;
  firestoreReads: number;
  summaryHits: number;
  hydratedCount: number;
  evidenceHydrationMs: number;
  commerceHydrationMs: number;
  proofEligibilityMs: number;
};

function notFound(): ApplicationError {
  return new ApplicationError('NOT_FOUND', 'TRANSACTION_NOT_FOUND', 'The requested PackProof was not found.');
}

function forbidden(): ApplicationError {
  return new ApplicationError('FORBIDDEN', 'WORKSPACE_ACCESS_DENIED', 'You are not authorized to access this PackProof.');
}

export function projectWorkspaceFromLoadedFacts(input: {
  record: PortalWorkspaceRecord | AccessibleMerchantTransaction;
  actorId: string;
  artifacts: readonly StoredEvidenceRecord[];
  returns: readonly MerchantReturnPassportDto[];
  commerce: PassportCommerceInput | null;
  timeline?: readonly MerchantTimelineEventDto[];
  generatedAt: string;
}): TransactionWorkspaceProjectionV1 {
  const slices = hydrateWorkspaceSlices(input.record as PortalWorkspaceRecord, input.artifacts, input.returns, input.commerce);
  const processing = evidenceProcessingFromRecords(input.artifacts);
  const inviteSentAt = input.timeline ? inviteSentAtFromTimeline(input.timeline) : null;
  return projectTransactionWorkspace({
    transaction: toWorkspaceTransaction(input.record),
    viewerId: input.actorId,
    protocol: slices.protocol,
    proof: slices.proof,
    returnPassport: slices.returnWorkflow,
    returnProtocol: slices.returnWorkflow
      ? protocolFromEvidence(input.artifacts, { returnPassportId: slices.returnWorkflow.id })
      : null,
    inviteSentAt,
    evidenceProcessing: processing.phase ? { phase: processing.phase } : null,
    pendingCount: processing.pendingCount,
    generatedAt: input.generatedAt,
  });
}

export function projectWorkspaceFromSummary(
  record: PortalWorkspaceRecord | AccessibleMerchantTransaction,
  actorId: string,
  summary: WorkspaceSummaryRecord,
  generatedAt: string,
): TransactionWorkspaceProjectionV1 {
  return projectTransactionWorkspace({
    transaction: toWorkspaceTransaction(record),
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

export class TransactionWorkspaceApplicationService {
  constructor(
    private readonly repository: WorkspaceRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getWorkspace(actorId: string, transactionId: string): Promise<TransactionWorkspaceProjectionV1> {
    return withOperationLog('workspace.detail', () => this.getWorkspaceInner(actorId, transactionId), {
      transactionIdHash: transactionId.slice(-8),
    });
  }

  async listWorkspaces(actorId: string, options: { limit?: number; transactionIds?: readonly string[]; records?: PortalWorkspaceRecord[] } = {}): Promise<TransactionWorkspaceProjectionV1[]> {
    const started = Date.now();
    const metrics: WorkspaceListMetrics = {
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
        ? records.filter((record) => options.transactionIds!.includes(record.id))
        : records;
      const summaries = await this.loadSummaries(selected.map((record) => record.id));
      metrics.firestoreReads += summaries.reads;
      const generatedAt = this.now().toISOString();
      const workspaces = await Promise.all(selected.map((record) => this.projectListed(actorId, record, summaries.byId.get(record.id) ?? null, generatedAt, metrics)));
      metrics.workspaceCount = workspaces.length;
      writeOperationLog({
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
    } catch (error) {
      writeOperationLog({
        operation: 'workspace.list',
        durationMs: Date.now() - started,
        result: 'ERROR',
        errorClass: error instanceof Error ? error.name : 'unknown',
      });
      throw error;
    }
  }

  private async getWorkspaceInner(actorId: string, transactionId: string): Promise<TransactionWorkspaceProjectionV1> {
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
    writeOperationLog({
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

  private async projectListed(
    actorId: string,
    record: PortalWorkspaceRecord,
    summary: WorkspaceSummaryRecord | null,
    generatedAt: string,
    metrics: WorkspaceListMetrics,
  ): Promise<TransactionWorkspaceProjectionV1> {
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

  private async loadSummaries(ids: readonly string[]): Promise<{ byId: Map<string, WorkspaceSummaryRecord>; reads: number }> {
    if (!ids.length || !this.repository.listWorkspaceSummaries) {
      return { byId: new Map(), reads: 0 };
    }
    const rows = await this.repository.listWorkspaceSummaries(ids);
    return { byId: new Map(rows.map((row) => [row.transactionId, row])), reads: 1 };
  }

  private async persistSummary(
    record: PortalWorkspaceRecord,
    workspace: TransactionWorkspaceProjectionV1,
    artifacts: readonly StoredEvidenceRecord[],
    returns: readonly MerchantReturnPassportDto[],
    timeline: readonly MerchantTimelineEventDto[],
  ): Promise<void> {
    if (!this.repository.putWorkspaceSummary) return;
    const slices = hydrateWorkspaceSlices(record, artifacts, returns, null);
    await this.repository.putWorkspaceSummary({
      transactionId: record.id,
      transactionRevision: record.updatedAt.toISOString(),
      protocol: workspace.protocol,
      returnProtocol: slices.returnWorkflow
        ? protocolFromEvidence(artifacts, { returnPassportId: slices.returnWorkflow.id })
        : null,
      proof: workspace.proof,
      returnWorkflow: slices.returnWorkflow,
      inviteSentAt: inviteSentAtFromTimeline(timeline),
      pendingCount: workspace.evidenceProcessing.pendingCount,
      updatedAt: this.now().toISOString(),
    }).catch(() => undefined);
  }

  private async requireParticipant(actorId: string, transactionId: string): Promise<PortalWorkspaceRecord> {
    const record = await this.repository.findForParticipant(transactionId, actorId);
    if (!record) throw notFound();
    if (!record.participantIds.includes(actorId)) throw forbidden();
    return record;
  }
}
