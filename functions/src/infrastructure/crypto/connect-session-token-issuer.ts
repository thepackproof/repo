import { createHash, createHmac } from 'node:crypto';
import type { ConnectSessionTokenIssuer } from '../../application/v1/commerce-context-service';

export class HmacConnectSessionTokenIssuer implements ConnectSessionTokenIssuer {
  issue(sessionId: string, signingSecret: string): string {
    return createHmac('sha256', signingSecret)
      .update(`connect-session-token-v1\n${sessionId}`)
      .digest('base64url');
  }

  digest(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
