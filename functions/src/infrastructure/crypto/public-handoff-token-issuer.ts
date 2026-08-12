import { createHash, createHmac } from 'node:crypto';
import type { PublicHandoffTokenIssuer } from '../../application/v1/public-commerce-handoff-service';

export class HmacPublicHandoffTokenIssuer implements PublicHandoffTokenIssuer {
  constructor(private readonly getSigningSecret: () => string) {}

  issue(handoffId: string): string {
    const secret = this.getSigningSecret();
    if (secret.length < 32) throw new Error('PUBLIC_HANDOFF_SIGNING_SECRET must contain at least 32 characters.');
    return createHmac('sha256', secret)
      .update(`public-commerce-handoff-token-v1\n${handoffId}`)
      .digest('base64url');
  }

  digest(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
