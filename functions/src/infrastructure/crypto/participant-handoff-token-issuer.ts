import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export type ParticipantHandoffTokenPurpose = 'participant-claim' | 'evidence-session';

const tokenPrefix: Readonly<Record<ParticipantHandoffTokenPurpose, string>> = {
  'participant-claim': 'pp_claim_v1_',
  'evidence-session': 'pp_capture_v1_',
};

export class HmacParticipantHandoffTokenIssuer {
  constructor(private readonly secret: () => string) {}

  issue(purpose: ParticipantHandoffTokenPurpose, resourceId: string): string {
    const secret = this.secret();
    if (secret.length < 32) throw new Error('PARTICIPANT_HANDOFF_SIGNING_SECRET is not configured.');
    const mac = createHmac('sha256', secret)
      .update(`packproof-${purpose}-token-v1\n${resourceId}`)
      .digest('base64url');
    return `${tokenPrefix[purpose]}${mac}`;
  }

  digest(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  verify(token: string, expectedDigest: string): boolean {
    const actual = Buffer.from(this.digest(token), 'hex');
    const expected = /^[a-f0-9]{64}$/.test(expectedDigest) ? Buffer.from(expectedDigest, 'hex') : Buffer.alloc(0);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
