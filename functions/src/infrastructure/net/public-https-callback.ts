import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { ApplicationError } from '../../application/v1/errors';
import type { PublicCallbackUrlValidator } from '../../application/v1/merchant-evidence-ports';

function isPrivateAddress(address: string): boolean {
  const value = address.toLowerCase().replace(/^::ffff:/, '');
  if (isIP(value) === 4) {
    const parts = value.split('.').map(Number);
    return parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || parts[0] >= 224
      || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
      || (parts[0] === 169 && parts[1] === 254)
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 0)
      || (parts[0] === 192 && parts[1] === 168)
      || (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19))
      || (parts[0] === 198 && parts[1] === 51 && parts[2] === 100)
      || (parts[0] === 203 && parts[1] === 0 && parts[2] === 113);
  }
  if (isIP(value) === 6) {
    return value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd')
      || /^fe[89ab]/.test(value) || value.startsWith('ff') || value.startsWith('2001:db8:');
  }
  return true;
}

export class DnsPublicHttpsCallbackValidator implements PublicCallbackUrlValidator {
  async validate(callbackUrl: string, allowedOrigins: readonly string[]): Promise<void> {
    let parsed: URL;
    try {
      parsed = new URL(callbackUrl);
    } catch {
      throw new ApplicationError('INVALID_ARGUMENT', 'INVALID_CALLBACK_URL', 'Callback URL must be a valid public HTTPS URL.');
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      throw new ApplicationError('INVALID_ARGUMENT', 'INVALID_CALLBACK_URL', 'Callback URL must use public HTTPS without embedded credentials.');
    }
    if (allowedOrigins.length && !allowedOrigins.includes(parsed.origin)) {
      throw new ApplicationError('FORBIDDEN', 'CALLBACK_ORIGIN_NOT_ALLOWED', 'Callback origin is not allowlisted for this integration.');
    }
    if (parsed.hostname === 'localhost' || parsed.hostname.endsWith('.local')) {
      throw new ApplicationError('INVALID_ARGUMENT', 'INVALID_CALLBACK_URL', 'Callback hostname is not public.');
    }
    const addresses = await lookup(parsed.hostname, { all: true, verbatim: true }).catch(() => []);
    if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
      throw new ApplicationError('INVALID_ARGUMENT', 'INVALID_CALLBACK_URL', 'Callback hostname must resolve only to public network addresses.');
    }
  }
}
