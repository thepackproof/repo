export type TelemetryStage =
  | 'capture'
  | 'encrypt'
  | 'upload'
  | 'finalize'
  | 'proof_ready';

export type TelemetrySample = {
  stage: TelemetryStage;
  durationMs: number;
  retryCount?: number;
  networkClass?: string | null;
  deviceModel?: string | null;
};

export function percentile(values: readonly number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[rank];
}

export function stagePercentiles(samples: readonly TelemetrySample[], stage: TelemetryStage) {
  const values = samples.filter((sample) => sample.stage === stage).map((sample) => sample.durationMs);
  return {
    count: values.length,
    p50: percentile(values, 50),
    p75: percentile(values, 75),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
  };
}
