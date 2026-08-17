/**
 * PackProof API partner reference — Node 18+.
 *
 * This is a copyable starting point, not a production service. Replace the
 * environment values, persist session IDs against your order records, download
 * the dossier within 15 minutes, and treat the callback as digital-evidence
 * metadata rather than a fraud, authenticity, or legal verdict.
 *
 *   PACKPROOF_API_KEY=pp_sandbox_... \
 *   PACKPROOF_BASE_URL=https://YOUR_PACKPROOF_DOMAIN.example \
 *   PACKPROOF_WEBHOOK_SECRET=whsec_... \
 *   node sdk/javascript/examples/partner-server.mjs
 */
import { createServer } from 'node:http';
import { PackProofConnect, PackProofConnectError, parsePackProofWebhook } from '../index.js';

const apiKey = process.env.PACKPROOF_API_KEY;
const baseUrl = process.env.PACKPROOF_BASE_URL;
const webhookSecret = process.env.PACKPROOF_WEBHOOK_SECRET;
if (!apiKey || !baseUrl || !webhookSecret) {
  throw new Error('Set PACKPROOF_API_KEY, PACKPROOF_BASE_URL, and PACKPROOF_WEBHOOK_SECRET.');
}

const client = new PackProofConnect({ apiKey, baseUrl });
const seenDeliveries = new Set();

async function createSessionForOrder(order) {
  const session = await client.createConnectSession({
    platform: order.platform,
    externalOrderId: order.id,
    externalSellerId: order.sellerId,
    itemTitle: order.title,
    itemDescription: order.description,
    amount: order.amount,
    trackingNumber: order.trackingNumber,
    carrier: order.carrier,
    callbackUrl: order.callbackUrl,
    idempotencyKey: `fulfillment-${order.id}-v1`,
  });
  return {
    sessionId: session.data.id,
    captureUrl: session.captureInstructions.captureUrl,
    expiresAt: session.data.expiresAt,
  };
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/orders/packproof-session') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const order = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const created = await createSessionForOrder(order);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(created));
      return;
    }

    if (req.method === 'POST' && req.url === '/webhooks/packproof') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const deliveryId = req.headers['x-packproof-delivery'];
      const payload = parsePackProofWebhook({
        rawBody,
        timestamp: req.headers['x-packproof-timestamp'],
        signature: req.headers['x-packproof-signature'],
        secret: webhookSecret,
      });
      if (deliveryId && seenDeliveries.has(deliveryId)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ duplicate: true }));
        return;
      }
      if (deliveryId) seenDeliveries.add(deliveryId);
      const sessions = await client.listConnectSessions(payload.orderId);
      const transactionId = sessions.data.find((session) => session.transactionId)?.transactionId;
      const review = transactionId ? await client.getReviewPackage(transactionId) : null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        accepted: true,
        evidenceStatus: payload.evidenceStatus,
        statusReasonCodes: payload.statusReasonCodes,
        reviewPackageId: review?.data?.id ?? null,
      }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  } catch (error) {
    const status = error instanceof PackProofConnectError && error.status >= 400 ? error.status : 500;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: error instanceof PackProofConnectError ? error.code : 'internal_error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }));
  }
});

server.listen(8787, '127.0.0.1', () => {
  process.stdout.write('PackProof API partner reference listening on http://127.0.0.1:8787\n');
});
