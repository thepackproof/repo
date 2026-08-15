export type PhysicalGroupSummaryView = {
  captureGroupId: string;
  frameCount: number;
  usableFrameCount: number;
  complete: boolean;
  missing: string[];
};

export type PhysicalStatusView = {
  observationStatus: 'NOT_EVALUATED' | 'ACQUISITION_INCOMPLETE' | 'RESEARCH_ONLY';
  reason: string;
  reference: PhysicalGroupSummaryView | null;
  verification: PhysicalGroupSummaryView | null;
  comparison: {
    status: 'NOT_ENABLED';
    artifactVersion: null;
    observationPolicyVersion: null;
    aggregateMeasurement: null;
  };
  claimClass: 'V';
};

const observationStatuses = new Set<PhysicalStatusView['observationStatus']>([
  'NOT_EVALUATED',
  'ACQUISITION_INCOMPLETE',
  'RESEARCH_ONLY',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonNegativeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function normalizeGroupSummary(value: unknown): PhysicalGroupSummaryView | null {
  if (!isRecord(value)) return null;
  return {
    captureGroupId: typeof value.captureGroupId === 'string' ? value.captureGroupId : '',
    frameCount: nonNegativeNumber(value.frameCount),
    usableFrameCount: nonNegativeNumber(value.usableFrameCount),
    complete: value.complete === true,
    missing: Array.isArray(value.missing)
      ? value.missing.filter((entry): entry is string => typeof entry === 'string')
      : [],
  };
}

export function formatRuntimeEnum(value: unknown, fallback = 'Unavailable'): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  return value.trim().replace(/_/g, ' ');
}

export function normalizePhysicalStatus(value: unknown): PhysicalStatusView | null {
  if (!isRecord(value)) return null;
  const rawStatus = value.observationStatus;
  const observationStatus = typeof rawStatus === 'string' && observationStatuses.has(rawStatus as PhysicalStatusView['observationStatus'])
    ? rawStatus as PhysicalStatusView['observationStatus']
    : 'NOT_EVALUATED';

  return {
    observationStatus,
    reason: typeof value.reason === 'string' && value.reason.trim() ? value.reason : 'STATUS_UNAVAILABLE',
    reference: normalizeGroupSummary(value.reference),
    verification: normalizeGroupSummary(value.verification),
    comparison: {
      status: 'NOT_ENABLED',
      artifactVersion: null,
      observationPolicyVersion: null,
      aggregateMeasurement: null,
    },
    claimClass: 'V',
  };
}
