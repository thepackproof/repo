"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.percentile = percentile;
exports.stagePercentiles = stagePercentiles;
function percentile(values, p) {
    if (!values.length)
        return null;
    const sorted = [...values].sort((a, b) => a - b);
    const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[rank];
}
function stagePercentiles(samples, stage) {
    const values = samples.filter((sample) => sample.stage === stage).map((sample) => sample.durationMs);
    return {
        count: values.length,
        p50: percentile(values, 50),
        p75: percentile(values, 75),
        p95: percentile(values, 95),
        p99: percentile(values, 99),
    };
}
//# sourceMappingURL=telemetry.js.map