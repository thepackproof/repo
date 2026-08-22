"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyTransactionWorkspace = exports.getMyTransactionWorkspaces = void 0;
const https_1 = require("firebase-functions/v2/https");
const config_1 = require("./config");
const portal_workspace_service_1 = require("./application/v1/portal-workspace-service");
const merchant_evidence_repository_1 = require("./infrastructure/firebase/v1/merchant-evidence-repository");
const helpers_1 = require("./helpers");
const callOptions = { enforceAppCheck: true, invoker: 'public' };
function workspaceService() {
    return new portal_workspace_service_1.PortalWorkspaceApplicationService(new merchant_evidence_repository_1.FirestorePortalWorkspaceRepository(new merchant_evidence_repository_1.FirestoreMerchantEvidenceRepository(config_1.db)), { append: async () => undefined }, () => config_1.connectLinkBaseUrl.value());
}
exports.getMyTransactionWorkspaces = (0, https_1.onCall)(callOptions, async (request) => {
    const uid = (0, helpers_1.requireUid)(request);
    const rawIds = request.data?.transactionIds;
    const transactionIds = Array.isArray(rawIds)
        ? rawIds.filter((value) => typeof value === 'string' && value.length >= 10).slice(0, 50)
        : [];
    const service = workspaceService();
    const listed = await service.listHydratedForActor(uid, 50);
    const selected = transactionIds.length
        ? listed.filter((item) => transactionIds.includes(item.id))
        : listed;
    return {
        object: 'transaction_workspace_list',
        schemaVersion: 1,
        workspaces: selected.map((item) => ({
            transactionId: item.id,
            protocol: item.protocol,
            proof: item.proof,
        })),
    };
});
exports.getMyTransactionWorkspace = (0, https_1.onCall)(callOptions, async (request) => {
    const uid = (0, helpers_1.requireUid)(request);
    const transactionId = typeof request.data?.transactionId === 'string' ? request.data.transactionId : '';
    if (!transactionId)
        throw new https_1.HttpsError('invalid-argument', 'A transactionId is required.');
    const service = workspaceService();
    try {
        const item = await service.getHydratedForActor(uid, transactionId);
        return {
            object: 'transaction_workspace_slice',
            schemaVersion: 1,
            transactionId: item.id,
            protocol: item.protocol,
            proof: item.proof,
        };
    }
    catch (error) {
        throw new https_1.HttpsError('not-found', error instanceof Error ? error.message : 'This PackProof was not found.');
    }
});
//# sourceMappingURL=workspace-callables.js.map