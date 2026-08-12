import { createHash, timingSafeEqual } from 'node:crypto';
import type { HandoffTokenVerifier } from '../../application/v1/connect-handoff-service';

export class Sha256TokenVerifier implements HandoffTokenVerifier {
  verify(token: string, expectedHash: string): boolean {
    const actual = createHash('sha256').update(token).digest('hex');
    const left = Buffer.from(actual);
    const right = Buffer.from(expectedHash);
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
