#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const inputPath = process.argv[2] ?? path.join('validation', 'physical-validation-example.json');
if (!fs.existsSync(inputPath)) {
  console.error(`Validation input not found: ${inputPath}`);
  process.exit(2);
}

const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const trials = Array.isArray(payload.trials) ? payload.trials : [];
if (!trials.length) {
  console.error('Validation input must contain at least one trial.');
  process.exit(2);
}

const allowedDecisions = new Set(['MATCH', 'NON_MATCH', 'INCONCLUSIVE', 'FTA']);
const allowedTruth = new Set(['SAME_SOURCE', 'DIFFERENT_SOURCE']);
for (const [i, trial] of trials.entries()) {
  if (!trial.independentUnitId) throw new Error(`trial[${i}] missing independentUnitId`);
  if (!allowedTruth.has(trial.groundTruth)) throw new Error(`trial[${i}] invalid groundTruth`);
  if (!allowedDecisions.has(trial.decision)) throw new Error(`trial[${i}] invalid decision`);
}

function rate(n, d) { return d ? n / d : null; }
function pct(v) { return v == null ? 'n/a' : `${(v * 100).toFixed(6)}%`; }
function zeroEventUpper95(n) { return n > 0 ? 1 - Math.pow(0.05, 1 / n) : null; }

const same = trials.filter(t => t.groundTruth === 'SAME_SOURCE');
const different = trials.filter(t => t.groundTruth === 'DIFFERENT_SOURCE');
const scorableSame = same.filter(t => !['INCONCLUSIVE', 'FTA'].includes(t.decision));
const scorableDifferent = different.filter(t => !['INCONCLUSIVE', 'FTA'].includes(t.decision));
const falseNonMatches = scorableSame.filter(t => t.decision === 'NON_MATCH').length;
const falseMatches = scorableDifferent.filter(t => t.decision === 'MATCH').length;
const inconclusive = trials.filter(t => t.decision === 'INCONCLUSIVE').length;
const fta = trials.filter(t => t.decision === 'FTA').length;

const unitIds = new Set(trials.map(t => t.independentUnitId));
const duplicateUnits = trials.length - unitIds.size;
const ordinaryDifferent = different.filter(t => !t.attackClass);
const attacks = different.filter(t => t.attackClass);
const attackAccepted = attacks.filter(t => t.decision === 'MATCH').length;

const report = {
  protocol: payload.protocol ?? null,
  frozenArtifacts: payload.frozenArtifacts ?? null,
  counts: {
    trials: trials.length,
    independentUnits: unitIds.size,
    repeatedObservationsWithinUnits: duplicateUnits,
    sameSourceTrials: same.length,
    differentSourceTrials: different.length,
    ordinaryDifferentSourceTrials: ordinaryDifferent.length,
    attackTrials: attacks.length,
  },
  metrics: {
    fmrConditionalOnScorable: rate(falseMatches, scorableDifferent.length),
    fnmrConditionalOnScorable: rate(falseNonMatches, scorableSame.length),
    inconclusiveRate: rate(inconclusive, trials.length),
    failureToAcquireRate: rate(fta, trials.length),
    attackSuccessRate: rate(attackAccepted, attacks.length),
  },
  confidenceNotes: {
    differentSourceZeroFalseMatchUpper95Exact:
      falseMatches === 0 ? zeroEventUpper95(new Set(scorableDifferent.map(t => t.independentUnitId)).size) : null,
    sameSourceZeroFalseNonMatchUpper95Exact:
      falseNonMatches === 0 ? zeroEventUpper95(new Set(scorableSame.map(t => t.independentUnitId)).size) : null,
  },
  warnings: [],
};

if (duplicateUnits > 0) report.warnings.push('Repeated observations share independentUnitId. Trial rows must not be treated as independent simply because multiple image comparisons exist. Use cluster-aware inference for formal confidence intervals.');
if (!payload.frozenArtifacts?.modelHash || !payload.frozenArtifacts?.thresholdPolicyVersion) report.warnings.push('Model hash and threshold policy are not frozen. Results are developmental and cannot be reported as a blind confirmatory PackProof performance claim.');
if (payload.blindTest !== true) report.warnings.push('Dataset is not marked as an independently controlled blind test. Treat metrics as development/feasibility evidence only.');

console.log(JSON.stringify(report, null, 2));
console.error(`\nFMR (scorable different-source): ${pct(report.metrics.fmrConditionalOnScorable)}`);
console.error(`FNMR (scorable same-source): ${pct(report.metrics.fnmrConditionalOnScorable)}`);
console.error(`FTA: ${pct(report.metrics.failureToAcquireRate)} | Inconclusive: ${pct(report.metrics.inconclusiveRate)}`);
if (report.confidenceNotes.differentSourceZeroFalseMatchUpper95Exact != null) {
  console.error(`Zero-FM exact one-sided 95% upper bound using unique independent units: ${pct(report.confidenceNotes.differentSourceZeroFalseMatchUpper95Exact)}`);
}
