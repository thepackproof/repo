export type IdempotencyOutcome =
  | { type: 'EXECUTE' }
  | { type: 'REPLAY' }
  | { type: 'IN_PROGRESS' }
  | { type: 'CONFLICT' };

export function resolveIdempotentMutation(input: {
  existing: { fingerprint: string; state: 'PROCESSING' | 'COMPLETE' } | null;
  incomingFingerprint: string;
  simultaneous: boolean;
}): IdempotencyOutcome {
  if (!input.existing) {
    return { type: input.simultaneous ? 'EXECUTE' : 'EXECUTE' };
  }
  if (input.existing.fingerprint !== input.incomingFingerprint) {
    return { type: 'CONFLICT' };
  }
  if (input.existing.state === 'PROCESSING') return { type: 'IN_PROGRESS' };
  return { type: 'REPLAY' };
}

export function lostResponseAfterSuccess(): IdempotencyOutcome {
  return { type: 'REPLAY' };
}

export const HC1_IDEMPOTENT_OPERATIONS = [
  'transaction.create',
  'receipt.intake',
  'buyer.invite',
  'participant.claim',
  'terms.confirm',
  'capture-session.create',
  'upload.reserve',
  'shipment.associate',
  'delivery.associate',
  'return.create',
  'return.shipment',
  'proof.snapshot',
  'proof.pdf',
  'webhook.deliver',
  'enterprise.session.create',
] as const;
