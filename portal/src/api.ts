import { auth, currentAppCheckToken } from './firebase';

export class PortalApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'PortalApiError';
  }
}

async function authorizedHeaders(): Promise<HeadersInit> {
  const user = auth?.currentUser;
  if (!user) throw new PortalApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  const [idToken, appCheck] = await Promise.all([user.getIdToken(), currentAppCheckToken()]);
  return {
    authorization: `Bearer ${idToken}`,
    'x-firebase-appcheck': appCheck,
    accept: 'application/json',
  };
}

async function portalFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(await authorizedHeaders()),
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new PortalApiError(response.status, body.error?.code ?? 'REQUEST_FAILED', body.error?.message ?? 'The portal request failed.');
  }
  return body as T;
}

export type PortalProtocol = {
  hasPackingVideo: boolean;
  hasSealReference: boolean;
  hasArrivalPhoto: boolean;
  hasUnboxingVideo: boolean;
  sellerReferenceComplete: boolean;
  buyerArrivalComplete: boolean;
  outboundComplete: boolean;
};

export type PortalTransaction = {
  id: string;
  object: 'portal_transaction';
  schemaVersion: 1;
  sellerId: string | null;
  buyerId: string | null;
  participantIds: string[];
  status: string;
  title: string;
  category: string;
  description: string;
  priceMinor: number | null;
  currency: string | null;
  identifiers: { label: string; value: string }[];
  conditionNotes: string;
  terms: {
    saleType: 'SHIPPED' | 'LOCAL_HANDOFF';
    shippingResponsibility: 'SELLER' | 'BUYER' | 'NOT_APPLICABLE';
    returns: 'NO_RETURNS' | 'AS_AGREED' | 'PLATFORM_POLICY';
    returnWindowDays: number;
    customTerms: string;
  } | null;
  confirmedBy: string[];
  handoffConfirmedBy: string[];
  completedBy: string[];
  passportId: string | null;
  passportDisplayId: string | null;
  source: { type: string | null; platform: string | null; externalOrderId: string | null } | null;
  protocol: PortalProtocol;
  lockedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PortalMobileHandoff = {
  object: 'portal_mobile_handoff';
  schemaVersion: 1;
  channel: 'WEB_PORTAL';
  transactionId: string;
  action: string;
  captureOnNativeOnly: true;
  universalLink: string;
  appLink: string;
  storeUrl: string;
};

export function getHome() {
  return portalFetch<{ data: { viewerId: string; channel: 'WEB_PORTAL'; transactions: PortalTransaction[] } }>('/v1/portal/home');
}

export function listTransactions() {
  return portalFetch<{ data: PortalTransaction[] }>('/v1/portal/transactions');
}

export function getTransaction(id: string) {
  return portalFetch<{ data: PortalTransaction }>(`/v1/portal/transactions/${encodeURIComponent(id)}`);
}

export function getTimeline(id: string) {
  return portalFetch<{ data: Array<{ id: string; type: string; summary: string; occurredAt: string }> }>(`/v1/portal/transactions/${encodeURIComponent(id)}/timeline`);
}

export function getPassport(id: string) {
  return portalFetch<{ data: Record<string, unknown> }>(`/v1/portal/transactions/${encodeURIComponent(id)}/passport`);
}

export function getSession() {
  return portalFetch<{ data: { actorId: string; channel: 'WEB_PORTAL' } }>('/v1/portal/session');
}

export function listEvidence(id: string) {
  return portalFetch<{ data: Array<{
    id: string;
    type: string;
    status: string;
    sha256: string | null;
    workflowReady: boolean;
    finalizedAt: string | null;
  }> }>(`/v1/portal/transactions/${encodeURIComponent(id)}/evidence`);
}

export function createMobileHandoff(id: string, action: string) {
  return portalFetch<{ data: PortalMobileHandoff }>(`/v1/portal/transactions/${encodeURIComponent(id)}/mobile-handoff`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
}

export function toUxTransaction(item: PortalTransaction) {
  return {
    id: item.id,
    sellerId: item.sellerId ?? '',
    buyerId: item.buyerId,
    participantIds: item.participantIds,
    status: item.status as import('@packproof/ux').TransactionStatus,
    title: item.title,
    category: item.category,
    description: item.description,
    priceMinor: item.priceMinor ?? 0,
    currency: item.currency ?? 'USD',
    identifiers: item.identifiers,
    conditionNotes: item.conditionNotes,
    terms: item.terms ?? {
      saleType: 'SHIPPED' as const,
      shippingResponsibility: 'SELLER' as const,
      returns: 'AS_AGREED' as const,
      returnWindowDays: 0,
      customTerms: '',
    },
    confirmedBy: item.confirmedBy,
    handoffConfirmedBy: item.handoffConfirmedBy,
    completedBy: item.completedBy,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    lockedAt: item.lockedAt,
    passportId: item.passportId,
    passportDisplayId: item.passportDisplayId,
    source: item.source
      ? {
          type: item.source.type ?? undefined,
          platform: item.source.platform ?? undefined,
          externalOrderId: item.source.externalOrderId ?? undefined,
        }
      : null,
  };
}
