import { createHash, randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const valuesAfter = (name) => args.flatMap((arg, index) => arg === name ? [args[index + 1]] : []).filter(Boolean);
const valueAfter = (name) => valuesAfter(name)[0];
const fail = (message) => { process.stderr.write(`${message}\n\nRun with --help for usage.\n`); process.exit(1); };

if (args.includes('--help')) {
  process.stdout.write(`PackProof Connect integration provisioner

Usage:
  npm --prefix functions run provision:connect -- \\
    --project FIREBASE_PROJECT_ID \\
    --name "Vendor sandbox" \\
    --platform vendor-slug \\
    --environment SANDBOX \\
    --callback https://vendor.example/packproof/webhook \
    --button-origin https://shop.vendor.example

Repeat --callback to allow more than one public HTTPS origin. Authentication uses
Repeat --button-origin to allow the public PackProof Button on additional exact
storefront origins. If omitted, callback origins are used for backward compatibility.
Application Default Credentials (gcloud auth application-default login) or the
GOOGLE_APPLICATION_CREDENTIALS environment variable. Credentials are printed once.
`);
  process.exit(0);
}

const projectId = valueAfter('--project') || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
const name = valueAfter('--name');
const platform = valueAfter('--platform');
const environment = (valueAfter('--environment') || 'SANDBOX').toUpperCase();
const callbackValues = valuesAfter('--callback');
const buttonOriginValues = valuesAfter('--button-origin');

if (!projectId) fail('Missing --project FIREBASE_PROJECT_ID.');
if (!name || name.length < 2 || name.length > 120) fail('--name must contain 2-120 characters.');
if (!platform || !/^[a-z0-9][a-z0-9._-]{1,79}$/i.test(platform)) fail('--platform must contain 2-80 slug-like characters.');
if (!['SANDBOX', 'PRODUCTION'].includes(environment)) fail('--environment must be SANDBOX or PRODUCTION.');
if (!callbackValues.length || callbackValues.length > 10) fail('Provide 1-10 --callback URLs.');
if (buttonOriginValues.length > 100) fail('Provide no more than 100 --button-origin URLs.');

function isPrivateAddress(address) {
  const value = address.toLowerCase().replace(/^::ffff:/, '');
  if (isIP(value) === 4) {
    const parts = value.split('.').map(Number);
    return parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || parts[0] >= 224
      || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
      || (parts[0] === 169 && parts[1] === 254)
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && (parts[1] === 0 || parts[1] === 168))
      || (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19))
      || (parts[0] === 198 && parts[1] === 51 && parts[2] === 100)
      || (parts[0] === 203 && parts[1] === 0 && parts[2] === 113);
  }
  if (isIP(value) === 6) return value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') || /^fe[89ab]/.test(value) || value.startsWith('ff') || value.startsWith('2001:db8:');
  return true;
}

async function callbackOrigin(raw) {
  let parsed;
  try { parsed = new URL(raw); } catch { fail(`Invalid callback URL: ${raw}`); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hostname === 'localhost' || parsed.hostname.endsWith('.local')) {
    fail(`Callback must use public HTTPS without embedded credentials: ${raw}`);
  }
  const addresses = await lookup(parsed.hostname, { all: true, verbatim: true }).catch(() => []);
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) fail(`Callback hostname must resolve only to public addresses: ${raw}`);
  return parsed.origin;
}

const callbackOrigins = Array.from(new Set(await Promise.all(callbackValues.map(callbackOrigin))));
const allowedOrigins = Array.from(new Set(await Promise.all((buttonOriginValues.length ? buttonOriginValues : callbackValues).map(callbackOrigin))));
const token = (prefix) => `${prefix}_${randomBytes(32).toString('base64url')}`;
const apiKey = token(environment === 'PRODUCTION' ? 'pp_live' : 'pp_test');
const webhookSigningSecret = token('whsec');
const publishableKey = `pp_pub_${environment === 'PRODUCTION' ? 'live' : 'sandbox'}_${randomBytes(24).toString('base64url')}`;
const hash = (input) => createHash('sha256').update(input).digest('hex');

initializeApp({ credential: applicationDefault(), projectId });
const firestore = getFirestore();
const ref = firestore.collection('platformIntegrations').doc();
await ref.set({
  id: ref.id,
  name,
  platform,
  environment,
  apiKeyHash: hash(apiKey),
  webhookSigningSecret,
  callbackOrigins,
  allowedOrigins,
  publishableKeyHash: hash(publishableKey),
  status: 'ACTIVE',
  createdBy: `CLI:${process.env.USERNAME || process.env.USER || 'operator'}`,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});

process.stdout.write(`${JSON.stringify({ projectId, integrationId: ref.id, environment, platform, callbackOrigins, allowedOrigins, publishableKey, apiKey, webhookSigningSecret }, null, 2)}\n`);
process.stderr.write('\nStore the API key and webhook signing secret in the vendor secret manager now. PackProof stores the API key only as a hash; this output is the only copy.\n');
