import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const require = createRequire(import.meta.url);
const { processPendingWebhooks } = require('../lib/infrastructure/webhook-delivery.js');

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const adminApp = emulatorAvailable ? initializeApp({ projectId: 'packproof-api-test' }, `webhook-integration-${Date.now()}`) : null;
const firestore = adminApp ? getFirestore(adminApp) : null;
let server;
let baseUrl;
let received = null;

before(async () => {
  if (!emulatorAvailable) return;
  server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      received = { headers: req.headers, body };
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  if (adminApp) await deleteApp(adminApp);
});

test('webhook delivery worker posts pending deliveries and marks delivered', { skip: !emulatorAvailable }, async () => {
  const payload = JSON.stringify({ test: 'webhook-delivery' });
  const docRef = firestore.collection('webhookDeliveries').doc('delivery-1');
  await docRef.set({
    targetUrl: `${baseUrl}/webhook`,
    payload,
    headers: { 'X-Custom': 'integration' },
    attemptCount: 0,
    nextAttemptAt: new Date(Date.now() - 1000),
    state: 'PENDING',
  });

  await processPendingWebhooks(10);
  // allow short time for HTTP delivery to complete
  await new Promise((r) => setTimeout(r, 300));

  const snap = await docRef.get();
  assert.ok(snap.exists, 'delivery doc should exist');
  const data = snap.data();
  assert.equal(data.state, 'DELIVERED');
  assert.ok(received, 'server should have received request');
  assert.equal(received.body, payload);
  assert.equal(received.headers['content-type'], 'application/json');
});
