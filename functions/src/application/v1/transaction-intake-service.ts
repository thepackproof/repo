import type { ExtractionQuality, Money } from '../../domain/v1/common';
import {
  assertionSourceForIntakeSource,
  commerceContextDtoSchema,
  commerceContextTransitions,
  commercePlatforms,
  commerceTrustLevelForIntakeSource,
  consumerIntakeSourceTypes,
  passportDraftDtoSchema,
  passportDraftTransitions,
  type CommerceContextDto,
  type CommerceIntakeSourceType,
  type CommercePlatform,
  type ConsumerIntakeSourceType,
  type ItemDescriptor,
  type PassportDraftDto,
} from '../../domain/v1/commerce';
import { mapLegacyConsumerTransaction } from '../../domain/v1/compatibility';
import { assertTransition } from '../../domain/v1/common';
import { missingIntakeFields, parseCommerceArtifact, type ExtractionQualityMap, type IntakeExtractedField } from '../../domain/v1/transaction-intake-parsers';
import { DomainValidationError } from '../../domain/v1/runtime';
import { transactionDtoSchema, type TransactionTerms } from '../../domain/v1/transactions';
import { activeConsumerTransactionStatuses } from './consumer-transaction-service';
import { ApplicationError } from './errors';
import type { ApplicationEvent } from './events';
import { canonicalize, sha256 } from './merchant-transaction-service';

export const CONSUMER_INTAKE_INTEGRATION_ID = 'int_consumerIntake01';

export type TransactionIntakeCommand = {
  actorId: string;
  integrationId: string;
  organizationId: string | null;
  operationKey: string;
  requestId: string;
  intakeSourceType: ConsumerIntakeSourceType;
  platformIdentifier: string | null;
  parserVersion: string;
  originalArtifactSha256: string;
  item: ItemDescriptor;
  externalOrderId: string | null;
  externalListingId: string | null;
  productUrl: string | null;
  extractionQuality?: ExtractionQualityMap;
};

export type IntakeConfirmedFields = {
  title?: string;
  description?: string;
  variant?: string;
  sku?: string;
  priceMinor?: number;
  currency?: string;
  orderNumber?: string;
  quantity?: number;
};

export type TransactionIntakeArtifactCommand = {
  actorId: string;
  organizationId?: string | null;
  operationKey: string;
  requestId: string;
  intakeSourceType: ConsumerIntakeSourceType;
  originalArtifactSha256: string;
  artifactText: string | null;
  confirmed?: IntakeConfirmedFields | null;
};

export type TransactionIntakeStartCommand = {
  actorId: string;
  plan: string;
  commerceContextId: string;
  requestId: string;
  confirmed?: IntakeConfirmedFields | null;
};

export type TransactionIntakeStartResult = {
  transactionId: string;
  commerceContextId: string;
  passportDraftId: string;
  replayed: boolean;
};

export type PendingIntakeRecord = {
  commerceContextId: string;
  passportDraftId: string;
  title: string;
  variant: string | null;
  quantity: number;
  amount: Money | null;
  orderNumber: string | null;
  intakeSourceType: CommerceIntakeSourceType | null;
  platformIdentifier: string | null;
  importedAt: string;
  missingFields: string[];
  heuristicFields: IntakeExtractedField[];
};

export type TransactionIntakeResult = {
  commerceContextId: string;
  passportDraftId: string;
  pending: PendingIntakeRecord;
  parserVersion: string;
  replayed: boolean;
};

export type TransactionIntakeMutation = {
  actorId: string;
  organizationId: string | null;
  operationKey: string;
  requestFingerprint: string;
  commerceContextId: string;
  passportDraftId: string;
  commerceContext: CommerceContextDto;
  passportDraft: PassportDraftDto;
  pending: PendingIntakeRecord;
  event: ApplicationEvent;
};

export type PendingIntakeSnapshot = {
  actorId: string;
  status: 'PENDING' | 'CLAIMED';
  transactionId: string | null;
  expiresAt: Date;
  commerceContext: CommerceContextDto;
  passportDraft: PassportDraftDto;
};

export type IntakeTransactionRecord = {
  sellerId: string;
  buyerId: null;
  participantIds: string[];
  status: 'DRAFT';
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
  lockedAt: null;
  createdAt: Date;
  updatedAt: Date;
  source: {
    type: 'TRANSACTION_INTAKE';
    intakeSourceType: CommerceIntakeSourceType | null;
    commerceContextId: string;
    passportDraftId: string;
    trustLevel: string;
    platformIdentifier: string | null;
    parserVersion: string | null;
    originalArtifactSha256: string | null;
  };
};

export type IntakeClaimDecision =
  | { type: 'REPLAY'; result: TransactionIntakeStartResult }
  | { type: 'CREATE'; transaction: IntakeTransactionRecord; draftItem: ItemDescriptor; events: ApplicationEvent[] };

export interface TransactionIntakeRepository {
  createOrReplay(mutation: TransactionIntakeMutation): Promise<{ created: boolean }>;
  listPendingForActor(actorId: string): Promise<PendingIntakeRecord[]>;
  claim(
    commerceContextId: string,
    decide: (snapshot: PendingIntakeSnapshot | null, transactionId: string) => IntakeClaimDecision,
  ): Promise<TransactionIntakeStartResult>;
  hasActiveTransactionForSeller(sellerId: string, statuses: readonly string[]): Promise<boolean>;
}

function intakePlatform(platformIdentifier: string | null): CommercePlatform {
  const token = platformIdentifier?.trim().toUpperCase() ?? '';
  if ((commercePlatforms as readonly string[]).includes(token)) return token as CommercePlatform;
  if (token === 'SHOPIFY' || token === 'WOOCOMMERCE' || token === 'MAGENTO') return token;
  return platformIdentifier ? 'MARKETPLACE' : 'CUSTOM';
}

function populatedItemFields(item: ItemDescriptor): string[] {
  const fields = ['item.title', 'item.description', 'item.quantity'];
  if (item.category) fields.push('item.category');
  if (item.brand) fields.push('item.brand');
  if (item.model) fields.push('item.model');
  if (item.sku) fields.push('item.sku');
  if (item.gtin) fields.push('item.gtin');
  if (item.upc) fields.push('item.upc');
  if (item.mpn) fields.push('item.mpn');
  if (item.serialNumber) fields.push('item.serialNumber');
  if (item.selectedOptions.length) fields.push('item.selectedOptions');
  if (item.identifiers.length) fields.push('item.identifiers');
  if (item.amount) fields.push('item.amount');
  if (item.imageReferences.length) fields.push('item.imageReferences');
  return fields;
}

function variantLabel(item: ItemDescriptor): string | null {
  const label = item.selectedOptions.map((option) => `${option.name}: ${option.value}`).join('; ').trim();
  return label || null;
}

function mergeOption(options: ItemDescriptor['selectedOptions'], option: { name: string; value: string }): ItemDescriptor['selectedOptions'] {
  const next = options.filter((entry) => entry.name.toLowerCase() !== option.name.toLowerCase());
  next.push(option);
  return next;
}

function provenanceQuality(field: string, extraction: ExtractionQualityMap): ExtractionQuality | null {
  if (field === 'item.title') return extraction.title ?? null;
  if (field === 'item.amount') return extraction.price ?? null;
  if (field === 'item.selectedOptions') return extraction.variant ?? null;
  if (field === 'source.externalOrderId') return extraction.orderNumber ?? null;
  if (field === 'source.platformIdentifier') return extraction.platform ?? null;
  return null;
}

function extractionAfterConfirm(parsed: ExtractionQualityMap, confirmed: IntakeConfirmedFields | null | undefined): ExtractionQualityMap {
  const next = { ...parsed };
  if (confirmed?.title?.trim()) delete next.title;
  if (confirmed?.priceMinor != null) delete next.price;
  if (confirmed?.variant?.trim()) delete next.variant;
  if (confirmed?.orderNumber?.trim()) delete next.orderNumber;
  return next;
}

function heuristicFieldsFromProvenance(fieldProvenance: CommerceContextDto['fieldProvenance']): IntakeExtractedField[] {
  const mapping: Array<[string, IntakeExtractedField]> = [
    ['item.title', 'title'],
    ['item.amount', 'price'],
    ['item.selectedOptions', 'variant'],
    ['source.externalOrderId', 'orderNumber'],
    ['source.platformIdentifier', 'platform'],
  ];
  return mapping.filter(([key]) => fieldProvenance[key]?.extractionQuality === 'HEURISTIC').map(([, field]) => field);
}

export function overlayIntakeItem(base: ItemDescriptor, confirmed: IntakeConfirmedFields | null | undefined): ItemDescriptor {
  if (!confirmed) return base;
  const variant = confirmed.variant?.trim();
  const title = confirmed.title?.trim();
  const sku = confirmed.sku?.trim();
  const currency = confirmed.currency?.trim().toUpperCase();
  return {
    ...base,
    title: title || base.title,
    description: confirmed.description != null ? confirmed.description : base.description,
    sku: sku || base.sku,
    selectedOptions: variant ? mergeOption(base.selectedOptions, { name: 'Variant', value: variant.slice(0, 300) }) : base.selectedOptions,
    quantity: confirmed.quantity && confirmed.quantity >= 1 ? Math.min(confirmed.quantity, 100_000) : base.quantity,
    amount: confirmed.priceMinor != null
      ? { currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : (base.amount?.currency ?? 'USD'), minorUnits: confirmed.priceMinor }
      : base.amount,
  };
}

function legacyIdentifiers(item: ItemDescriptor): Array<{ label: string; value: string }> {
  const identifiers = item.identifiers.map(({ type, value }) => ({ label: type.replaceAll('_', ' '), value }));
  const direct = [
    ['Brand', item.brand], ['Model', item.model], ['SKU', item.sku], ['GTIN', item.gtin], ['UPC', item.upc], ['MPN', item.mpn], ['Serial number', item.serialNumber],
  ] as const;
  for (const [label, value] of direct) {
    if (value && !identifiers.some((entry) => entry.label === label && entry.value === value)) identifiers.push({ label, value });
  }
  for (const option of item.selectedOptions) {
    const name = `Option: ${option.name}`;
    if (!identifiers.some((entry) => entry.label === name && entry.value === option.value)) identifiers.push({ label: name, value: option.value });
  }
  return identifiers.slice(0, 20);
}

function domainError(error: unknown): never {
  if (error instanceof DomainValidationError) {
    throw new ApplicationError('INVALID_ARGUMENT', 'INVALID_INTAKE_PAYLOAD', error.message, error.issues.map((issue) => ({
      field: issue.path,
      code: issue.code,
      message: issue.message,
    })));
  }
  throw error;
}

export function pendingIntakeFromContext(
  commerceContext: CommerceContextDto,
  passportDraftId: string,
): PendingIntakeRecord {
  return {
    commerceContextId: commerceContext.id,
    passportDraftId,
    title: commerceContext.item.title,
    variant: variantLabel(commerceContext.item),
    quantity: commerceContext.item.quantity,
    amount: commerceContext.item.amount,
    orderNumber: commerceContext.source.externalOrderId,
    intakeSourceType: commerceContext.source.intakeSourceType,
    platformIdentifier: commerceContext.source.platformIdentifier,
    importedAt: commerceContext.source.capturedAt,
    missingFields: missingIntakeFields(commerceContext.item, commerceContext.source.externalOrderId),
    heuristicFields: heuristicFieldsFromProvenance(commerceContext.fieldProvenance),
  };
}

export class TransactionIntakeApplicationService {
  constructor(
    private readonly repository: TransactionIntakeRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  preview(artifactText: string | null, intakeSourceType: ConsumerIntakeSourceType) {
    if (!(consumerIntakeSourceTypes as readonly string[]).includes(intakeSourceType)) {
      throw new ApplicationError('INVALID_ARGUMENT', 'UNSUPPORTED_INTAKE_SOURCE', 'This intake adapter is not a consumer correspondence source.');
    }
    try {
      return parseCommerceArtifact(artifactText, intakeSourceType);
    } catch (error) {
      return domainError(error);
    }
  }

  async ingestArtifact(command: TransactionIntakeArtifactCommand): Promise<TransactionIntakeResult> {
    if (command.artifactText !== null) {
      const digest = sha256(command.artifactText);
      if (digest !== command.originalArtifactSha256) {
        throw new ApplicationError('INVALID_ARGUMENT', 'ARTIFACT_HASH_MISMATCH', 'The original artifact hash does not match the supplied correspondence text.');
      }
    }
    let parsed;
    try {
      parsed = parseCommerceArtifact(command.artifactText, command.intakeSourceType);
    } catch (error) {
      return domainError(error);
    }
    const item = overlayIntakeItem(parsed.item, command.confirmed);
    const externalOrderId = command.confirmed?.orderNumber?.trim() || parsed.externalOrderId;
    if (!item.title.trim()) {
      throw new ApplicationError('INVALID_ARGUMENT', 'INTAKE_TITLE_REQUIRED', 'Add the item name to import this purchase.', [{
        field: 'title',
        code: 'REQUIRED',
        message: 'Could not determine the item name from this correspondence.',
      }]);
    }
    return this.ingest({
      actorId: command.actorId,
      integrationId: CONSUMER_INTAKE_INTEGRATION_ID,
      organizationId: command.organizationId ?? null,
      operationKey: command.operationKey,
      requestId: command.requestId,
      intakeSourceType: command.intakeSourceType,
      platformIdentifier: parsed.platformIdentifier,
      parserVersion: parsed.parserVersion,
      originalArtifactSha256: command.originalArtifactSha256,
      item,
      externalOrderId,
      externalListingId: parsed.externalListingId,
      productUrl: parsed.productUrl,
      extractionQuality: extractionAfterConfirm(parsed.extractionQuality, command.confirmed),
    });
  }

  async ingest(command: TransactionIntakeCommand): Promise<TransactionIntakeResult> {
    if (!(consumerIntakeSourceTypes as readonly string[]).includes(command.intakeSourceType)) {
      throw new ApplicationError('INVALID_ARGUMENT', 'UNSUPPORTED_INTAKE_SOURCE', 'This intake adapter is not a consumer correspondence source.');
    }
    const timestamp = this.now();
    const importedAt = timestamp.toISOString();
    const expiresAt = new Date(timestamp.getTime() + 30 * 86_400_000);
    const identity = canonicalize({ actorId: command.actorId, operationKey: command.operationKey });
    const commerceContextId = `ctx_${sha256(`consumer-intake-context-v1\n${identity}`).slice(0, 40)}`;
    const passportDraftId = `draft_${sha256(`consumer-intake-draft-v1\n${identity}`).slice(0, 40)}`;
    const requestFingerprint = sha256(canonicalize({
      actorId: command.actorId,
      intakeSourceType: command.intakeSourceType,
      platformIdentifier: command.platformIdentifier,
      parserVersion: command.parserVersion,
      originalArtifactSha256: command.originalArtifactSha256,
      item: command.item,
      externalOrderId: command.externalOrderId,
      externalListingId: command.externalListingId,
      productUrl: command.productUrl,
    }));
    const assertionSource = assertionSourceForIntakeSource(command.intakeSourceType);
    const extraction = command.extractionQuality ?? {};
    const provenanceFields = [
      ...populatedItemFields(command.item),
      ...(command.externalOrderId ? ['source.externalOrderId'] : []),
      ...(command.platformIdentifier ? ['source.platformIdentifier'] : []),
    ];
    const fieldProvenance = Object.fromEntries(provenanceFields.map((field) => [field, {
      source: assertionSource,
      confidence: 'ASSERTED' as const,
      importedAt,
      sourceReference: command.externalOrderId ?? command.productUrl,
      extractionMethod: command.parserVersion,
      sourceArtifactSha256: command.originalArtifactSha256,
      extractionQuality: provenanceQuality(field, extraction),
    }]));
    let context;
    let draft;
    try {
      context = commerceContextDtoSchema.parse({
        id: commerceContextId,
        object: 'commerce_context',
        schemaVersion: 1,
        integrationId: command.integrationId,
        source: {
          platform: intakePlatform(command.platformIdentifier),
          trustLevel: commerceTrustLevelForIntakeSource(command.intakeSourceType),
          intakeSourceType: command.intakeSourceType,
          platformIdentifier: command.platformIdentifier,
          parserVersion: command.parserVersion,
          originalArtifactSha256: command.originalArtifactSha256,
          externalShopId: null,
          externalProductId: null,
          externalListingId: command.externalListingId,
          externalVariantId: null,
          externalOrderId: command.externalOrderId,
          externalLineItemId: null,
          productUrl: command.productUrl,
          capturedAt: importedAt,
        },
        item: command.item,
        fieldProvenance,
        canonicalPayloadSha256: sha256(canonicalize(command.item)),
        status: 'CREATED',
        supersedesCommerceContextId: null,
        expiresAt: expiresAt.toISOString(),
        createdAt: importedAt,
        updatedAt: importedAt,
      });
      draft = passportDraftDtoSchema.parse({
        id: passportDraftId,
        object: 'passport_draft',
        schemaVersion: 1,
        commerceContextId,
        transactionId: null,
        item: command.item,
        status: 'READY_FOR_REVIEW',
        expiresAt: expiresAt.toISOString(),
        createdAt: importedAt,
        updatedAt: importedAt,
      });
    } catch (error) {
      return domainError(error);
    }
    const event: ApplicationEvent = {
      id: `evt_${sha256(`COMMERCE_CONTEXT_CREATED\n${commerceContextId}`).slice(0, 40)}`,
      schemaVersion: 1,
      type: 'COMMERCE_CONTEXT_CREATED',
      organizationId: command.organizationId,
      actor: { type: 'USER', id: command.actorId },
      resourceType: 'commerce_context',
      resourceId: commerceContextId,
      requestId: command.requestId,
      occurredAt: timestamp,
      data: {
        trustLevel: context.source.trustLevel,
        intakeSourceType: command.intakeSourceType,
        platformIdentifier: command.platformIdentifier,
        parserVersion: command.parserVersion,
        originalArtifactSha256: command.originalArtifactSha256,
        requestFingerprint,
      },
    };
    const pending = pendingIntakeFromContext(context, passportDraftId);
    const result = await this.repository.createOrReplay({
      actorId: command.actorId,
      organizationId: command.organizationId,
      operationKey: command.operationKey,
      requestFingerprint,
      commerceContextId,
      passportDraftId,
      commerceContext: context,
      passportDraft: draft,
      pending,
      event,
    });
    return {
      commerceContextId,
      passportDraftId,
      pending,
      parserVersion: command.parserVersion,
      replayed: !result.created,
    };
  }

  async listPending(actorId: string): Promise<PendingIntakeRecord[]> {
    return this.repository.listPendingForActor(actorId);
  }

  async start(command: TransactionIntakeStartCommand): Promise<TransactionIntakeStartResult> {
    const quotaExceeded = command.plan !== 'PRO'
      && await this.repository.hasActiveTransactionForSeller(command.actorId, activeConsumerTransactionStatuses);
    return this.repository.claim(command.commerceContextId, (snapshot, transactionId) => {
      if (!snapshot) throw new ApplicationError('NOT_FOUND', 'INTAKE_NOT_FOUND', 'Imported purchase not found.');
      if (snapshot.actorId !== command.actorId) {
        throw new ApplicationError('FORBIDDEN', 'INTAKE_ACTOR_MISMATCH', 'Only the account that imported this purchase can start a PackProof from it.');
      }
      const timestamp = this.now();
      if (snapshot.expiresAt.getTime() < timestamp.getTime()) {
        throw new ApplicationError('DEADLINE_EXCEEDED', 'INTAKE_EXPIRED', 'This imported purchase expired. Import the receipt again.');
      }
      if (snapshot.status === 'CLAIMED' && snapshot.transactionId) {
        return {
          type: 'REPLAY',
          result: {
            transactionId: snapshot.transactionId,
            commerceContextId: snapshot.commerceContext.id,
            passportDraftId: snapshot.passportDraft.id,
            replayed: true,
          },
        };
      }
      if (quotaExceeded) {
        throw new ApplicationError('RESOURCE_EXHAUSTED', 'ACTIVE_TRANSACTION_LIMIT', 'The free plan supports one active PackProof. Upgrade to create another.');
      }
      if (snapshot.status !== 'PENDING' || snapshot.commerceContext.status !== 'CREATED' || snapshot.passportDraft.status !== 'READY_FOR_REVIEW') {
        throw new ApplicationError('FAILED_PRECONDITION', 'INTAKE_NOT_STARTABLE', 'This imported purchase cannot start a PackProof in its current state.');
      }
      try {
        assertTransition(commerceContextTransitions, snapshot.commerceContext.status, 'CLAIMED', 'commerceContext');
        assertTransition(passportDraftTransitions, snapshot.passportDraft.status, 'BOUND', 'passportDraft');
      } catch (error) {
        return domainError(error);
      }
      const item = overlayIntakeItem(snapshot.passportDraft.item, command.confirmed);
      if (!item.title.trim()) {
        throw new ApplicationError('INVALID_ARGUMENT', 'INTAKE_TITLE_REQUIRED', 'Add the item name to start this PackProof.');
      }
      const amount = item.amount ?? { currency: 'USD', minorUnits: 0 };
      const terms: TransactionTerms = {
        saleType: 'SHIPPED',
        shippingResponsibility: 'SELLER',
        returns: 'AS_AGREED',
        returnWindowDays: 14,
        customTerms: '',
      };
      const transaction: IntakeTransactionRecord = {
        sellerId: command.actorId,
        buyerId: null,
        participantIds: [command.actorId],
        status: 'DRAFT',
        title: item.title,
        category: item.category ?? 'Imported purchase',
        description: item.description,
        priceMinor: amount.minorUnits,
        currency: amount.currency,
        identifiers: legacyIdentifiers(item),
        conditionNotes: '',
        terms,
        confirmedBy: [],
        handoffConfirmedBy: [],
        completedBy: [],
        lockedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        source: {
          type: 'TRANSACTION_INTAKE',
          intakeSourceType: snapshot.commerceContext.source.intakeSourceType,
          commerceContextId: snapshot.commerceContext.id,
          passportDraftId: snapshot.passportDraft.id,
          trustLevel: snapshot.commerceContext.source.trustLevel,
          platformIdentifier: snapshot.commerceContext.source.platformIdentifier,
          parserVersion: snapshot.commerceContext.source.parserVersion,
          originalArtifactSha256: snapshot.commerceContext.source.originalArtifactSha256,
        },
      };
      transactionDtoSchema.parse(mapLegacyConsumerTransaction({
        id: transactionId,
        ...transaction,
        source: { type: 'TRANSACTION_INTAKE', commerceContextId: snapshot.commerceContext.id, passportDraftId: snapshot.passportDraft.id },
      }));
      const events: ApplicationEvent[] = [
        {
          id: `evt_${sha256(`INTAKE_TRANSACTION_CREATED\n${snapshot.commerceContext.id}`).slice(0, 40)}`,
          schemaVersion: 1,
          type: 'TRANSACTION_CREATED',
          organizationId: null,
          actor: { type: 'USER', id: command.actorId },
          resourceType: 'transaction',
          resourceId: transactionId,
          requestId: command.requestId,
          occurredAt: timestamp,
          data: {
            origin: 'CONSUMER',
            trustLevel: snapshot.commerceContext.source.trustLevel,
            commerceContextId: snapshot.commerceContext.id,
            passportDraftId: snapshot.passportDraft.id,
            intakeSourceType: snapshot.commerceContext.source.intakeSourceType,
          },
        },
        {
          id: `evt_${sha256(`COMMERCE_CONTEXT_CLAIMED\n${snapshot.commerceContext.id}`).slice(0, 40)}`,
          schemaVersion: 1,
          type: 'COMMERCE_CONTEXT_CLAIMED',
          organizationId: null,
          actor: { type: 'USER', id: command.actorId },
          resourceType: 'commerce_context',
          resourceId: snapshot.commerceContext.id,
          requestId: command.requestId,
          occurredAt: timestamp,
          data: { transactionId, passportDraftId: snapshot.passportDraft.id, trustLevel: snapshot.commerceContext.source.trustLevel },
        },
      ];
      return { type: 'CREATE', transaction, draftItem: item, events };
    });
  }
}

export function isConsumerIntakeSourceType(value: string): value is ConsumerIntakeSourceType {
  return (consumerIntakeSourceTypes as readonly string[]).includes(value);
}
