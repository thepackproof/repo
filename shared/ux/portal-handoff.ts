/**
 * Portal → native capture handoff.
 * The URL names a transaction. requestedAction is a mint-time hint only.
 * Native always re-evaluates the Next Action Engine after open.
 */
import { CAPTURE_PRIMARY_ACTIONS, resolveNextRequiredAction, type UxFlowInput, type UxPrimaryActionKind } from './next-action.ts';

export const PORTAL_HANDOFF_VERSION = 1 as const;
export const PORTAL_HANDOFF_TTL_MS = 15 * 60 * 1000;

export const PORTAL_HANDOFF_ACTION_ALIASES = {
  pack: 'START_PACKING',
  seal: 'RECORD_SEAL',
  arrival: 'RECORD_ARRIVAL',
  unbox: 'RECORD_UNBOXING',
  'return-unbox': 'RECORD_RETURN_UNBOXING',
  START_PACKING: 'START_PACKING',
  RECORD_SEAL: 'RECORD_SEAL',
  RECORD_ARRIVAL: 'RECORD_ARRIVAL',
  RECORD_UNBOXING: 'RECORD_UNBOXING',
  RECORD_RETURN_PACKING: 'RECORD_RETURN_PACKING',
  RECORD_RETURN_SEAL: 'RECORD_RETURN_SEAL',
  RECORD_RETURN_UNBOXING: 'RECORD_RETURN_UNBOXING',
} as const;

export type PortalHandoffObject = {
  version: typeof PORTAL_HANDOFF_VERSION;
  transactionId: string;
  requestedAction: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
};

export type ResolvedPortalHandoff = {
  transactionId: string;
  action: UxPrimaryActionKind | null;
  requestedActionIgnored: boolean;
  expired: boolean;
  captureOnPhone: boolean;
};

export function portalHandoffFromOpenParams(params: {
  transaction?: string | null;
  action?: string | null;
  requestedAction?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
}): PortalHandoffObject | null {
  const transactionId = typeof params.transaction === 'string' ? params.transaction.trim() : '';
  if (!transactionId) return null;
  const raw = params.requestedAction ?? params.action ?? null;
  const requestedAction = raw && raw in PORTAL_HANDOFF_ACTION_ALIASES
    ? PORTAL_HANDOFF_ACTION_ALIASES[raw as keyof typeof PORTAL_HANDOFF_ACTION_ALIASES]
    : raw;
  return {
    version: PORTAL_HANDOFF_VERSION,
    transactionId,
    requestedAction: requestedAction || null,
    issuedAt: params.issuedAt ?? null,
    expiresAt: params.expiresAt ?? null,
  };
}

export function portalHandoffIsExpired(handoff: PortalHandoffObject, now: Date | string = new Date()): boolean {
  if (!handoff.expiresAt) return false;
  const expiresAt = Date.parse(handoff.expiresAt);
  if (!Number.isFinite(expiresAt)) return false;
  const current = typeof now === 'string' ? Date.parse(now) : now.getTime();
  return current >= expiresAt;
}

export function resolvePortalHandoff(input: {
  handoff: PortalHandoffObject;
  transaction: UxFlowInput['transaction'];
  viewerId: string;
  protocol?: UxFlowInput['protocol'];
  now?: Date | string;
}): ResolvedPortalHandoff {
  const now = input.now ?? new Date();
  const expired = portalHandoffIsExpired(input.handoff, now);
  const next = resolveNextRequiredAction({
    transaction: input.transaction,
    viewerId: input.viewerId,
    protocol: input.protocol ?? null,
  });
  const action = next.primaryAction?.kind ?? null;
  const requested = input.handoff.requestedAction;
  return {
    transactionId: input.handoff.transactionId,
    action,
    requestedActionIgnored: Boolean(requested && requested !== action),
    expired,
    captureOnPhone: Boolean(action && CAPTURE_PRIMARY_ACTIONS.has(action)),
  };
}
