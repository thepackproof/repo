import {
  ApiErrorDetail,
  CaptureArtifactType,
  CreateTransactionInput,
  InputValidationError,
  ListTransactionsInput,
  MerchantTransactionStatus,
  ParticipantReference,
  captureArtifactTypes,
  merchantTransactionStatuses,
} from './core';
import { commercePlatforms, parseItemDescriptor } from '../../domain/v1/commerce';
import type { PageCommerceContextInput } from '../../application/v1/public-commerce-handoff-service';
import type {
  AssociateMerchantDeliveryInput,
  AssociateMerchantReturnShipmentInput,
  AssociateMerchantShipmentInput,
  CreateMerchantConnectSessionInput,
  CreateMerchantReturnInput,
} from '../../application/v1/merchant-evidence-types';
import type {
  CreateEvidenceSessionInput,
  CreateParticipantInvitationInput,
  RedeemEvidenceSessionInput,
} from '../../application/v1/participant-capture-service';
import { evidenceArtifactTypes, evidenceSessionTypes, type EvidenceArtifactType } from '../../domain/v1/evidence';
import { participantRoles } from '../../domain/v1/transactions';

type UnknownRecord = Record<string, unknown>;

function object(value: unknown, field: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InputValidationError([{ field, code: 'INVALID_TYPE', message: `${field} must be an object.` }]);
  }
  return value as UnknownRecord;
}

function rejectUnknown(value: UnknownRecord, allowed: readonly string[], field = 'body'): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) {
    throw new InputValidationError(unknown.map((key) => ({
      field: field === 'body' ? key : `${field}.${key}`,
      code: 'UNKNOWN_FIELD',
      message: 'This field is not permitted by the v1 contract.',
    })));
  }
}

function string(value: unknown, field: string, min: number, max: number, required = true): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string') {
    throw new InputValidationError([{ field, code: 'INVALID_TYPE', message: `${field} must be a string.` }]);
  }
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new InputValidationError([{ field, code: 'INVALID_LENGTH', message: `${field} must contain ${min}-${max} characters.` }]);
  }
  return normalized;
}

function integer(value: unknown, field: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw new InputValidationError([{ field, code: 'INVALID_INTEGER', message: `${field} must be an integer from ${min} through ${max}.` }]);
  }
  return value as number;
}

function enumValue<T extends string>(value: unknown, field: string, values: readonly T[]): T {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new InputValidationError([{ field, code: 'INVALID_ENUM', message: `${field} contains an unsupported value.` }]);
  }
  return value as T;
}

function parseAmount(value: unknown): CreateTransactionInput['amount'] {
  if (value === undefined) return null;
  const input = object(value, 'amount');
  rejectUnknown(input, ['currency', 'minorUnits'], 'amount');
  const currency = string(input.currency, 'amount.currency', 3, 3)!.toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new InputValidationError([{ field: 'amount.currency', code: 'INVALID_CURRENCY', message: 'Currency must be a three-letter ISO 4217-style code.' }]);
  }
  return { currency, minorUnits: integer(input.minorUnits, 'amount.minorUnits', 0, 10_000_000_000) };
}

function parseParticipants(value: unknown): ParticipantReference[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 3) {
    throw new InputValidationError([{ field: 'participants', code: 'INVALID_ARRAY', message: 'participants must contain at most three entries.' }]);
  }
  const seen = new Set<string>();
  return value.map((entry, index) => {
    const input = object(entry, `participants[${index}]`);
    rejectUnknown(input, ['role', 'externalReference'], `participants[${index}]`);
    const role = enumValue(input.role, `participants[${index}].role`, ['SELLER', 'BUYER', 'RECEIVER'] as const);
    if (seen.has(role)) {
      throw new InputValidationError([{ field: `participants[${index}].role`, code: 'DUPLICATE_ROLE', message: 'Each participant role may appear only once.' }]);
    }
    seen.add(role);
    return { role, externalReference: string(input.externalReference, `participants[${index}].externalReference`, 1, 200)! };
  });
}

function parseCaptureRequirements(value: unknown): CreateTransactionInput['captureRequirements'] {
  if (value === undefined) return { requiredArtifactTypes: [] };
  const input = object(value, 'captureRequirements');
  rejectUnknown(input, ['requiredArtifactTypes'], 'captureRequirements');
  if (!Array.isArray(input.requiredArtifactTypes) || input.requiredArtifactTypes.length > captureArtifactTypes.length) {
    throw new InputValidationError([{ field: 'captureRequirements.requiredArtifactTypes', code: 'INVALID_ARRAY', message: 'requiredArtifactTypes must be an array of supported evidence types.' }]);
  }
  const values = input.requiredArtifactTypes.map((entry, index) => enumValue(
    entry,
    `captureRequirements.requiredArtifactTypes[${index}]`,
    captureArtifactTypes,
  )) as CaptureArtifactType[];
  if (new Set(values).size !== values.length) {
    throw new InputValidationError([{ field: 'captureRequirements.requiredArtifactTypes', code: 'DUPLICATE_VALUE', message: 'Artifact requirements may not contain duplicates.' }]);
  }
  return { requiredArtifactTypes: values };
}

export function parseCreateTransaction(value: unknown): CreateTransactionInput {
  const input = object(value, 'body');
  rejectUnknown(input, ['merchantReference', 'title', 'description', 'category', 'amount', 'participants', 'captureRequirements']);
  return {
    merchantReference: string(input.merchantReference, 'merchantReference', 1, 200)!,
    title: string(input.title, 'title', 1, 300)!,
    description: string(input.description, 'description', 0, 3_000, false) ?? '',
    category: string(input.category, 'category', 1, 120, false) ?? null,
    amount: parseAmount(input.amount),
    participants: parseParticipants(input.participants),
    captureRequirements: parseCaptureRequirements(input.captureRequirements),
  };
}

function oneQueryValue(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value) || typeof value !== 'string') {
    throw new InputValidationError([{ field, code: 'INVALID_QUERY', message: `${field} must be supplied exactly once.` }]);
  }
  return value;
}

function queryDate(value: unknown, field: string): Date | undefined {
  const raw = oneQueryValue(value, field);
  if (raw === undefined) return undefined;
  const date = new Date(raw);
  const rfc3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!rfc3339.test(raw) || !Number.isFinite(date.getTime())) {
    throw new InputValidationError([{ field, code: 'INVALID_TIMESTAMP', message: `${field} must be an RFC 3339 UTC timestamp.` }]);
  }
  return date;
}

export function parseListTransactions(query: UnknownRecord): ListTransactionsInput {
  rejectUnknown(query, ['status', 'merchantReference', 'createdAfter', 'createdBefore', 'cursor', 'limit'], 'query');
  const statusRaw = oneQueryValue(query.status, 'status');
  const merchantReferenceRaw = oneQueryValue(query.merchantReference, 'merchantReference');
  const cursorRaw = oneQueryValue(query.cursor, 'cursor');
  const limitRaw = oneQueryValue(query.limit, 'limit');
  let limit = 25;
  if (limitRaw !== undefined) {
    if (!/^\d+$/.test(limitRaw)) {
      throw new InputValidationError([{ field: 'limit', code: 'INVALID_INTEGER', message: 'limit must be an integer from 1 through 100.' }]);
    }
    limit = integer(Number(limitRaw), 'limit', 1, 100);
  }
  const createdAfter = queryDate(query.createdAfter, 'createdAfter');
  const createdBefore = queryDate(query.createdBefore, 'createdBefore');
  if (createdAfter && createdBefore && createdAfter >= createdBefore) {
    throw new InputValidationError([{ field: 'createdAfter', code: 'INVALID_RANGE', message: 'createdAfter must be earlier than createdBefore.' }]);
  }
  return {
    ...(statusRaw ? { status: enumValue(statusRaw, 'status', merchantTransactionStatuses) as MerchantTransactionStatus } : {}),
    ...(merchantReferenceRaw ? { merchantReference: string(merchantReferenceRaw, 'merchantReference', 1, 200)! } : {}),
    ...(createdAfter ? { createdAfter } : {}),
    ...(createdBefore ? { createdBefore } : {}),
    ...(cursorRaw ? { cursor: string(cursorRaw, 'cursor', 8, 2_000)! } : {}),
    limit,
  };
}

export function parseTransactionId(value: unknown): string {
  if (typeof value !== 'string' || !/^txn_[a-f0-9]{32}$/.test(value)) {
    const details: ApiErrorDetail[] = [{ field: 'transactionId', code: 'INVALID_ID', message: 'transactionId is not a valid PackProof transaction identifier.' }];
    throw new InputValidationError(details);
  }
  return value;
}

export function parseIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 200 || !/^[\x21-\x7e]+$/.test(value)) {
    throw new InputValidationError([{ field: 'Idempotency-Key', code: 'INVALID_IDEMPOTENCY_KEY', message: 'Idempotency-Key must contain 8-200 visible ASCII characters.' }]);
  }
  return value;
}

function nullableString(value: unknown, field: string, min: number, max: number): string | null {
  if (value === null || value === undefined) return null;
  return string(value, field, min, max)!;
}

export function parsePublishableKey(value: unknown): string {
  if (typeof value !== 'string' || !/^pp_pub_(?:sandbox|live)_[A-Za-z0-9_-]{20,80}$/.test(value)) {
    throw new InputValidationError([{ field: 'publishableKey', code: 'INVALID_PUBLISHABLE_KEY', message: 'publishableKey is not a valid PackProof Button installation key.' }]);
  }
  return value;
}

export function parseBrowserOrigin(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 500) {
    throw new InputValidationError([{ field: 'Origin', code: 'ORIGIN_REQUIRED', message: 'A browser Origin header is required.' }]);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new InputValidationError([{ field: 'Origin', code: 'INVALID_ORIGIN', message: 'Origin must be an exact HTTPS origin.' }]);
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.origin !== value) {
    throw new InputValidationError([{ field: 'Origin', code: 'INVALID_ORIGIN', message: 'Origin must be an exact HTTPS origin.' }]);
  }
  return parsed.origin;
}

export function parseCreatePublicCommerceHandoff(value: unknown): PageCommerceContextInput {
  const input = object(value, 'body');
  rejectUnknown(input, ['schemaVersion', 'source', 'item']);
  if (input.schemaVersion !== 1) {
    throw new InputValidationError([{ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA_VERSION', message: 'schemaVersion must equal 1.' }]);
  }
  const source = object(input.source, 'source');
  rejectUnknown(source, ['platform', 'productUrl', 'externalProductId', 'externalListingId', 'externalVariantId'], 'source');
  const productUrl = string(source.productUrl, 'source.productUrl', 1, 2_000)!;
  let parsedProductUrl: URL;
  try {
    parsedProductUrl = new URL(productUrl);
  } catch {
    throw new InputValidationError([{ field: 'source.productUrl', code: 'INVALID_URL', message: 'source.productUrl must be a valid URL.' }]);
  }
  if (parsedProductUrl.protocol !== 'https:' || parsedProductUrl.username || parsedProductUrl.password) {
    throw new InputValidationError([{ field: 'source.productUrl', code: 'INVALID_URL', message: 'source.productUrl must use HTTPS without embedded credentials.' }]);
  }
  try {
    return {
      schemaVersion: 1,
      source: {
        platform: enumValue(source.platform ?? 'STRUCTURED_PAGE_DATA', 'source.platform', commercePlatforms),
        productUrl,
        externalProductId: nullableString(source.externalProductId, 'source.externalProductId', 1, 200),
        externalListingId: nullableString(source.externalListingId, 'source.externalListingId', 1, 200),
        externalVariantId: nullableString(source.externalVariantId, 'source.externalVariantId', 1, 200),
      },
      item: parseItemDescriptor(input.item, 'item'),
    };
  } catch (error) {
    if (error instanceof InputValidationError) throw error;
    const issue = error && typeof error === 'object' && 'issues' in error
      ? (error as { issues?: Array<{ path?: string; code?: string; message?: string }> }).issues?.[0]
      : null;
    throw new InputValidationError([{
      field: issue?.path ?? 'item',
      code: issue?.code ?? 'INVALID_ITEM',
      message: issue?.message ?? 'item does not satisfy the v1 commerce descriptor contract.',
    }]);
  }
}

export function parsePublicHandoffId(value: unknown): string {
  if (typeof value !== 'string' || !/^hnd_[a-f0-9]{40}$/.test(value)) {
    throw new InputValidationError([{ field: 'handoffId', code: 'INVALID_ID', message: 'handoffId is not a valid public commerce handoff identifier.' }]);
  }
  return value;
}

export function parseParticipantClaimId(value: unknown): string {
  if (typeof value !== 'string' || !/^claim_[a-f0-9]{40}$/.test(value)) {
    throw new InputValidationError([{ field: 'claimId', code: 'INVALID_ID', message: 'claimId is not a valid PackProof participant-claim identifier.' }]);
  }
  return value;
}

export function parseEvidenceSessionId(value: unknown): string {
  if (typeof value !== 'string' || !/^es_[a-f0-9]{40}$/.test(value)) {
    throw new InputValidationError([{ field: 'evidenceSessionId', code: 'INVALID_ID', message: 'evidenceSessionId is not a valid PackProof evidence-session identifier.' }]);
  }
  return value;
}

function optionalInteger(value: unknown, field: string, min: number, max: number, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  return integer(value, field, min, max);
}

function optionalNullableString(value: unknown, field: string, min: number, max: number, pattern?: RegExp): string | null {
  if (value === undefined || value === null) return null;
  const result = string(value, field, min, max)!;
  if (pattern && !pattern.test(result)) {
    throw new InputValidationError([{ field, code: 'INVALID_FORMAT', message: `${field} has an invalid format.` }]);
  }
  return result;
}

export function parseCreateParticipantInvitation(value: unknown): CreateParticipantInvitationInput {
  const input = object(value, 'body');
  rejectUnknown(input, ['schemaVersion', 'role', 'externalReference', 'expiresInSeconds']);
  if (input.schemaVersion !== 1) {
    throw new InputValidationError([{ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA_VERSION', message: 'schemaVersion must equal 1.' }]);
  }
  return {
    role: enumValue(input.role, 'role', participantRoles),
    externalReference: string(input.externalReference, 'externalReference', 1, 300)!,
    expiresInSeconds: optionalInteger(input.expiresInSeconds, 'expiresInSeconds', 300, 7 * 86400, 86400),
  };
}

export function parseClaimParticipant(value: unknown): { claimId: string; token: string } {
  const input = object(value, 'body');
  rejectUnknown(input, ['schemaVersion', 'claimId', 'token']);
  if (input.schemaVersion !== 1) {
    throw new InputValidationError([{ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA_VERSION', message: 'schemaVersion must equal 1.' }]);
  }
  const token = string(input.token, 'token', 40, 200)!;
  if (!/^pp_claim_v1_[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new InputValidationError([{ field: 'token', code: 'INVALID_TOKEN', message: 'token is not a valid participant-claim token.' }]);
  }
  return { claimId: parseParticipantClaimId(input.claimId), token };
}

export function parseCreateEvidenceSession(value: unknown): CreateEvidenceSessionInput {
  const input = object(value, 'body');
  rejectUnknown(input, [
    'schemaVersion', 'participantClaimId', 'type', 'allowedArtifactTypes', 'expiresInSeconds', 'maximumRedemptions',
    'requestedEvidenceCount', 'captureProfileId', 'captureGroupId',
  ]);
  if (input.schemaVersion !== 1) {
    throw new InputValidationError([{ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA_VERSION', message: 'schemaVersion must equal 1.' }]);
  }
  if (!Array.isArray(input.allowedArtifactTypes) || input.allowedArtifactTypes.length < 1 || input.allowedArtifactTypes.length > evidenceArtifactTypes.length) {
    throw new InputValidationError([{ field: 'allowedArtifactTypes', code: 'INVALID_ARRAY', message: 'allowedArtifactTypes must contain one or more supported evidence artifact types.' }]);
  }
  const allowedArtifactTypes = input.allowedArtifactTypes.map((entry, index) => (
    enumValue(entry, `allowedArtifactTypes[${index}]`, evidenceArtifactTypes)
  )) as EvidenceArtifactType[];
  if (new Set(allowedArtifactTypes).size !== allowedArtifactTypes.length) {
    throw new InputValidationError([{ field: 'allowedArtifactTypes', code: 'DUPLICATE_VALUE', message: 'allowedArtifactTypes cannot contain duplicates.' }]);
  }
  return {
    participantClaimId: parseParticipantClaimId(input.participantClaimId),
    type: enumValue(input.type, 'type', evidenceSessionTypes),
    allowedArtifactTypes,
    expiresInSeconds: optionalInteger(input.expiresInSeconds, 'expiresInSeconds', 300, 7 * 86400, 86400),
    maximumRedemptions: optionalInteger(input.maximumRedemptions, 'maximumRedemptions', 1, 3, 1),
    requestedEvidenceCount: optionalInteger(input.requestedEvidenceCount, 'requestedEvidenceCount', 1, 24, 1),
    captureProfileId: optionalNullableString(input.captureProfileId, 'captureProfileId', 1, 120, /^[A-Za-z0-9._-]+$/),
    captureGroupId: optionalNullableString(input.captureGroupId, 'captureGroupId', 1, 160, /^[A-Za-z0-9_-]+$/),
  };
}

export function parseRedeemEvidenceSession(value: unknown): RedeemEvidenceSessionInput {
  const input = object(value, 'body');
  rejectUnknown(input, ['schemaVersion', 'operationKey', 'token', 'runtimeArtifactHash']);
  if (input.schemaVersion !== 1) {
    throw new InputValidationError([{ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA_VERSION', message: 'schemaVersion must equal 1.' }]);
  }
  const token = string(input.token, 'token', 40, 200)!;
  if (!/^pp_capture_v1_[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new InputValidationError([{ field: 'token', code: 'INVALID_TOKEN', message: 'token is not a valid evidence-session redemption token.' }]);
  }
  return {
    operationKey: string(input.operationKey, 'operationKey', 8, 200)!,
    token,
    runtimeArtifactHash: optionalNullableString(input.runtimeArtifactHash, 'runtimeArtifactHash', 64, 64, /^[a-f0-9]{64}$/i),
  };
}

export function parseAccessibleTransactionId(value: unknown): string {
  if (typeof value === 'string' && /^txn_[a-f0-9]{32}$/.test(value)) return value;
  if (typeof value === 'string' && /^[A-Za-z0-9_-]{10,128}$/.test(value)) return value;
  throw new InputValidationError([{ field: 'transactionId', code: 'INVALID_ID', message: 'transactionId is not a valid PackProof transaction identifier.' }]);
}

export function parseEvidenceArtifactId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(value)) {
    throw new InputValidationError([{ field: 'artifactId', code: 'INVALID_ID', message: 'artifactId is not a valid evidence artifact identifier.' }]);
  }
  return value;
}

export function parseEvidenceReportId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(value)) {
    throw new InputValidationError([{ field: 'reportId', code: 'INVALID_ID', message: 'reportId is not a valid evidence report identifier.' }]);
  }
  return value;
}

export function parseReturnPassportId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(value)) {
    throw new InputValidationError([{ field: 'returnPassportId', code: 'INVALID_ID', message: 'returnPassportId is not a valid return-passport identifier.' }]);
  }
  return value;
}

export function parseConnectSessionId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new InputValidationError([{ field: 'sessionId', code: 'INVALID_ID', message: 'sessionId is not a valid PackProof API session identifier.' }]);
  }
  return value;
}

export function parseListConnectSessions(query: UnknownRecord): { externalOrderId: string } {
  rejectUnknown(query, ['externalOrderId'], 'query');
  const externalOrderId = oneQueryValue(query.externalOrderId, 'externalOrderId');
  if (!externalOrderId) {
    throw new InputValidationError([{ field: 'externalOrderId', code: 'REQUIRED', message: 'externalOrderId is required to list Connect sessions.' }]);
  }
  return { externalOrderId: string(externalOrderId, 'externalOrderId', 1, 200)! };
}

export function parseCancelConnectSession(value: unknown): { schemaVersion: 1 } {
  const input = object(value, 'body');
  rejectUnknown(input, ['schemaVersion']);
  if (input.schemaVersion !== 1) {
    throw new InputValidationError([{ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA_VERSION', message: 'schemaVersion must equal 1.' }]);
  }
  return { schemaVersion: 1 };
}

function parseHttpsCallbackUrl(value: unknown, field: string): string {
  const raw = string(value, field, 12, 2_000)!;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new InputValidationError([{ field, code: 'INVALID_URL', message: `${field} must be a valid URL.` }]);
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new InputValidationError([{ field, code: 'INVALID_URL', message: `${field} must use HTTPS without embedded credentials.` }]);
  }
  return raw;
}

export function parsePassportId(value: unknown): string {
  if (typeof value === 'string' && /^ppt_[a-f0-9]{40}$/.test(value)) return value;
  if (typeof value === 'string' && /^PP-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/i.test(value)) {
    return value.toUpperCase();
  }
  throw new InputValidationError([{ field: 'passportId', code: 'INVALID_ID', message: 'passportId is not a valid PackProof Passport identifier.' }]);
}

export function parsePassportSnapshotId(value: unknown): string {
  if (typeof value !== 'string' || !/^pps_[a-f0-9]{40}$/.test(value)) {
    throw new InputValidationError([{ field: 'snapshotId', code: 'INVALID_ID', message: 'snapshotId is not a valid PackProof Passport snapshot identifier.' }]);
  }
  return value;
}

export function parsePassportReviewQuery(query: UnknownRecord): { framework: string; category: string } | null {
  rejectUnknown(query, ['framework', 'category'], 'query');
  const framework = oneQueryValue(query.framework, 'framework');
  const category = oneQueryValue(query.category, 'category');
  if (!framework && !category) return null;
  if (!framework || !category) {
    throw new InputValidationError([{ field: framework ? 'category' : 'framework', code: 'REQUIRED', message: 'framework and category must be supplied together.' }]);
  }
  return {
    framework: string(framework, 'framework', 1, 80)!,
    category: string(category, 'category', 1, 120)!,
  };
}

export function parseCreatePassportSnapshot(value: unknown): { schemaVersion: 1 } {
  const input = object(value, 'body');
  rejectUnknown(input, ['schemaVersion']);
  if (input.schemaVersion !== 1) {
    throw new InputValidationError([{ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA_VERSION', message: 'schemaVersion must equal 1.' }]);
  }
  return { schemaVersion: 1 };
}

export function parseCreatePassportExport(value: unknown): { schemaVersion: 1 } {
  return parseCreatePassportSnapshot(value);
}

export function parseCreateConnectSession(value: unknown): CreateMerchantConnectSessionInput {
  const input = object(value, 'body');
  rejectUnknown(input, [
    'schemaVersion', 'platform', 'externalOrderId', 'externalSellerId', 'itemTitle', 'itemDescription',
    'amount', 'trackingNumber', 'carrier', 'declaredWeightGrams', 'callbackUrl',
  ]);
  if (input.schemaVersion !== 1) {
    throw new InputValidationError([{ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA_VERSION', message: 'schemaVersion must equal 1.' }]);
  }
  return {
    platform: string(input.platform, 'platform', 2, 80)!,
    externalOrderId: string(input.externalOrderId, 'externalOrderId', 1, 200)!,
    externalSellerId: string(input.externalSellerId, 'externalSellerId', 1, 200)!,
    itemTitle: string(input.itemTitle, 'itemTitle', 1, 300)!,
    itemDescription: string(input.itemDescription, 'itemDescription', 0, 3_000, false) ?? '',
    amount: (() => {
      if (input.amount === undefined) {
        throw new InputValidationError([{ field: 'amount', code: 'REQUIRED', message: 'amount is required.' }]);
      }
      const amount = parseAmount(input.amount);
      if (!amount) throw new InputValidationError([{ field: 'amount', code: 'REQUIRED', message: 'amount is required.' }]);
      return amount;
    })(),
    trackingNumber: string(input.trackingNumber, 'trackingNumber', 3, 160, false),
    carrier: string(input.carrier, 'carrier', 1, 80, false),
    declaredWeightGrams: input.declaredWeightGrams === undefined ? undefined : integer(input.declaredWeightGrams, 'declaredWeightGrams', 0, 2_000_000),
    callbackUrl: parseHttpsCallbackUrl(input.callbackUrl, 'callbackUrl'),
  };
}

export function parseAssociateShipment(value: unknown): AssociateMerchantShipmentInput {
  const input = object(value, 'body');
  rejectUnknown(input, ['schemaVersion', 'carrier', 'trackingNumber']);
  if (input.schemaVersion !== 1) {
    throw new InputValidationError([{ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA_VERSION', message: 'schemaVersion must equal 1.' }]);
  }
  return {
    carrier: string(input.carrier, 'carrier', 1, 80)!,
    trackingNumber: string(input.trackingNumber, 'trackingNumber', 3, 160)!,
  };
}

export function parseCreateReturn(value: unknown): CreateMerchantReturnInput {
  const input = object(value, 'body');
  rejectUnknown(input, ['schemaVersion', 'reason']);
  if (input.schemaVersion !== 1) {
    throw new InputValidationError([{ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA_VERSION', message: 'schemaVersion must equal 1.' }]);
  }
  return { reason: string(input.reason, 'reason', 5, 5000)! };
}

export function parseAssociateReturnShipment(value: unknown): AssociateMerchantReturnShipmentInput {
  return parseAssociateShipment(value);
}

export function parseAssociateDelivery(value: unknown): AssociateMerchantDeliveryInput {
  const input = object(value, 'body');
  rejectUnknown(input, ['schemaVersion', 'carrier', 'trackingNumber']);
  if (input.schemaVersion !== 1) {
    throw new InputValidationError([{ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA_VERSION', message: 'schemaVersion must equal 1.' }]);
  }
  return {
    carrier: string(input.carrier, 'carrier', 1, 80, false),
    trackingNumber: string(input.trackingNumber, 'trackingNumber', 3, 160, false),
  };
}

export function parseCreateEvidenceReport(value: unknown): { schemaVersion: 1 } {
  const input = object(value, 'body');
  rejectUnknown(input, ['schemaVersion']);
  if (input.schemaVersion !== 1) {
    throw new InputValidationError([{ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA_VERSION', message: 'schemaVersion must equal 1.' }]);
  }
  return { schemaVersion: 1 };
}

export function asApiError(error: unknown): ApiErrorDetail[] {
  return error instanceof InputValidationError ? [...error.details] : [];
}
