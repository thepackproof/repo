import { randomUUID } from 'node:crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { TransactionIntakeApplicationService, isConsumerIntakeSourceType } from './application/v1/transaction-intake-service';
import { db } from './config';
import { assertAccountActive, requireUid } from './helpers';
import { throwCallableError } from './infrastructure/firebase/v1/callable-errors';
import { FirestoreTransactionIntakeRepository } from './infrastructure/firebase/v1/transaction-intake-repository';

const callOptions = { enforceAppCheck: true } as const;
const intakeService = new TransactionIntakeApplicationService(new FirestoreTransactionIntakeRepository(db));
const SHA256 = /^[a-f0-9]{64}$/;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpsError('invalid-argument', 'Request data must be an object.');
  return value as Record<string, unknown>;
}

function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new HttpsError('invalid-argument', `${field} must be a string.`);
  if (value.length > max) throw new HttpsError('invalid-argument', `${field} is too long.`);
  return value;
}

function requiredText(value: unknown, field: string, min: number, max: number): string {
  const result = optionalText(value, field, max);
  if (!result || result.trim().length < min) throw new HttpsError('invalid-argument', `${field} is required.`);
  return result.trim();
}

function confirmedFields(value: unknown) {
  if (value === undefined || value === null) return null;
  const input = asRecord(value);
  const priceMinor = input.priceMinor;
  const quantity = input.quantity;
  if (priceMinor !== undefined && priceMinor !== null && (typeof priceMinor !== 'number' || !Number.isInteger(priceMinor) || priceMinor < 0 || priceMinor > 10_000_000_000)) {
    throw new HttpsError('invalid-argument', 'priceMinor must be a non-negative integer.');
  }
  if (quantity !== undefined && quantity !== null && (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 100_000)) {
    throw new HttpsError('invalid-argument', 'quantity must be a positive integer.');
  }
  return {
    title: optionalText(input.title, 'confirmed.title', 300)?.trim() || undefined,
    description: optionalText(input.description, 'confirmed.description', 10_000) ?? undefined,
    variant: optionalText(input.variant, 'confirmed.variant', 300)?.trim() || undefined,
    sku: optionalText(input.sku, 'confirmed.sku', 160)?.trim() || undefined,
    priceMinor: typeof priceMinor === 'number' ? priceMinor : undefined,
    currency: optionalText(input.currency, 'confirmed.currency', 3)?.trim().toUpperCase() || undefined,
    orderNumber: optionalText(input.orderNumber, 'confirmed.orderNumber', 200)?.trim() || undefined,
    quantity: typeof quantity === 'number' ? quantity : undefined,
  };
}

export const previewTransactionIntake = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  await assertAccountActive(uid);
  const input = asRecord(request.data);
  const intakeSourceType = requiredText(input.intakeSourceType, 'intakeSourceType', 3, 40);
  if (!isConsumerIntakeSourceType(intakeSourceType)) {
    throw new HttpsError('invalid-argument', 'Unsupported intake source.');
  }
  try {
    const parsed = intakeService.preview(optionalText(input.artifactText, 'artifactText', 100_000), intakeSourceType);
    return {
      parserVersion: parsed.parserVersion,
      platformIdentifier: parsed.platformIdentifier,
      title: parsed.item.title || null,
      variant: parsed.item.selectedOptions[0]?.value ?? null,
      quantity: parsed.item.quantity,
      amount: parsed.item.amount,
      orderNumber: parsed.externalOrderId,
      sku: parsed.item.sku,
      missingFields: parsed.missingFields,
    };
  } catch (error) {
    return throwCallableError(error);
  }
});

export const ingestTransactionIntake = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  await assertAccountActive(uid);
  const input = asRecord(request.data);
  const intakeSourceType = requiredText(input.intakeSourceType, 'intakeSourceType', 3, 40);
  if (!isConsumerIntakeSourceType(intakeSourceType)) {
    throw new HttpsError('invalid-argument', 'Unsupported intake source.');
  }
  const originalArtifactSha256 = requiredText(input.originalArtifactSha256, 'originalArtifactSha256', 64, 64).toLowerCase();
  if (!SHA256.test(originalArtifactSha256)) throw new HttpsError('invalid-argument', 'originalArtifactSha256 must be a SHA-256 hex digest.');
  try {
    return await intakeService.ingestArtifact({
      actorId: uid,
      operationKey: requiredText(input.operationKey, 'operationKey', 8, 200),
      requestId: request.rawRequest.get('x-request-id') ?? randomUUID(),
      intakeSourceType,
      originalArtifactSha256,
      artifactText: optionalText(input.artifactText, 'artifactText', 100_000),
      confirmed: confirmedFields(input.confirmed),
    });
  } catch (error) {
    return throwCallableError(error);
  }
});

export const listPendingTransactionIntake = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  await assertAccountActive(uid);
  try {
    return { items: await intakeService.listPending(uid) };
  } catch (error) {
    return throwCallableError(error);
  }
});

export const startPackProofFromIntake = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  const profile = await assertAccountActive(uid);
  const input = asRecord(request.data);
  try {
    return await intakeService.start({
      actorId: uid,
      plan: String(profile.plan ?? 'FREE'),
      commerceContextId: requiredText(input.commerceContextId, 'commerceContextId', 10, 160),
      requestId: request.rawRequest.get('x-request-id') ?? randomUUID(),
      confirmed: confirmedFields(input.confirmed),
    });
  } catch (error) {
    return throwCallableError(error);
  }
});
