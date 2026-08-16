import { createHash } from 'node:crypto';
import { mapLegacyConsumerTransaction } from '../../domain/v1/compatibility';
import { transactionDtoSchema, type TransactionTerms } from '../../domain/v1/transactions';
import { ApplicationError } from './errors';
import type { ApplicationEvent } from './events';
import { sha256 } from './merchant-transaction-service';

export type ConnectSessionSnapshot = {
  id: string;
  commerceContextId: string | null;
  integrationId: string;
  platform: string;
  externalOrderId: string;
  externalSellerId: string;
  trackingNumber: string | null;
  carrier: string | null;
  itemTitle: string;
  itemDescription: string;
  declaredWeightGrams: number | null;
  priceMinor: number;
  currency: string;
  callbackUrl: string;
  tokenHash: string | null;
  codeChallenge: string | null;
  status: string;
  transactionId: string | null;
  claimedBy: string | null;
  expiresAt: Date;
};

export type ConnectGrantExchangeCommand = {
  actorId: string;
  sessionId: string;
  token: string;
  requestId: string;
  clientId?: string;
  redirectUri?: string;
  codeVerifier?: string;
};

export type ConnectTransactionRecord = {
  sellerId: string;
  buyerId: null;
  participantIds: string[];
  status: 'TERMS_LOCKED';
  title: string;
  category: string;
  description: string;
  priceMinor: number;
  currency: string;
  identifiers: Array<{ label: string; value: string }>;
  conditionNotes: string;
  terms: TransactionTerms;
  confirmedBy: string[];
  handoffConfirmedBy: string[];
  completedBy: string[];
  lockedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  source: {
    type: 'PACKPROOF_CONNECT';
    platform: string;
    integrationId: string;
    connectSessionId: string;
    commerceContextId: string | null;
    externalOrderId: string;
    externalSellerId: string;
    callbackUrl: string;
    trackingNumber: string | null;
    carrier: string | null;
    declaredWeightGrams: number | null;
  };
};

export type ConnectRedemptionDecision =
  | { type: 'REPLAY'; result: { transactionId: string; connectSessionId: string } }
  | { type: 'CREATE'; transaction: ConnectTransactionRecord; event: ApplicationEvent };

export interface ConnectHandoffRepository {
  redeem(
    sessionId: string,
    decide: (session: ConnectSessionSnapshot | null, transactionId: string) => ConnectRedemptionDecision,
  ): Promise<{ transactionId: string; connectSessionId: string }>;
}

export interface HandoffTokenVerifier {
  verify(token: string, expectedHash: string): boolean;
}

function pkceChallengeS256(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Non-destructive Connect grant evaluation. A valid code with wrong client,
 * redirect, PKCE, or token parameters must throw here so the repository never
 * reaches compare-and-set consumption.
 */
export function evaluateConnectGrantExchange(
  session: ConnectSessionSnapshot | null,
  command: ConnectGrantExchangeCommand,
  tokenVerifier: HandoffTokenVerifier,
  transactionId: string,
  now: Date,
): ConnectRedemptionDecision {
  if (!session) throw new ApplicationError('NOT_FOUND', 'CONNECT_SESSION_NOT_FOUND', 'PackProof Connect session not found.');
  if (session.claimedBy && session.claimedBy !== command.actorId) {
    throw new ApplicationError('CONFLICT', 'CONNECT_SESSION_ALREADY_CLAIMED', 'This PackProof Connect session was claimed by another account.');
  }
  if (session.claimedBy === command.actorId && session.transactionId) {
    return { type: 'REPLAY', result: { transactionId: session.transactionId, connectSessionId: session.id } };
  }
  if (session.expiresAt.getTime() < now.getTime()) {
    throw new ApplicationError('DEADLINE_EXCEEDED', 'CONNECT_SESSION_EXPIRED', 'PackProof Connect session expired.');
  }
  if (session.status !== 'PENDING_REDEMPTION') {
    throw new ApplicationError('FAILED_PRECONDITION', 'CONNECT_SESSION_NOT_REDEEMABLE', 'This PackProof Connect session cannot be redeemed in its current state.');
  }
  if (command.clientId && command.clientId !== session.integrationId) {
    throw new ApplicationError('FORBIDDEN', 'CONNECT_CLIENT_MISMATCH', 'The client does not match the Connect session that issued this grant.');
  }
  if (command.redirectUri && command.redirectUri !== session.callbackUrl) {
    throw new ApplicationError('FORBIDDEN', 'CONNECT_REDIRECT_MISMATCH', 'The redirect URI does not exactly match the registered Connect callback.');
  }
  if (session.codeChallenge) {
    if (!command.codeVerifier || pkceChallengeS256(command.codeVerifier) !== session.codeChallenge) {
      throw new ApplicationError('FORBIDDEN', 'CONNECT_PKCE_MISMATCH', 'PKCE verification failed for this Connect grant.');
    }
  } else if (command.codeVerifier) {
    throw new ApplicationError('FORBIDDEN', 'CONNECT_PKCE_MISMATCH', 'PKCE verification failed for this Connect grant.');
  }
  if (!session.tokenHash || !tokenVerifier.verify(command.token, session.tokenHash)) {
    throw new ApplicationError('FORBIDDEN', 'INVALID_HANDOFF_TOKEN', 'Invalid PackProof Connect handoff token.');
  }

  const terms: TransactionTerms = {
    saleType: 'SHIPPED',
    shippingResponsibility: 'SELLER',
    returns: 'PLATFORM_POLICY',
    returnWindowDays: 0,
    customTerms: `Order imported from ${session.platform}.`,
  };
  const transaction: ConnectTransactionRecord = {
    sellerId: command.actorId,
    buyerId: null,
    participantIds: [command.actorId],
    status: 'TERMS_LOCKED',
    title: session.itemTitle,
    category: 'Platform order',
    description: session.itemDescription,
    priceMinor: session.priceMinor,
    currency: session.currency,
    identifiers: [{ label: 'External order ID', value: session.externalOrderId }],
    conditionNotes: '',
    terms,
    confirmedBy: [command.actorId],
    handoffConfirmedBy: [],
    completedBy: [],
    lockedAt: now,
    createdAt: now,
    updatedAt: now,
    source: {
      type: 'PACKPROOF_CONNECT',
      platform: session.platform,
      integrationId: session.integrationId,
      connectSessionId: session.id,
      commerceContextId: session.commerceContextId,
      externalOrderId: session.externalOrderId,
      externalSellerId: session.externalSellerId,
      callbackUrl: session.callbackUrl,
      trackingNumber: session.trackingNumber,
      carrier: session.carrier,
      declaredWeightGrams: session.declaredWeightGrams,
    },
  };
  transactionDtoSchema.parse(mapLegacyConsumerTransaction({ id: transactionId, ...transaction }));
  const event: ApplicationEvent = {
    id: `evt_${sha256(`connect-redeemed\n${session.id}`).slice(0, 40)}`,
    schemaVersion: 1,
    type: 'TRANSACTION_CREATED',
    organizationId: null,
    actor: { type: 'USER', id: command.actorId },
    resourceType: 'transaction',
    resourceId: transactionId,
    requestId: command.requestId,
    occurredAt: now,
    data: {
      origin: 'PACKPROOF_CONNECT',
      integrationId: session.integrationId,
      connectSessionId: session.id,
      commerceContextId: session.commerceContextId,
      externalOrderIdHash: sha256(session.externalOrderId),
    },
  };
  return { type: 'CREATE', transaction, event };
}

export class ConnectHandoffApplicationService {
  constructor(
    private readonly repository: ConnectHandoffRepository,
    private readonly tokenVerifier: HandoffTokenVerifier,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async redeem(command: ConnectGrantExchangeCommand): Promise<{ transactionId: string; connectSessionId: string }> {
    return this.repository.redeem(command.sessionId, (session, transactionId) => (
      evaluateConnectGrantExchange(session, command, this.tokenVerifier, transactionId, this.now())
    ));
  }
}
