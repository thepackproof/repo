export type VersionedEvaluation = {
  schemaVersion: number;
  policyVersion: string;
  producerVersion?: string | null;
  parserVersion?: string | null;
};

export function evaluationPolicyForRecord(captured: VersionedEvaluation, current: VersionedEvaluation): VersionedEvaluation {
  return {
    schemaVersion: captured.schemaVersion,
    policyVersion: captured.policyVersion,
    producerVersion: captured.producerVersion ?? null,
    parserVersion: captured.parserVersion ?? null,
  };
}

export function maySilentlyReinterpret(captured: VersionedEvaluation, current: VersionedEvaluation): boolean {
  return captured.schemaVersion === current.schemaVersion && captured.policyVersion === current.policyVersion;
}
