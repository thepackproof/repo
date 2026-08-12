import { onCall } from 'firebase-functions/v2/https';
import { assertParticipant, getTransaction, requireUid } from './helpers';
import { transactionIdSchema } from './validation';

const REQUIRED_REGIONS = ['LABEL_IDENTIFIER', 'INK_EDGE_A', 'INK_EDGE_B', 'LABEL_BOX_BOUNDARY', 'ADJACENT_CARDBOARD'] as const;
const FRAMES_PER_REGION = 3;

type FrameRecord = {
  id?: string;
  type?: string;
  captureGroupId?: string | null;
  physicalRegionId?: string | null;
  captureProfileId?: string | null;
  physicalCaptureIntent?: 'REFERENCE' | 'VERIFICATION' | null;
  physicalFrameIndex?: number | null;
  assurance?: { acquisitionQuality?: { status?: string } };
  createdAt?: FirebaseFirestore.Timestamp;
};

type GroupSummary = {
  captureGroupId: string;
  profileId: string | null;
  frameCount: number;
  usableFrameCount: number;
  regionCounts: Record<string, number>;
  complete: boolean;
  missing: string[];
  createdAtMillis: number;
};

function summarizeGroups(records: FrameRecord[], intent: 'REFERENCE' | 'VERIFICATION'): GroupSummary[] {
  const grouped = new Map<string, FrameRecord[]>();
  for (const record of records) {
    if (record.physicalCaptureIntent !== intent || !record.captureGroupId) continue;
    const list = grouped.get(record.captureGroupId) ?? [];
    list.push(record);
    grouped.set(record.captureGroupId, list);
  }

  return Array.from(grouped.entries()).map(([captureGroupId, frames]) => {
    const usable = frames.filter((frame) => frame.assurance?.acquisitionQuality?.status !== 'FAIL');
    const regionCounts: Record<string, number> = {};
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

export const getPhysicalCorrespondenceStatus = onCall({ enforceAppCheck: true }, async (request) => {
  const uid = requireUid(request);
  const { transactionId } = transactionIdSchema.parse(request.data);
  const { data } = await getTransaction(transactionId);
  assertParticipant(data, uid);

  const evidenceSnap = await getTransaction(transactionId).then(({ ref }) => ref.collection('evidence')
    .where('type', 'in', ['PHYSICAL_REFERENCE_FRAME', 'PHYSICAL_VERIFICATION_FRAME'])
    .get());
  const records = evidenceSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as FrameRecord));
  const references = summarizeGroups(records, 'REFERENCE');
  const verifications = summarizeGroups(records, 'VERIFICATION');
  // Prefer the earliest complete enrollment. Once a valid pre-handoff reference
  // exists, later capture attempts must not silently replace the evidentiary basis.
  const reference = [...references].reverse().find((group) => group.complete) ?? references[0] ?? null;
  // For verification, the most recent completed/attempted capture is the questioned set.
  const verification = verifications.find((group) => group.complete) ?? verifications[0] ?? null;

  if (!reference) {
    return {
      decision: 'NOT_EVALUATED' as const,
      reason: 'NO_REFERENCE_CAPTURE',
      reference: null,
      verification,
      matcher: { status: 'VALIDATION_REQUIRED', modelVersion: null, thresholdPolicyVersion: null, score: null },
      claimClass: 'V' as const,
    };
  }
  if (!reference.complete) {
    return {
      decision: 'FTA' as const,
      reason: 'REFERENCE_CAPTURE_INCOMPLETE',
      reference,
      verification,
      matcher: { status: 'VALIDATION_REQUIRED', modelVersion: null, thresholdPolicyVersion: null, score: null },
      claimClass: 'V' as const,
    };
  }
  if (!verification) {
    return {
      decision: 'NOT_EVALUATED' as const,
      reason: 'NO_VERIFICATION_CAPTURE',
      reference,
      verification: null,
      matcher: { status: 'VALIDATION_REQUIRED', modelVersion: null, thresholdPolicyVersion: null, score: null },
      claimClass: 'V' as const,
    };
  }
  if (!verification.complete) {
    return {
      decision: 'FTA' as const,
      reason: 'VERIFICATION_CAPTURE_INCOMPLETE',
      reference,
      verification,
      matcher: { status: 'VALIDATION_REQUIRED', modelVersion: null, thresholdPolicyVersion: null, score: null },
      claimClass: 'V' as const,
    };
  }

  // A completed acquisition set is intentionally not converted into a similarity
  // score until PackProof has a frozen extractor/matcher, pre-registered
  // thresholds and independent blind validation for this profile/population.
  return {
    decision: 'INCONCLUSIVE' as const,
    reason: 'MATCHER_NOT_YET_VALIDATED',
    reference,
    verification,
    matcher: {
      status: 'VALIDATION_REQUIRED' as const,
      modelVersion: null,
      thresholdPolicyVersion: null,
      score: null,
    },
    claimClass: 'V' as const,
  };
});
