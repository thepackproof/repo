export const digestAlgorithms = ['SHA-256'] as const;
export type DigestAlgorithm = (typeof digestAlgorithms)[number];

export const digestComputations = ['SERVER_RECOMPUTED', 'CLIENT_COMPUTED', 'THIRD_PARTY_DECLARED'] as const;
export type DigestComputation = (typeof digestComputations)[number];

export type DigestAssurance = {
  value: string;
  algorithm: DigestAlgorithm;
  computation: DigestComputation;
  boundArtifactAvailable: boolean;
};

export function digestAssurance(input: {
  value: string;
  computation: DigestComputation;
  boundArtifactAvailable: boolean;
}): DigestAssurance {
  return {
    value: input.value,
    algorithm: 'SHA-256',
    computation: input.computation,
    boundArtifactAvailable: input.boundArtifactAvailable,
  };
}

export function compareClientAndServerDigests(input: {
  client: string | null;
  server: string | null;
}): 'MATCHED' | 'MISMATCH' | 'NOT_COMPARED' {
  if (!input.client || !input.server) return 'NOT_COMPARED';
  return input.client === input.server ? 'MATCHED' : 'MISMATCH';
}
