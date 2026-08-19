import type { DateLike, TimelineEvent } from '@/types/models';

export type ActivityContext = {
  viewerId: string;
  sellerId: string;
  buyerId: string | null;
  otherPartyName?: string | null;
};

function actorLabel(actorId: string, ctx: ActivityContext): string {
  if (actorId === ctx.viewerId) return 'You';
  const name = ctx.otherPartyName?.trim();
  if (name) return name;
  if (actorId === ctx.sellerId) return 'Seller';
  if (actorId === ctx.buyerId) return 'Buyer';
  return 'The other participant';
}

function sentenceFromEvidenceSummary(summary: string, actor: string): string {
  const lower = summary.toLowerCase();
  const failed = lower.includes('quarantined') || lower.includes('integrity');
  if (lower.includes('packing video')) return failed ? 'Packing video could not be used. Recapture this step.' : 'Packing video recorded.';
  if (lower.includes('shipping label')) return failed ? 'Shipping-label photo could not be used. Recapture this step.' : 'Shipping label captured.';
  if (lower.includes('delivery photo') || lower.includes('arrival')) {
    return failed
      ? 'Arrival photo could not be used. Recapture this step.'
      : actor === 'You' ? 'You recorded delivery.' : 'Buyer recorded delivery.';
  }
  if (lower.includes('unboxing')) return failed ? 'Unboxing video could not be used. Recapture this step.' : 'Unboxing recorded.';
  if (lower.includes('return packing')) return failed ? 'Return packing could not be used. Recapture this step.' : 'Return packing recorded.';
  if (lower.includes('return shipping')) return failed ? 'Return label photo could not be used. Recapture this step.' : 'Return shipping label captured.';
  if (lower.includes('return unboxing')) return failed ? 'Return unboxing could not be used. Recapture this step.' : 'Returned package unboxing recorded.';
  if (failed) return 'Evidence could not be used. Open the PackProof to see whether to recapture or retry.';
  if (actor === 'You') return 'You added evidence.';
  return 'PackProof finished processing the evidence.';
}

export function humanActivitySentence(event: Pick<TimelineEvent, 'actorId' | 'type' | 'summary'>, ctx: ActivityContext): string {
  const actor = actorLabel(event.actorId, ctx);
  const type = event.type.toUpperCase();
  const both = /both part/i.test(event.summary);

  switch (type) {
    case 'TRANSACTION_CREATED':
      return actor === 'You' ? 'You created this PackProof.' : `${actor} created this PackProof.`;
    case 'DRAFT_UPDATED':
      return actor === 'You' ? 'You updated the transaction details.' : `${actor} updated the transaction details.`;
    case 'INVITE_CREATED':
      return actor === 'You' ? 'Invitation sent.' : `${actor} sent an invitation.`;
    case 'BUYER_JOINED':
      return actor === 'You' ? 'You joined the PackProof.' : `${actor} joined the PackProof.`;
    case 'TERMS_CONFIRMED':
      if (both) return 'Both participants confirmed the transaction details.';
      return actor === 'You' ? 'You confirmed the transaction details.' : `${actor} confirmed the transaction details.`;
    case 'EVIDENCE_FINALIZED':
    case 'EVIDENCE_INTEGRITY_MISMATCH':
      return sentenceFromEvidenceSummary(event.summary, actor);
    case 'SHIPPED':
      return actor === 'You' ? 'You added tracking. The package is in transit.' : 'The package is in transit.';
    case 'RECEIVED':
      return actor === 'You' ? 'You confirmed the package arrived.' : `${actor} recorded delivery.`;
    case 'HANDOFF_CONFIRMED':
      if (both) return 'Both participants confirmed the item changed hands.';
      return actor === 'You' ? 'You confirmed the item changed hands.' : `${actor} confirmed the item changed hands.`;
    case 'COMPLETION_CONFIRMED':
      if (both) return 'Both participants marked this PackProof complete.';
      return actor === 'You' ? 'You marked this PackProof complete.' : `${actor} marked this PackProof complete.`;
    case 'CONCERN_RAISED':
      return actor === 'You' ? 'You raised a concern.' : `${actor} raised a concern.`;
    case 'PACKET_GENERATED':
      return 'An evidence packet is ready to download.';
    case 'RETURN_PASSPORT_REQUESTED':
      return actor === 'You' ? 'You requested a return.' : `${actor} requested a return.`;
    case 'RETURN_PASSPORT_AUTHORIZED':
      return actor === 'You' ? 'You authorized the return.' : `${actor} authorized the return.`;
    case 'RETURN_SHIPPED':
      return 'The return is in transit.';
    case 'RETURN_RECEIVED':
      return actor === 'You' ? 'You recorded the returned package.' : `${actor} recorded the returned package.`;
    case 'RETURN_COMPLETION_CONFIRMED':
      if (both) return 'Both participants completed the return.';
      return actor === 'You' ? 'You completed the return.' : `${actor} completed the return.`;
    case 'TRANSACTION_CANCELLED':
      return actor === 'You' ? 'You cancelled this PackProof.' : `${actor} cancelled this PackProof.`;
    case 'PASSPORT_ISSUED':
    case 'PASSPORT_UPDATED':
      return 'Your PackProof Passport is ready.';
    default:
      return event.summary || 'Something happened on this PackProof.';
  }
}

export function formatActivityTime(value: DateLike): string {
  if (!value) return 'Pending';
  const date = typeof value === 'string' ? new Date(value) : value.toDate?.() ?? new Date((value.seconds ?? 0) * 1000);
  if (Number.isNaN(date.getTime())) return 'Pending';
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
}
