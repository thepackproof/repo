import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const require = createRequire(import.meta.url);
const { processPendingWebhooks } = require('../lib/infrastructure/webhook-delivery.js');

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const adminApp = emulatorAvailable ? initializeApp({ projectId: 'packproof-api-test' }, `webhook-attempts-${Date.now()}`) : null;
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

test('worker records attempts in subcollection', { skip: !emulatorAvailable }, async () => {
  const payload = JSON.stringify({ foo: 'bar' });
  const docRef = firestore.collection('webhookDeliveries').doc('attempt-delivery-1');
  await docRef.set({
    targetUrl: `${baseUrl}/webhook`,
    payload,
    attemptCount: 0,
    nextAttemptAt: new Date(Date.now() - 1000),
    state: 'PENDING',
  });

  await processPendingWebhooks(5);
  await new Promise((r) => setTimeout(r, 300));
  const attempts = await docRef.collection('attempts').get();
  assert.ok(attempts.size >= 1, 'should have recorded at least one attempt');
  const attempt = attempts.docs[0].data();
  assert.equal(attempt.status, 'SUCCESS');
});
