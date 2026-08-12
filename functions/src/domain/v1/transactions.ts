import type { Money, PublicResource, ResourceId, VersionedResource } from './common';
import { parseMoney, parseResourceId } from './common';
import { arrayValue, enumValue, integerValue, isoDateTime, literalValue, optionalIsoDateTime, optionalString, schema, strictObject, stringValue } from './runtime';

export const participantRoles = ['SELLER', 'BUYER', 'RECEIVER', 'RETURN_SENDER', 'RETURN_RECIPIENT', 'WITNESS'] as const;
export type ParticipantRole = (typeof participantRoles)[number];

export const participantClaimStates = ['UNCLAIMED', 'INVITED', 'CLAIMED', 'EXPIRED', 'REVOKED'] as const;
export type ParticipantClaimState = (typeof participantClaimStates)[number];

export type ParticipantReference = {
  role: ParticipantRole;
  externalReference: string;
  displayLabel: string | null;
};

export type ParticipantBinding = ParticipantReference & {
  actorId: string | null;
  claimState: ParticipantClaimState;
  claimedAt: Date | null;
};

export type ParticipantReferenceDto = ParticipantReference & {
  claimState: ParticipantClaimState;
};

export const transactionOrigins = ['CONSUMER', 'MERCHANT_API', 'PACKPROOF_CONNECT', 'COMMERCE_ADAPTER'] as const;
export type TransactionOrigin = (typeof transactionOrigins)[number];

export const termsStates = ['DRAFT', 'AWAITING_PARTICIPANTS', 'IN_REVIEW', 'LOCKED', 'CANCELLED'] as const;
export type TermsState = (typeof termsStates)[number];

export const fulfillmentStates = ['NOT_STARTED', 'PACKING', 'PACKED', 'IN_TRANSIT', 'RECEIVER_REVIEW', 'COMPLETED', 'DISPUTED', 'NOT_APPLICABLE'] as const;
export type FulfillmentState = (typeof fulfillmentStates)[number];

export const transactionStatuses = ['DRAFT', 'ACTIVE', 'COMPLETED', 'DISPUTED', 'CANCELLED', 'ARCHIVED'] as const;
export type TransactionStatus = (typeof transactionStatuses)[number];

export const transactionTransitions: Readonly<Record<TransactionStatus, readonly TransactionStatus[]>> = {
  DRAFT: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['COMPLETED', 'DISPUTED', 'CANCELLED'],
  COMPLETED: ['DISPUTED', 'ARCHIVED'],
  DISPUTED: ['COMPLETED', 'CANCELLED', 'ARCHIVED'],
  CANCELLED: ['ARCHIVED'],
  ARCHIVED: [],
};

export type TransactionTerms = {
  saleType: 'SHIPPED' | 'LOCAL_HANDOFF';
  shippingResponsibility: 'SELLER' | 'BUYER' | 'NOT_APPLICABLE';
  returns: 'NO_RETURNS' | 'AS_AGREED' | 'PLATFORM_POLICY';
  returnWindowDays: number;
  customTerms: string;
};

export type TransactionItem = {
  title: string;
  description: string;
  category: string | null;
  amount: Money | null;
  identifiers: Array<{ label: string; value: string }>;
  conditionNotes: string;
};

export type Transaction = VersionedResource<'transaction'> & {
  organizationId: ResourceId<'organization'> | null;
  origin: TransactionOrigin;
  merchantReference: string | null;
  commerceContextId: ResourceId<'commerce_context'> | null;
  passportDraftId: ResourceId<'passport_draft'> | null;
  item: TransactionItem;
  terms: TransactionTerms;
  participants: ParticipantBinding[];
  termsState: TermsState;
  fulfillmentState: FulfillmentState;
  status: TransactionStatus;
  termsLockedAt: Date | null;
  completedAt: Date | null;
};

export type TransactionDto = PublicResource<'transaction', 'transaction'> & {
  origin: TransactionOrigin;
  merchantReference: string | null;
  commerceContextId: ResourceId<'commerce_context'> | null;
  passportDraftId: ResourceId<'passport_draft'> | null;
  item: TransactionItem;
  terms: TransactionTerms;
  participants: ParticipantReferenceDto[];
  termsState: TermsState;
  fulfillmentState: FulfillmentState;
  status: TransactionStatus;
  termsLockedAt: string | null;
  completedAt: string | null;
};

function parseParticipant(value: unknown, path: string): ParticipantReferenceDto {
  const input = strictObject(value, path, ['role', 'externalReference', 'displayLabel', 'claimState']);
  return {
    role: enumValue(input.role, `${path}.role`, participantRoles),
    externalReference: stringValue(input.externalReference, `${path}.externalReference`, { min: 1, max: 300 }),
    displayLabel: optionalString(input.displayLabel, `${path}.displayLabel`, { min: 1, max: 160 }),
    claimState: enumValue(input.claimState, `${path}.claimState`, participantClaimStates),
  };
}

function parseItem(value: unknown, path: string): TransactionItem {
  const input = strictObject(value, path, ['title', 'description', 'category', 'amount', 'identifiers', 'conditionNotes']);
  return {
    title: stringValue(input.title, `${path}.title`, { min: 1, max: 300 }),
    description: stringValue(input.description, `${path}.description`, { max: 10_000, trim: false }),
    category: optionalString(input.category, `${path}.category`, { min: 1, max: 160 }),
    amount: input.amount === undefined || input.amount === null ? null : parseMoney(input.amount, `${path}.amount`),
    identifiers: arrayValue(input.identifiers, `${path}.identifiers`, {
      max: 30,
      uniqueBy: (entry) => `${entry.label.toLowerCase()}:${entry.value}`,
      parse: (entry, entryPath) => {
        const item = strictObject(entry, entryPath, ['label', 'value']);
        return {
          label: stringValue(item.label, `${entryPath}.label`, { min: 1, max: 160 }),
          value: stringValue(item.value, `${entryPath}.value`, { min: 1, max: 300 }),
        };
      },
    }),
    conditionNotes: stringValue(input.conditionNotes, `${path}.conditionNotes`, { max: 10_000, trim: false }),
  };
}

function parseTerms(value: unknown, path: string): TransactionTerms {
  const input = strictObject(value, path, ['saleType', 'shippingResponsibility', 'returns', 'returnWindowDays', 'customTerms']);
  return {
    saleType: enumValue(input.saleType, `${path}.saleType`, ['SHIPPED', 'LOCAL_HANDOFF'] as const),
    shippingResponsibility: enumValue(input.shippingResponsibility, `${path}.shippingResponsibility`, ['SELLER', 'BUYER', 'NOT_APPLICABLE'] as const),
    returns: enumValue(input.returns, `${path}.returns`, ['NO_RETURNS', 'AS_AGREED', 'PLATFORM_POLICY'] as const),
    returnWindowDays: integerValue(input.returnWindowDays, `${path}.returnWindowDays`, 0, 365),
    customTerms: stringValue(input.customTerms, `${path}.customTerms`, { max: 10_000, trim: false }),
  };
}

export const transactionDtoSchema = schema<TransactionDto>((value) => {
  const input = strictObject(value, 'transaction', [
    'id', 'object', 'schemaVersion', 'origin', 'merchantReference', 'commerceContextId', 'passportDraftId', 'item', 'terms',
    'participants', 'termsState', 'fulfillmentState', 'status', 'termsLockedAt', 'completedAt', 'createdAt', 'updatedAt',
  ]);
  literalValue(input.object, 'transaction.object', 'transaction');
  literalValue(input.schemaVersion, 'transaction.schemaVersion', 1);
  return {
    id: parseResourceId('transaction', input.id, 'transaction.id', { allowLegacy: true }),
    object: 'transaction',
    schemaVersion: 1,
    origin: enumValue(input.origin, 'transaction.origin', transactionOrigins),
    merchantReference: optionalString(input.merchantReference, 'transaction.merchantReference', { min: 1, max: 200 }),
    commerceContextId: input.commerceContextId === undefined || input.commerceContextId === null ? null : parseResourceId('commerce_context', input.commerceContextId, 'transaction.commerceContextId'),
    passportDraftId: input.passportDraftId === undefined || input.passportDraftId === null ? null : parseResourceId('passport_draft', input.passportDraftId, 'transaction.passportDraftId'),
    item: parseItem(input.item, 'transaction.item'),
    terms: parseTerms(input.terms, 'transaction.terms'),
    participants: arrayValue(input.participants, 'transaction.participants', { max: 10, parse: parseParticipant, uniqueBy: (participant) => `${participant.role}:${participant.externalReference}` }),
    termsState: enumValue(input.termsState, 'transaction.termsState', termsStates),
    fulfillmentState: enumValue(input.fulfillmentState, 'transaction.fulfillmentState', fulfillmentStates),
    status: enumValue(input.status, 'transaction.status', transactionStatuses),
    termsLockedAt: optionalIsoDateTime(input.termsLockedAt, 'transaction.termsLockedAt'),
    completedAt: optionalIsoDateTime(input.completedAt, 'transaction.completedAt'),
    createdAt: isoDateTime(input.createdAt, 'transaction.createdAt'),
    updatedAt: isoDateTime(input.updatedAt, 'transaction.updatedAt'),
  };
});

export const claimStatuses = ['ISSUED', 'CLAIMED', 'EXPIRED', 'REVOKED'] as const;
export type ClaimStatus = (typeof claimStatuses)[number];

export const claimTransitions: Readonly<Record<ClaimStatus, readonly ClaimStatus[]>> = {
  ISSUED: ['CLAIMED', 'EXPIRED', 'REVOKED'],
  CLAIMED: [],
  EXPIRED: [],
  REVOKED: [],
};

export type ParticipantClaim = VersionedResource<'participant_claim'> & {
  transactionId: ResourceId<'transaction'>;
  role: ParticipantRole;
  externalReferenceHash: string;
  tokenHash: string;
  status: ClaimStatus;
  claimedActorId: string | null;
  expiresAt: Date;
  claimedAt: Date | null;
};

export type ParticipantClaimDto = PublicResource<'participant_claim', 'participant_claim'> & {
  transactionId: ResourceId<'transaction'>;
  role: ParticipantRole;
  status: ClaimStatus;
  expiresAt: string;
  claimedAt: string | null;
};

export const participantClaimDtoSchema = schema<ParticipantClaimDto>((value) => {
  const input = strictObject(value, 'participantClaim', ['id', 'object', 'schemaVersion', 'transactionId', 'role', 'status', 'expiresAt', 'claimedAt', 'createdAt', 'updatedAt']);
  literalValue(input.object, 'participantClaim.object', 'participant_claim');
  literalValue(input.schemaVersion, 'participantClaim.schemaVersion', 1);
  return {
    id: parseResourceId('participant_claim', input.id, 'participantClaim.id'),
    object: 'participant_claim',
    schemaVersion: 1,
    transactionId: parseResourceId('transaction', input.transactionId, 'participantClaim.transactionId', { allowLegacy: true }),
    role: enumValue(input.role, 'participantClaim.role', participantRoles),
    status: enumValue(input.status, 'participantClaim.status', claimStatuses),
    expiresAt: isoDateTime(input.expiresAt, 'participantClaim.expiresAt'),
    claimedAt: optionalIsoDateTime(input.claimedAt, 'participantClaim.claimedAt'),
    createdAt: isoDateTime(input.createdAt, 'participantClaim.createdAt'),
    updatedAt: isoDateTime(input.updatedAt, 'participantClaim.updatedAt'),
  };
});
