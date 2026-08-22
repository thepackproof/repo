export type PhysicalCorrespondenceStatus = 'NOT_AVAILABLE';

export type ScientificGate = {
  frozenModelId: string | null;
  frozenEvaluationCriteria: boolean;
  documentedEligibleInputs: boolean;
  falsePositiveAnalysis: boolean;
  independentEvaluation: boolean;
  versionedModelIdentity: boolean;
  humanReviewLanguage: boolean;
};

export const HC1_SCIENTIFIC_GATE: ScientificGate = {
  frozenModelId: null,
  frozenEvaluationCriteria: false,
  documentedEligibleInputs: false,
  falsePositiveAnalysis: false,
  independentEvaluation: false,
  versionedModelIdentity: false,
  humanReviewLanguage: true,
};

export function scientificGatePassed(gate: ScientificGate): boolean {
  return Boolean(
    gate.frozenModelId
    && gate.frozenEvaluationCriteria
    && gate.documentedEligibleInputs
    && gate.falsePositiveAnalysis
    && gate.independentEvaluation
    && gate.versionedModelIdentity
    && gate.humanReviewLanguage,
  );
}

export function physicalCorrespondenceStatus(gate: ScientificGate = HC1_SCIENTIFIC_GATE): PhysicalCorrespondenceStatus {
  if (!scientificGatePassed(gate)) return 'NOT_AVAILABLE';
  return 'NOT_AVAILABLE';
}

export function rejectModelMatchShortcut(modelOutput: string): void {
  const forbidden = /^(MATCH|NON_MATCH|AUTHENTIC|FRAUD)$/i;
  if (forbidden.test(modelOutput.trim())) {
    throw new Error('Model output cannot become a physical MATCH or authenticity verdict.');
  }
}
