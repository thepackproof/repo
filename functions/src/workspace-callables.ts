import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from './config';
import { PortalWorkspaceApplicationService } from './application/v1/portal-workspace-service';
import { FirestoreMerchantEvidenceRepository, FirestorePortalWorkspaceRepository } from './infrastructure/firebase/v1/merchant-evidence-repository';
import { requireUid } from './helpers';

const callOptions = { enforceAppCheck: true, invoker: 'public' as const };

function workspaceService() {
  return new PortalWorkspaceApplicationService(
    new FirestorePortalWorkspaceRepository(new FirestoreMerchantEvidenceRepository(db)),
    { append: async () => undefined },
    () => '',
  );
}

export const getMyTransactionWorkspaces = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  const rawIds = request.data?.transactionIds;
  const transactionIds = Array.isArray(rawIds)
    ? rawIds.filter((value): value is string => typeof value === 'string' && value.length >= 10).slice(0, 50)
    : [];
  const service = workspaceService();
  const listed = await service.listWorkspaces(uid, 50);
  const selected = transactionIds.length
    ? listed.filter((item) => transactionIds.includes(item.transactionId))
    : listed;
  return {
    object: 'transaction_workspace_list',
    schemaVersion: 1,
    workspaces: selected,
  };
});

export const getMyTransactionWorkspace = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  const transactionId = typeof request.data?.transactionId === 'string' ? request.data.transactionId : '';
  if (!transactionId) throw new HttpsError('invalid-argument', 'A transactionId is required.');
  const service = workspaceService();
  try {
    const workspace = await service.getWorkspace(uid, transactionId);
    return {
      object: 'transaction_workspace',
      ...workspace,
    };
  } catch (error) {
    throw new HttpsError('not-found', error instanceof Error ? error.message : 'This PackProof was not found.');
  }
});
