export const PHYSICAL_CAPTURE_PROFILE_ID = 'PP-PHYSICAL-MATTE-V1' as const;
export const PHYSICAL_CAPTURE_PROFILE_VERSION = 1 as const;
export const PHYSICAL_QUALITY_POLICY_ID = 'PP-QUALITY-V1' as const;

export type PhysicalCaptureIntent = 'REFERENCE' | 'VERIFICATION';
export type PhysicalRegionId =
  | 'LABEL_IDENTIFIER'
  | 'INK_EDGE_A'
  | 'INK_EDGE_B'
  | 'LABEL_BOX_BOUNDARY'
  | 'ADJACENT_CARDBOARD';

export type PhysicalRegionDefinition = {
  id: PhysicalRegionId;
  title: string;
  instruction: string;
  rationale: string;
};

export const PHYSICAL_REGION_PLAN: readonly PhysicalRegionDefinition[] = [
  {
    id: 'LABEL_IDENTIFIER',
    title: 'Identifier region',
    instruction: 'Fill the guide with the printed or handwritten identifier and a small margin of untouched label material.',
    rationale: 'Provides coarse registration context plus local print/ink and label-substrate variation.',
  },
  {
    id: 'INK_EDGE_A',
    title: 'Ink / substrate edge A',
    instruction: 'Frame a high-contrast stroke edge so both the mark and unmarked label fibers are visible.',
    rationale: 'Targets local edge breakup and deposition/wetting variation rather than readable text alone.',
  },
  {
    id: 'INK_EDGE_B',
    title: 'Ink / substrate edge B',
    instruction: 'Capture a second, spatially separate stroke edge with the same close framing.',
    rationale: 'Reduces dependence on a single easily copied patch and supports partial-damage tolerance research.',
  },
  {
    id: 'LABEL_BOX_BOUNDARY',
    title: 'Label / box bridge',
    instruction: 'Center the boundary where the label ends and the cardboard begins. Include texture on both sides.',
    rationale: 'Binds label-local evidence to adjacent package structure and raises the cost of simple label-only substitution.',
  },
  {
    id: 'ADJACENT_CARDBOARD',
    title: 'Adjacent cardboard',
    instruction: 'Capture a clean cardboard patch immediately beside the label or bridge, avoiding large printed graphics.',
    rationale: 'Adds independent substrate texture and contextual structure outside the label itself.',
  },
] as const;

export const PHYSICAL_FRAMES_PER_REGION = 3 as const;
export const PHYSICAL_CAPTURE_FRAME_COUNT = PHYSICAL_REGION_PLAN.length * PHYSICAL_FRAMES_PER_REGION;

export type PhysicalCaptureProfileTelemetry = {
  profileId: typeof PHYSICAL_CAPTURE_PROFILE_ID;
  profileVersion: typeof PHYSICAL_CAPTURE_PROFILE_VERSION;
  qualityPolicyId: typeof PHYSICAL_QUALITY_POLICY_ID;
  intendedUse: PhysicalCaptureIntent;
  captureGroupId: string;
  acquisitionMode: 'GUIDED_MULTI_FRAME';
  requestedRegions: PhysicalRegionId[];
  observedRegion: PhysicalRegionId;
  frameIndex: number;
  framesPerRegion: number;
  totalFrameCount: number;
  captureAttempt: number;
  clientImage: {
    widthPx: number | null;
    heightPx: number | null;
    gate: 'CLIENT_DIMENSION_PASS_SERVER_QUALITY_PENDING' | 'CLIENT_DIMENSION_FAIL';
    qualitySignals: {
      algorithm: 'PP_IMAGE_QUALITY_SIGNAL_V1';
      sourceWidthPx: number;
      sourceHeightPx: number;
      sampleWidthPx: number;
      sampleHeightPx: number;
      meanLuminance: number;
      luminanceStdDev: number;
      p05Luminance: number;
      p95Luminance: number;
      shadowClippingFraction: number;
      highlightClippingFraction: number;
      laplacianVariance: number;
      interpretation: 'MEASUREMENT_SIGNAL_ONLY_THRESHOLDS_NOT_VALIDATED';
    };
  };
};

export function clientDimensionGate(width: number | null | undefined, height: number | null | undefined) {
  const w = typeof width === 'number' ? width : null;
  const h = typeof height === 'number' ? height : null;
  const longest = Math.max(w ?? 0, h ?? 0);
  const shortest = Math.min(w ?? 0, h ?? 0);
  const passed = longest >= 1600 && shortest >= 1200;
  return {
    widthPx: w,
    heightPx: h,
    gate: passed ? 'CLIENT_DIMENSION_PASS_SERVER_QUALITY_PENDING' as const : 'CLIENT_DIMENSION_FAIL' as const,
  };
}
