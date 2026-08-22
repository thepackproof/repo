"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WORKSPACE_PROJECTION_VERSION = void 0;
exports.sourceTransactionRevisionOf = sourceTransactionRevisionOf;
exports.evidenceProcessingStateFromPhase = evidenceProcessingStateFromPhase;
exports.projectTransactionWorkspace = projectTransactionWorkspace;
// GENERATED FROM shared/ux. Do not edit. Run `node scripts/sync-ux-to-functions.mjs`.
/**
 * Canonical Transaction Workspace Projection.
 * Presentation layers consume this object. They do not assemble workflow truth.
 */
const next_action_1 = require("./next-action");
exports.WORKSPACE_PROJECTION_VERSION = '1.0.0';
function sourceTransactionRevisionOf(value) {
    if (typeof value === 'string')
        return value;
    if (value && typeof value === 'object' && typeof value.toDate === 'function') {
        return value.toDate().toISOString();
    }
    if (value && typeof value === 'object' && typeof value.seconds === 'number') {
        return new Date(value.seconds * 1000).toISOString();
    }
    return '';
}
function evidenceProcessingStateFromPhase(phase) {
    if (phase === 'UPLOADING')
        return 'UPLOADING';
    if (phase === 'SECURING')
        return 'FINALIZING';
    if (phase === 'FAILED_RETRY')
        return 'LOCAL_PENDING';
    if (phase === 'FAILED_RECAPTURE')
        return 'ATTENTION_REQUIRED';
    return 'IDLE';
}
function projectTransactionWorkspace(input) {
    const nextAction = (0, next_action_1.resolveNextRequiredAction)({
        transaction: input.transaction,
        viewerId: input.viewerId,
        protocol: input.protocol,
        proof: { availability: input.proof.availability },
        returnPassport: input.returnPassport,
        returnProtocol: input.returnPassport ? (input.returnProtocol ?? next_action_1.ABSENT_PROTOCOL) : null,
        otherPartyName: input.otherPartyName,
        inviteSentAt: input.inviteSentAt,
        evidenceProcessing: input.evidenceProcessing,
    });
    return {
        schemaVersion: 1,
        projectionVersion: exports.WORKSPACE_PROJECTION_VERSION,
        transactionId: input.transaction.id,
        sourceTransactionRevision: sourceTransactionRevisionOf(input.transaction.updatedAt),
        viewer: {
            actorId: input.viewerId,
            role: (0, next_action_1.viewerRole)(input.transaction, input.viewerId),
        },
        lifecycle: {
            transactionStatus: input.transaction.status,
            humanState: nextAction.humanState,
            consumerState: nextAction.consumerState,
        },
        protocol: input.protocol,
        evidenceProcessing: {
            state: evidenceProcessingStateFromPhase(input.evidenceProcessing?.phase),
            pendingCount: input.pendingCount ?? 0,
        },
        nextAction: {
            ...nextAction,
            passportReady: (0, next_action_1.proofCanBeViewed)(input.proof.availability),
        },
        proof: {
            availability: input.proof.availability,
            passportId: input.proof.passportId,
            displayId: input.proof.displayId,
        },
        returnWorkflow: input.returnPassport && !['COMPLETED', 'CANCELLED'].includes(input.returnPassport.status)
            ? { returnPassportId: input.returnPassport.id, status: input.returnPassport.status }
            : null,
        display: {
            title: input.transaction.title,
            priceMinor: input.transaction.priceMinor,
            currency: input.transaction.currency,
        },
        generatedAt: input.generatedAt,
    };
}
//# sourceMappingURL=workspace-projection.js.map