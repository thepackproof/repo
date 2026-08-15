import { randomBytes } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { apiScopes } = require('../lib/api/v1/core.js');
const { createApiSecretVerifier } = require('../lib/api/v1/security.js');

function fail(message) {
  console.error(message);
  process.exitCode = 1;
  return null;
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || !value || value.startsWith('--')) return fail(`Missing value for ${flag ?? 'argument'}.`);
    const name = flag.slice(2);
    if (values[name] !== undefined) return fail(`Duplicate argument: ${flag}.`);
    values[name] = value;
  }
  const allowed = new Set(['organization-id', 'organization-name', 'client-id', 'client-name', 'environment', 'scopes', 'integration-id']);
  const unknown = Object.keys(values).filter((key) => !allowed.has(key));
  if (unknown.length) return fail(`Unknown argument(s): ${unknown.map((key) => `--${key}`).join(', ')}.`);
  return values;
}

function identifier(value, field, prefix) {
  if (typeof value !== 'string' || !new RegExp(`^${prefix}_[A-Za-z0-9_-]{3,80}$`).test(value)) {
    return fail(`${field} must match ${prefix}_[A-Za-z0-9_-]{3,80}.`);
  }
  return value;
}

const args = parseArgs(process.argv.slice(2));
if (!args) process.exit();
const organizationId = identifier(args['organization-id'], '--organization-id', 'org');
const clientId = identifier(args['client-id'], '--client-id', 'client');
const organizationName = args['organization-name'];
const clientName = args['client-name'];
const environment = args.environment;
if (!organizationId || !clientId) process.exit();
if (typeof organizationName !== 'string' || organizationName.trim().length < 1 || organizationName.length > 200) fail('--organization-name must contain 1-200 characters.');
if (typeof clientName !== 'string' || clientName.trim().length < 1 || clientName.length > 200) fail('--client-name must contain 1-200 characters.');
if (environment !== 'sandbox' && environment !== 'live') fail('--environment must be sandbox or live.');
const scopes = [...new Set((args.scopes ?? '').split(',').map((value) => value.trim()).filter(Boolean))];
if (!scopes.length || scopes.some((scope) => !apiScopes.includes(scope))) fail(`--scopes must contain supported comma-separated scopes: ${apiScopes.join(', ')}.`);
const pepper = process.env.PACKPROOF_API_CREDENTIAL_PEPPER;
if (!pepper || pepper.length < 32) fail('Set PACKPROOF_API_CREDENTIAL_PEPPER to the same 32+ character value stored as the API_CREDENTIAL_PEPPER Firebase secret.');
if (process.exitCode) process.exit();

initializeApp();
const db = getFirestore();
const credentialId = `cred_${randomBytes(18).toString('base64url')}`;
const secret = randomBytes(32).toString('base64url');
const apiKey = `pp_${environment}_${credentialId}.${secret}`;
const credentialRef = db.collection('apiCredentials').doc(credentialId);
const organizationRef = db.collection('organizations').doc(organizationId);
const clientRef = db.collection('apiClients').doc(clientId);

await db.runTransaction(async (tx) => {
  const [organizationSnap, clientSnap, credentialSnap] = await Promise.all([
    tx.get(organizationRef),
    tx.get(clientRef),
    tx.get(credentialRef),
  ]);
  if (credentialSnap.exists) throw new Error('Generated credential collision. Run the command again.');
  if (organizationSnap.exists && organizationSnap.data()?.status !== 'ACTIVE') throw new Error('The organization exists but is not active.');
  if (clientSnap.exists) {
    const client = clientSnap.data();
    if (client?.organizationId !== organizationId || client?.environment !== environment) {
      throw new Error('The API client already exists under a different organization or environment.');
    }
    if (client.status !== 'ACTIVE') throw new Error('The API client exists but is not active.');
    const existingScopes = new Set(Array.isArray(client.scopes) ? client.scopes : []);
    if (scopes.some((scope) => !existingScopes.has(scope))) {
      throw new Error('The requested credential scopes exceed the existing API client scopes.');
    }
  }
  if (!organizationSnap.exists) {
    tx.create(organizationRef, {
      id: organizationId,
      name: organizationName.trim(),
      status: 'ACTIVE',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  if (!clientSnap.exists) {
    tx.create(clientRef, {
      id: clientId,
      name: clientName.trim(),
      organizationId,
      environment,
      scopes,
      status: 'ACTIVE',
      integrationId: typeof args['integration-id'] === 'string' && args['integration-id'] ? args['integration-id'] : null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  tx.create(credentialRef, {
    id: credentialId,
    apiClientId: clientId,
    organizationId,
    environment,
    scopes,
    status: 'ACTIVE',
    secretVerifier: createApiSecretVerifier(secret, pepper),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
});

console.log(JSON.stringify({
  organizationId,
  apiClientId: clientId,
  credentialId,
  environment,
  scopes,
  apiKey,
  warning: 'This API key is shown once. Store it in the merchant secret manager; PackProof stores only a verifier.',
}, null, 2));
