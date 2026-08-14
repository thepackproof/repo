"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPhysicalCorrespondenceStatus = void 0;
const https_1 = require("firebase-functions/v2/https");
const helpers_1 = require("./helpers");
const validation_1 = require("./validation");
const REQUIRED_REGIONS = ['LABEL_IDENTIFIER', 'INK_EDGE_A', 'INK_EDGE_B', 'LABEL_BOX_BOUNDARY', 'ADJACENT_CARDBOARD'];
const FRAMES_PER_REGION = 3;
function summarizeGroups(records, intent) {
    const grouped = new Map();
    for (const record of records) {
        if (record.physicalCaptureIntent !== intent || !record.captureGroupId)
            continue;
        const list = grouped.get(record.captureGroupId) ?? [];
        list.push(record);
        grouped.set(record.captureGroupId, list);
    }
    return Array.from(grouped.entries()).map(([captureGroupId, frames]) => {
        const usable = frames.filter((frame) => frame.assurance?.acquisitionQuality?.status !== 'FAIL');
        const regionCounts = {};
        for (const region of REQUIRED_REGIONS) {
            regionCounts[region] = usable.filter((frame) => frame.physicalRegionId === region).length;
        }
        const missing = REQUIRED_REGIONS
            .filter((region) => regionCounts[region] < FRAMES_PER_REGION)
            .map((region) => `${region}:${regionCounts[region]}/${FRAMES_PER_REGION}`);
        const createdAtMillis = Math.max(...frames.map((frame) => frame.createdAt?.toMillis?.() ?? 0), 0);
        return {
            captureGroupId,
            profileId: frames.find((frame) => frame.captureProfileId)?.captureProfileId ?? null,
            frameCount: frames.length,
            usableFrameCount: usable.length,
            regionCounts,
            complete: missing.length === 0,
            missing,
            createdAtMillis,
        };
    }).sort((a, b) => b.createdAtMillis - a.createdAtMillis);
}
exports.getPhysicalCorrespondenceStatus = (0, https_1.onCall)({ enforceAppCheck: true }, async (request) => {
    const uid = (0, helpers_1.requireUid)(request);
    const { transactionId } = validation_1.transactionIdSchema.parse(request.data);
    const { data } = await (0, helpers_1.getTransaction)(transactionId);
    (0, helpers_1.assertParticipant)(data, uid);
    const evidenceSnap = await (0, helpers_1.getTransaction)(transactionId).then(({ ref }) => ref.collection('evidence')
        .where('type', 'in', ['PHYSICAL_REFERENCE_FRAME', 'PHYSICAL_VERIFICATION_FRAME'])
        .get());
    const records = evidenceSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const references = summarizeGroups(records, 'REFERENCE');
    const verifications = summarizeGroups(records, 'VERIFICATION');
    // Prefer the earliest complete enrollment. Once a valid pre-handoff reference
    // exists, later capture attempts must not silently replace the evidentiary basis.
    const reference = [...references].reverse().find((group) => group.complete) ?? references[0] ?? null;
    // For verification, the most recent completed/attempted capture is the questioned set.
    const verification = verifications.find((group) => group.complete) ?? verifications[0] ?? null;
    if (!reference) {
        return {
            observationStatus: 'NOT_EVALUATED',
            reason: 'NO_REFERENCE_CAPTURE',
            reference: null,
            verification,
            comparison: { status: 'NOT_ENABLED', artifactVersion: null, observationPolicyVersion: null, aggregateMeasurement: null },
            claimClass: 'V',
        };
    }
    if (!reference.complete) {
        return {
            observationStatus: 'ACQUISITION_INCOMPLETE',
            reason: 'REFERENCE_CAPTURE_INCOMPLETE',
            reference,
            verification,
            comparison: { status: 'NOT_ENABLED', artifactVersion: null, observationPolicyVersion: null, aggregateMeasurement: null },
            claimClass: 'V',
        };
    }
    if (!verification) {
        return {
            observationStatus: 'NOT_EVALUATED',
            reason: 'NO_VERIFICATION_CAPTURE',
            reference,
            verification: null,
            comparison: { status: 'NOT_ENABLED', artifactVersion: null, observationPolicyVersion: null, aggregateMeasurement: null },
            claimClass: 'V',
        };
    }
    if (!verification.complete) {
        return {
            observationStatus: 'ACQUISITION_INCOMPLETE',
            reason: 'VERIFICATION_CAPTURE_INCOMPLETE',
            reference,
            verification,
            comparison: { status: 'NOT_ENABLED', artifactVersion: null, observationPolicyVersion: null, aggregateMeasurement: null },
            claimClass: 'V',
        };
    }
    // A completed acquisition set is intentionally not converted into a physical
    // comparison measurement until PackProof has a frozen comparison artifact,
    // pre-registered observation policy and independent blind validation for this
    // profile/population. A future observation has no workflow or adjudication
    // authority and must never infer cause, actor, fraud, fault or disposition.
    return {
        observationStatus: 'RESEARCH_ONLY',
        reason: 'COMPARISON_NOT_ENABLED',
        reference,
        verification,
        comparison: {
            status: 'NOT_ENABLED',
            artifactVersion: null,
            observationPolicyVersion: null,
            aggregateMeasurement: null,
        },
        claimClass: 'V',
    };
});
//# sourceMappingURL=physical-correspondence.js.map