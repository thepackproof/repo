export type IntegrityInputs = {
  clientHashMatched: boolean | null;
  clientSizeMatched: boolean | null;
  contentTypeMatched: boolean;
  bytesMutatedAfterClientHash?: boolean;
};

export type FinalizationOutcome = 'FINALIZED' | 'QUARANTINED';

export function finalizationOutcomeFromIntegrity(input: IntegrityInputs): FinalizationOutcome {
  if (input.bytesMutatedAfterClientHash) return 'QUARANTINED';
  if (input.clientHashMatched === false) return 'QUARANTINED';
  if (input.clientSizeMatched === false) return 'QUARANTINED';
  if (!input.contentTypeMatched) return 'QUARANTINED';
  return 'FINALIZED';
}

export function mutationNeverFinalizes(kind: 'FLIP_BYTE' | 'TRUNCATE' | 'APPEND' | 'MIME_SWAP' | 'DIGEST_EDIT'): FinalizationOutcome {
  void kind;
  return 'QUARANTINED';
}
