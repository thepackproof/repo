import { createHash } from 'node:crypto';
import {
  commerceContextMayAppearAsPassportOrderContext,
  isAuthoritativeCommerceTrustLevel,
  isUserProvidedCommerceArtifact,
  type CommerceTrustLevel,
} from './commerce';

export const PASSPORT_OBJECT = 'packproof_passport' as const;
export const PASSPORT_SNAPSHOT_OBJECT = 'packproof_passport_snapshot' as const;
export const PASSPORT_EXPORT_OBJECT = 'packproof_passport_export' as const;
export const PASSPORT_SCHEMA_VERSION = 1 as const;
export const PASSPORT_PDF_RENDERER_VERSION = 'packproof-passport-pdf@1.1.0' as const;
export const PASSPORT_ID_HASH_PREFIX = 'packproof-passport-id-v1\n';
export const PASSPORT_DISPLAY_HASH_PREFIX = 'packproof-passport-display-v1\n';
export const PASSPORT_COMPARISON_FOOTNOTE = 'RELATIONSHIP_ONLY' as const;
export const PASSPORT_REVIEW_FOOTNOTE = 'CONFIGURATION_ONLY' as const;
export const INTEGRITY_MEANING_VERIFIED =
  "PackProof's evidence records and integrity bindings associated with this Passport successfully verify.";
export const INTEGRITY_MEANING_LIMITED =
  "PackProof's evidence records and integrity bindings associated with this Passport successfully verify, with recorded limitations.";
export const PASSPORT_PAGE_ONE_FOOTER =
  'Review the evidence and provenance on the following pages. PackProof does not determine fraud, fault, or liability.';
export const COMPARISON_FOOTNOTE_COPY =
  'Comparisons report relationships between recorded data. They do not establish product authenticity, legal ownership, custody or liability.';
export const REVIEW_CONTEXT_FOOTNOTE_COPY =
  'Relevance categories reflect the configured receiving-party workflow. PackProof does not determine evidentiary weight or dispute outcome.';
export const SHIPPING_TRACKER_INTERPRETATION = 'OPEN_SOURCE_TRACKING_NUMBER_VALIDATION_NOT_CARRIER_CUSTODY' as const;
export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const PASSPORT_DISPLAY_ID_PATTERN = /^PP-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
export const PASSPORT_RESOURCE_ID_PATTERN = /^ppt_[a-f0-9]{40}$/;
export const PASSPORT_SNAPSHOT_ID_PATTERN = /^pps_[a-f0-9]{40}$/;

export const provenanceClasses = [
  'SOURCE_ASSERTION',
  'PARTICIPANT_ASSERTION',
  'PACKPROOF_OBSERVATION',
  'THIRD_PARTY_ASSERTION',
  'INTEGRITY_RESULT',
  'DERIVED_COMPARISON',
] as const;
export type ProvenanceClass = (typeof provenanceClasses)[number];

export const trustClasses = [
  'MERCHANT_SERVER_ATTESTED',
  'PLATFORM_API_ATTESTED',
  'USER_PROVIDED_COMMERCE_ARTIFACT',
  'PAGE_DECLARED',
  'PACKPROOF_CAPTURE',
  'PACKPROOF_SERVICE',
] as const;
export type TrustClass = (typeof trustClasses)[number];

export const integrityStatuses = ['VERIFIED', 'RECORDED', 'LIMITED', 'FAILED'] as const;
export type IntegrityStatus = (typeof integrityStatuses)[number];

export const comparisonResults = [
  'SAME',
  'DIFFERENT',
  'CONSISTENT_WITH_DECLARED',
  'NOT_CONSISTENT_WITH_DECLARED',
  'NOT_COMPARED',
] as const;
export type ComparisonResult = (typeof comparisonResults)[number];

export const inventoryStates = ['AVAILABLE', 'NOT_AVAILABLE', 'NOT_APPLICABLE', 'REVIEW_REQUIRED'] as const;
export type InventoryState = (typeof inventoryStates)[number];

export const inventoryCategories = [
  'COMMERCE_ORDER_RECORD',
  'ITEM_IDENTIFIER_EVIDENCE',
  'CONDITION_EVIDENCE',
  'PACKING_CAPTURE',
  'PACKAGE_SEALING',
  'SHIPPING_LABEL_EVIDENCE',
  'TRACKING_ASSOCIATION',
  'WEIGHT_OBSERVATION',
  'CARRIER_ACCEPTANCE',
  'DELIVERY_EVIDENCE',
  'RECEIVER_CAPTURE',
  'RETURN_EVIDENCE',
  'REFUND_EVIDENCE',
] as const;
export type InventoryCategory = (typeof inventoryCategories)[number];

export type PassportFact<T> = {
  value: T;
  provenanceClass: ProvenanceClass;
  assertingSource: string | null;
  trustClass: TrustClass | null;
  recordedAt: string | null;
  sourceRecordId: string | null;
  sourceReference: string | null;
  digestSha256: string | null;
};

export type PassportIdentity = {
  passportId: string;
  displayId: string;
  schemaVersion: 1;
  rendererCompatibility: 'PASSPORT_WEB_V1';
  transactionId: string;
  state: 'CURRENT';
  issuedAt: string;
  sourceUpdatedAt: string;
  merchantPlatform: string | null;
  externalOrderId: string | null;
  verificationUrl: string;
  qrPayload: string;
};

export type PassportIntegrity = {
  banner: 'AUTHENTIC_PACKPROOF' | 'PACKPROOF_RECORD_WITH_LIMITATIONS';
  summary: 'PackProof record integrity verified' | 'PackProof record integrity verified with recorded limitations';
  meaning: string;
  criteria: {
    passportRecord: IntegrityStatus;
    evidenceManifests: IntegrityStatus;
    evidenceFileDigests: IntegrityStatus;
    bundleBindings: IntegrityStatus;
    finalization: IntegrityStatus;
    provenance: IntegrityStatus;
    evidenceLineage: IntegrityStatus;
  };
  manifestAuthentication: {
    type: 'SERVICE_MAC' | 'LEGACY_SERVICE_MAC';
    algorithm: 'HMAC-SHA256' | null;
    verificationScope: 'PACKPROOF_SERVICE_ONLY';
    keyId: string | null;
    publiclyVerifiable: false;
  };
  canonicalizationProfile: 'PACKPROOF_JCS_1';
  bundleBindingProfile: 'PACKPROOF_EVIDENCE_BUNDLE_V2' | 'LEGACY_V1';
};

export type PassportDestination = {
  representation: 'REDACTED' | 'LOCALITY' | 'FULL';
  locality: string | null;
  postalCodePrefix: string | null;
  fullAddress: string | null;
};

export type PassportTransaction = {
  commerceContextId: string | null;
  platform: PassportFact<string | null>;
  externalOrderId: PassportFact<string | null>;
  transactionDate: PassportFact<string | null>;
  amount: PassportFact<{ currency: string; minorUnits: number } | null>;
  sellerReference: PassportFact<string | null>;
  destination: PassportFact<PassportDestination | null>;
  itemCount: PassportFact<number | null>;
  sourceTrustClass: 'MERCHANT_SERVER_ATTESTED' | 'PLATFORM_API_ATTESTED' | 'USER_PROVIDED_COMMERCE_ARTIFACT' | 'PAGE_DECLARED' | null;
  importedAt: string | null;
  canonicalPayloadSha256: string | null;
};

export type PassportExpectedItem = {
  title: PassportFact<string | null>;
  sku: PassportFact<string | null>;
  gtin: PassportFact<string | null>;
  upc: PassportFact<string | null>;
  variant: PassportFact<string | null>;
  quantity: PassportFact<number | null>;
  declaredCondition: PassportFact<string | null>;
  serialExpected: PassportFact<string | null>;
  merchantItemId: PassportFact<string | null>;
  listingReference: PassportFact<string | null>;
};

export type PassportObservationKind =
  | 'ITEM_CAPTURED'
  | 'BARCODE_OBSERVED'
  | 'SERIAL_OBSERVED'
  | 'QUANTITY_OBSERVED'
  | 'CONDITION_IMAGERY'
  | 'PACKING_CAPTURE'
  | 'PACKAGE_INTERIOR'
  | 'SEAL_EVENT'
  | 'SHIPPING_LABEL'
  | 'TRACKING_OBSERVED'
  | 'WEIGHT'
  | 'APP_DEVICE_CONTEXT';

export type PassportObservation = {
  kind: PassportObservationKind;
  result: PassportFact<string | boolean | number | null>;
  artifactId: string | null;
  evidenceSessionId: string | null;
  frameReference: string | null;
  capturedAt: string | null;
};

export type PassportComparison = {
  attribute: 'UPC' | 'GTIN' | 'SKU' | 'SERIAL' | 'QUANTITY' | 'VARIANT' | 'TRACKING' | 'TITLE';
  expected: string | null;
  observed: string | null;
  result: ComparisonResult;
  method: 'EXACT_NORMALIZED' | 'DECLARED_INTERPRETATION' | 'NOT_COMPARABLE';
  footnote: 'RELATIONSHIP_ONLY';
};

export type PassportItem = {
  index: number;
  expected: PassportExpectedItem;
  observations: PassportObservation[];
  comparisons: PassportComparison[];
};

export type PassportFulfillment = {
  captureSessionId: string | null;
  packingArtifactId: string | null;
  sealArtifactId: string | null;
  labelArtifactId: string | null;
  trackingObserved: PassportFact<string | null>;
  shippingTracker: PassportFact<{
    lookupStatus: 'DATASET_VALIDATED' | 'UNRECOGNIZED' | 'LOOKUP_INCOMPLETE';
    courierCode: string | null;
    observationSha256: string | null;
    hashMatched: boolean | null;
    interpretation: typeof SHIPPING_TRACKER_INTERPRETATION;
  } | null>;
};

export type PassportShipment = {
  carrier: PassportFact<string | null>;
  trackingSupplied: PassportFact<string | null>;
  trackingObserved: PassportFact<string | null>;
  trackingThirdParty: PassportFact<string | null>;
  labelObservedByPackProof: boolean;
  associatedAt: string | null;
  packingEvidenceId: string | null;
  sealEvidenceId: string | null;
};

export type PassportDelivery = {
  carrier: PassportFact<string | null>;
  trackingNumber: PassportFact<string | null>;
  receivedAt: PassportFact<string | null>;
  arrivalArtifactId: string | null;
  signatureAvailable: false;
  deliveryPhotoAvailable: boolean;
};

export type PassportReceiver = {
  arrivalArtifactId: string | null;
  unboxingArtifactId: string | null;
  observedAt: string | null;
};

export type PassportReturn = {
  returnPassportId: string;
  status: string;
  reason: string | null;
  packingArtifactId: string | null;
  sealArtifactId: string | null;
  trackingSupplied: PassportFact<string | null>;
};

export type PassportInventoryEntry = {
  category: InventoryCategory;
  state: InventoryState;
  artifactIds: string[];
};

export type PassportArtifact = {
  artifactId: string;
  type: string;
  source: 'PACKPROOF_CAPTURE' | 'ENTERPRISE_EDGE' | 'EXTERNAL_DECLARED' | 'UNKNOWN';
  capturedAt: string | null;
  finalizedAt: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  manifestSha256: string | null;
  evidenceBundleSha256: string | null;
  finalization: 'FINALIZED' | 'QUARANTINED' | 'FAILED' | 'UPLOADED' | 'RESERVED';
  evidenceSessionId: string | null;
  shippingTracker: Record<string, unknown> | null;
};

export type PassportTimelineEvent = {
  eventId: string;
  occurredAt: string;
  source: string;
  provenanceClass: ProvenanceClass;
  title: string;
  evidenceReference: string | null;
};

export type PassportReviewContext = {
  receivingFramework: string;
  disputeCategory: string;
  relevance: Array<{ category: string; inventoryState: InventoryState }>;
  footnote: 'CONFIGURATION_ONLY';
};

export type PassportLimitations = {
  physicalCorrespondence: 'NOT_AVAILABLE';
  businessLegalRelevance: 'REVIEW_REQUIRED';
  doesNotAuthenticateItem: true;
  doesNotProveCustody: true;
  doesNotDecideFraudOrFault: true;
  doesNotGuaranteeDisputeOutcome: true;
  absenceOfEvidenceDoesNotAffectAuthenticity: true;
  noEvidentiaryWeightScore: true;
  presentationExportIsNotSource: true;
  manifestAuthenticationScope: 'PACKPROOF_SERVICE_ONLY';
  shippingTrackerInterpretation: typeof SHIPPING_TRACKER_INTERPRETATION;
  humanReviewDisclaimer: string;
};

export type PackProofPassportV1 = {
  object: typeof PASSPORT_OBJECT;
  schemaVersion: 1;
  identity: PassportIdentity;
  integrity: PassportIntegrity;
  transaction: PassportTransaction;
  items: PassportItem[];
  fulfillment: PassportFulfillment;
  shipment: PassportShipment | null;
  delivery: PassportDelivery | null;
  receiver: PassportReceiver | null;
  returns: PassportReturn[];
  evidenceInventory: PassportInventoryEntry[];
  artifacts: PassportArtifact[];
  timeline: PassportTimelineEvent[];
  reviewContext: PassportReviewContext | null;
  provenance: PassportProvenanceFact[];
  limitations: PassportLimitations;
  createdAt: string;
  updatedAt: string;
};

export type PassportProvenanceFact = PassportFact<string | number | boolean | null> & {
  field: string;
};

export type PackProofPassportSnapshotV1 = {
  object: typeof PASSPORT_SNAPSHOT_OBJECT;
  schemaVersion: 1;
  snapshotId: string;
  passportId: string;
  transactionId: string;
  snapshotVersion: number;
  passport: PackProofPassportV1;
  canonicalPayloadSha256: string;
  rendererVersion: string;
  generatedAt: string;
};

export type PackProofPassportExportV1 = {
  object: typeof PASSPORT_EXPORT_OBJECT;
  schemaVersion: 1;
  snapshotId: string;
  format: 'PDF';
  presentationOnly: true;
  downloadUrl: string | null;
  downloadUrlExpiresAt: string | null;
  fileSha256: string;
  rendererVersion: string;
};

export type PassportEligibilityFailure = {
  code: 'TRANSACTION_MISSING' | 'NO_COMMERCE_SOURCE' | 'UNATTRIBUTED_COMMERCIAL_FACT' | 'NO_FINALIZED_MANIFEST_ARTIFACT';
  message: string;
};

export type PassportArtifactInput = {
  id: string;
  transactionId: string;
  type: string;
  finalization: PassportArtifact['finalization'];
  contentType: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  manifestSha256: string | null;
  evidenceBundleSha256: string | null;
  captureSessionId: string | null;
  evidenceSessionId: string | null;
  clientCreatedAt: string | null;
  finalizedAt: string | null;
  createdAt: string;
  scannedTrackingNumber: string | null;
  shippingTracker: {
    lookupStatus: 'DATASET_VALIDATED' | 'UNRECOGNIZED' | 'LOOKUP_INCOMPLETE';
    courierCode: string | null;
    observationSha256: string;
    hashMatched: boolean | null;
    interpretation?: string;
    stillSha256?: string | null;
  } | null;
  carrierTrackingMatchStatus: string | null;
  acquisitionClass: string | null;
  appDeviceContextStatus: string | null;
  returnPassportId: string | null;
  clientHashMatched: boolean | null;
  bundleBindingProfile: string | null;
  manifestAuthentication: {
    type: string | null;
    algorithm: string | null;
    keyId: string | null;
    verificationScope: string | null;
  } | null;
};

export type PassportCommerceInput = {
  id: string;
  platform: string | null;
  trustLevel: CommerceTrustLevel | null;
  assertingSource: string | null;
  externalOrderId: string | null;
  externalSellerId: string | null;
  capturedAt: string | null;
  canonicalPayloadSha256: string | null;
  title: string | null;
  sku: string | null;
  gtin: string | null;
  upc: string | null;
  serialNumber: string | null;
  quantity: number | null;
  amount: { currency: string; minorUnits: number } | null;
  variant: string | null;
  listingReference: string | null;
  merchantItemId: string | null;
  declaredCondition: string | null;
  declaredWeightGrams: number | null;
};

export type PassportTransactionInput = {
  id: string;
  merchantReference: string | null;
  title: string;
  amount: { currency: string; minorUnits: number } | null;
  termsSaleType: string | null;
  commerceContextId: string | null;
  sourcePlatform: string | null;
  sourceType: string | null;
  sourceTrustLevel?: CommerceTrustLevel | null;
  externalOrderId: string | null;
  externalSellerId: string | null;
  declaredWeightGrams: number | null;
  sourceTrackingNumber: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PassportShipmentInput = {
  carrier: string | null;
  trackingNumber: string | null;
  packingEvidenceId: string | null;
  sealEvidenceId: string | null;
  shippedAt: string | null;
  createdAt: string | null;
};

export type PassportDeliveryInput = {
  carrier: string | null;
  trackingNumber: string | null;
  arrivalEvidenceId: string | null;
  receivedAt: string | null;
};

export type PassportReturnInput = {
  id: string;
  status: string;
  reason: string | null;
  packingEvidenceId: string | null;
  sealEvidenceId: string | null;
  shippingTrackingNumber: string | null;
  createdAt: string;
};

export type PassportTimelineInput = {
  id: string;
  type: string;
  summary: string;
  occurredAt: string;
};

export type PassportReviewQuery = {
  framework: string;
  category: string;
};

export type PassportAggregatorInput = {
  identity: {
    passportId: string;
    displayId: string;
    issuedAt: string;
    verificationBaseUrl: string;
  };
  transaction: PassportTransactionInput;
  commerce: PassportCommerceInput | null;
  artifacts: readonly PassportArtifactInput[];
  shipment: PassportShipmentInput | null;
  delivery: PassportDeliveryInput | null;
  returns: readonly PassportReturnInput[];
  timeline: readonly PassportTimelineInput[];
  reviewQuery: PassportReviewQuery | null;
  humanReviewDisclaimer: string;
  now: string;
};

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function issuePassportResourceId(transactionId: string): string {
  return `ppt_${sha256Hex(`${PASSPORT_ID_HASH_PREFIX}${transactionId}`).slice(0, 40)}`;
}

export function displayIdFromPassportId(passportId: string): string {
  const digest = createHash('sha256').update(`${PASSPORT_DISPLAY_HASH_PREFIX}${passportId}`, 'utf8').digest();
  let bits = 0n;
  for (let index = 0; index < 8; index += 1) bits = (bits << 8n) | BigInt(digest[index]);
  bits >>= 4n;
  let encoded = '';
  for (let index = 0; index < 12; index += 1) {
    const shift = BigInt((11 - index) * 5);
    encoded += CROCKFORD[Number((bits >> shift) & 31n)];
  }
  return `PP-${encoded.slice(0, 4)}-${encoded.slice(4, 8)}-${encoded.slice(8, 12)}`;
}

export function issuePassportIdentity(transactionId: string): { passportId: string; displayId: string } {
  const passportId = issuePassportResourceId(transactionId);
  return { passportId, displayId: displayIdFromPassportId(passportId) };
}

export function issuePassportSnapshotId(passportId: string, snapshotVersion: number): string {
  return `pps_${sha256Hex(`packproof-passport-snapshot-v1\n${passportId}\n${snapshotVersion}`).slice(0, 40)}`;
}

export function normalizePassportDisplayId(value: string): string {
  return value.trim().toUpperCase();
}

export function isPassportResourceId(value: string): boolean {
  return PASSPORT_RESOURCE_ID_PATTERN.test(value);
}

export function isPassportDisplayId(value: string): boolean {
  return PASSPORT_DISPLAY_ID_PATTERN.test(normalizePassportDisplayId(value));
}

export function isPassportSnapshotId(value: string): boolean {
  return PASSPORT_SNAPSHOT_ID_PATTERN.test(value);
}

export function normalizeIdentifier(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return normalized || null;
}

export function fact<T>(
  value: T,
  provenanceClass: ProvenanceClass,
  extras: Partial<Omit<PassportFact<T>, 'value' | 'provenanceClass'>> = {},
): PassportFact<T> {
  return {
    value,
    provenanceClass,
    assertingSource: extras.assertingSource ?? null,
    trustClass: extras.trustClass ?? null,
    recordedAt: extras.recordedAt ?? null,
    sourceRecordId: extras.sourceRecordId ?? null,
    sourceReference: extras.sourceReference ?? null,
    digestSha256: extras.digestSha256 ?? null,
  };
}

export function compareExactIdentifier(expected: string | null, observed: string | null): PassportComparison['result'] {
  const left = normalizeIdentifier(expected);
  const right = normalizeIdentifier(observed);
  if (!left || !right) return 'NOT_COMPARED';
  return left === right ? 'SAME' : 'DIFFERENT';
}

export function compareIdentifierAttribute(
  attribute: Extract<PassportComparison['attribute'], 'UPC' | 'GTIN' | 'SKU' | 'SERIAL' | 'TRACKING'>,
  expected: string | null,
  observed: string | null,
): PassportComparison {
  return {
    attribute,
    expected,
    observed,
    result: compareExactIdentifier(expected, observed),
    method: expected && observed ? 'EXACT_NORMALIZED' : 'NOT_COMPARABLE',
    footnote: PASSPORT_COMPARISON_FOOTNOTE,
  };
}

function interpretedComparison(
  attribute: Extract<PassportComparison['attribute'], 'QUANTITY' | 'VARIANT' | 'TITLE'>,
  expected: string | null,
  observed: string | null,
): PassportComparison {
  return {
    attribute,
    expected,
    observed,
    result: 'NOT_COMPARED',
    method: 'NOT_COMPARABLE',
    footnote: PASSPORT_COMPARISON_FOOTNOTE,
  };
}

const OUTBOUND_PACKING = new Set(['PACKING_VIDEO', 'STATION_PACKING_VIDEO']);
const OUTBOUND_SEAL = new Set(['SHIPPING_LABEL', 'STATION_SEAL_REFERENCE']);
const ITEM_CAPTURE = new Set(['ITEM_PHOTO', 'PACKING_VIDEO', 'STATION_PACKING_VIDEO']);
const CONDITION = new Set(['CONDITION_PHOTO', 'RETURN_CONDITION_PHOTO']);
const IDENTIFIER = new Set(['IDENTIFIER_PHOTO']);
const ARRIVAL = new Set(['DELIVERY_PHOTO']);
const UNBOXING = new Set(['UNBOXING_VIDEO']);
const RETURN_TYPES = new Set(['RETURN_PACKING_VIDEO', 'RETURN_SHIPPING_LABEL', 'RETURN_UNBOXING_VIDEO', 'RETURN_CONDITION_PHOTO']);
const STATION_TYPES = new Set(['STATION_PACKING_VIDEO', 'STATION_SEAL_REFERENCE']);

function isFinalized(artifact: PassportArtifactInput): boolean {
  return artifact.finalization === 'FINALIZED';
}

function isQuarantined(artifact: PassportArtifactInput): boolean {
  return artifact.finalization === 'QUARANTINED';
}

function finalizedWithManifest(artifact: PassportArtifactInput): boolean {
  return isFinalized(artifact) && Boolean(artifact.sha256) && Boolean(artifact.manifestSha256);
}

export function isAuthoritativeCommerceTrust(
  trust: PassportCommerceInput['trustLevel'] | PassportTransactionInput['sourceTrustLevel'] | null | undefined,
): boolean {
  return isAuthoritativeCommerceTrustLevel(trust);
}

export function selectPassportOrderCommerce(commerce: PassportCommerceInput | null | undefined): PassportCommerceInput | null {
  if (!commerce || !isAuthoritativeCommerceTrust(commerce.trustLevel)) return null;
  return commerce;
}

export function selectPassportDisplayCommerce(commerce: PassportCommerceInput | null | undefined): PassportCommerceInput | null {
  if (!commerce || !commerceContextMayAppearAsPassportOrderContext(commerce.trustLevel)) return null;
  return commerce;
}

export function canAttributePassportOrderToTransaction(transaction: Pick<PassportTransactionInput, 'sourceTrustLevel' | 'externalOrderId' | 'merchantReference' | 'sourcePlatform'>): boolean {
  if (transaction.sourceTrustLevel === 'PAGE_DECLARED' && !transaction.externalOrderId) return false;
  return Boolean(transaction.externalOrderId || transaction.merchantReference || transaction.sourcePlatform);
}

export function passportHasAuthoritativeOrderSource(input: {
  merchantReference: string | null;
  commerceContextId: string | null;
  commerceTrustLevel?: PassportCommerceInput['trustLevel'];
  sourceTrustLevel?: PassportTransactionInput['sourceTrustLevel'];
  externalOrderId: string | null;
}): boolean {
  if (input.commerceContextId && isAuthoritativeCommerceTrust(input.commerceTrustLevel ?? null)) return true;
  if (input.externalOrderId) return true;
  if (input.sourceTrustLevel === 'PAGE_DECLARED' || isUserProvidedCommerceArtifact(input.sourceTrustLevel ?? input.commerceTrustLevel ?? null)) return false;
  return Boolean(input.merchantReference);
}

export function passportHasIdentifiedCommerceSource(input: {
  merchantReference: string | null;
  commerceContextId: string | null;
  commerceTrustLevel?: PassportCommerceInput['trustLevel'];
  sourceTrustLevel?: PassportTransactionInput['sourceTrustLevel'];
  externalOrderId: string | null;
}): boolean {
  if (input.commerceContextId && isAuthoritativeCommerceTrust(input.commerceTrustLevel ?? null)) return true;
  if (input.commerceContextId && isUserProvidedCommerceArtifact(input.commerceTrustLevel ?? null)) return true;
  if (input.externalOrderId) return true;
  if (input.sourceTrustLevel === 'PAGE_DECLARED') return false;
  return Boolean(input.merchantReference);
}

export function normalizePassportReviewQuery(query: PassportReviewQuery | null | undefined): PassportReviewQuery | null {
  if (!query) return null;
  const framework = query.framework.trim().toUpperCase();
  const category = query.category.trim().toUpperCase();
  if (!framework && !category) return null;
  return {
    framework: framework || 'GENERIC',
    category: category || 'DEFAULT',
  };
}

export function passportSnapshotFingerprintPayload(
  transactionId: string,
  reviewQuery: PassportReviewQuery | null | undefined,
): { transactionId: string; reviewQuery: PassportReviewQuery | null } {
  return { transactionId, reviewQuery: normalizePassportReviewQuery(reviewQuery ?? null) };
}

export function evaluatePassportEligibility(input: {
  transactionExists: boolean;
  merchantReference: string | null;
  commerceContextId: string | null;
  commerceTrustLevel?: PassportCommerceInput['trustLevel'];
  sourceTrustLevel?: PassportTransactionInput['sourceTrustLevel'];
  externalOrderId: string | null;
  artifacts: readonly PassportArtifactInput[];
  displayedUnattributedFacts: number;
}): { ok: true } | { ok: false; failures: PassportEligibilityFailure[] } {
  const failures: PassportEligibilityFailure[] = [];
  if (!input.transactionExists) {
    failures.push({ code: 'TRANSACTION_MISSING', message: 'A tenant-authorized PackProof transaction is required.' });
  }
  if (!passportHasIdentifiedCommerceSource(input)) {
    failures.push({
      code: 'NO_COMMERCE_SOURCE',
      message: 'An attested commerce context, user-provided commerce artifact, Connect external order identifier, or merchant reference is required. PAGE_DECLARED listing data remains draft lineage only.',
    });
  }
  if (input.displayedUnattributedFacts > 0) {
    failures.push({
      code: 'UNATTRIBUTED_COMMERCIAL_FACT',
      message: 'Imported commercial facts that are displayed must carry source attribution.',
    });
  }
  if (!input.artifacts.some(finalizedWithManifest)) {
    failures.push({
      code: 'NO_FINALIZED_MANIFEST_ARTIFACT',
      message: 'At least one FINALIZED evidence artifact with sha256 and manifestSha256 is required.',
    });
  }
  return failures.length ? { ok: false, failures } : { ok: true };
}

function artifactSource(artifact: PassportArtifactInput): PassportArtifact['source'] {
  if (artifact.acquisitionClass === 'ENTERPRISE_EDGE' || STATION_TYPES.has(artifact.type)) return 'ENTERPRISE_EDGE';
  if (artifact.acquisitionClass === 'EXTERNAL_DECLARED') return 'EXTERNAL_DECLARED';
  if (artifact.sha256 || artifact.finalization === 'FINALIZED' || artifact.finalization === 'QUARANTINED') return 'PACKPROOF_CAPTURE';
  return 'UNKNOWN';
}

function firstOf<T>(items: readonly T[], predicate: (item: T) => boolean): T | undefined {
  return items.find(predicate);
}

function idsOf(artifacts: readonly PassportArtifactInput[], predicate: (item: PassportArtifactInput) => boolean): string[] {
  return artifacts.filter(predicate).map((item) => item.id);
}

function latestIso(values: readonly (string | null | undefined)[]): string {
  const times = values.filter((value): value is string => Boolean(value)).sort();
  return times.at(-1) ?? new Date(0).toISOString();
}

function observation(
  kind: PassportObservationKind,
  value: string | boolean | number | null,
  artifact: PassportArtifactInput | null,
  extras: Partial<PassportFact<string | boolean | number | null>> = {},
): PassportObservation {
  return {
    kind,
    result: fact(value, 'PACKPROOF_OBSERVATION', {
      assertingSource: 'PACKPROOF_CAPTURE',
      trustClass: 'PACKPROOF_CAPTURE',
      recordedAt: artifact?.finalizedAt ?? artifact?.clientCreatedAt ?? artifact?.createdAt ?? null,
      sourceRecordId: artifact?.id ?? null,
      sourceReference: artifact?.id ?? null,
      ...extras,
    }),
    artifactId: artifact?.id ?? null,
    evidenceSessionId: artifact?.evidenceSessionId ?? artifact?.captureSessionId ?? null,
    frameReference: null,
    capturedAt: artifact?.clientCreatedAt ?? artifact?.finalizedAt ?? artifact?.createdAt ?? null,
  };
}

function orderContextSelection(transaction: PassportTransactionInput, commerce: PassportCommerceInput | null) {
  const orderCommerce = selectPassportDisplayCommerce(commerce);
  const useTransactionOrder = canAttributePassportOrderToTransaction({
    sourceTrustLevel: transaction.sourceTrustLevel ?? null,
    externalOrderId: transaction.externalOrderId,
    merchantReference: transaction.merchantReference,
    sourcePlatform: transaction.sourcePlatform,
  });
  const omittedPageDeclared = Boolean(commerce && commerce.trustLevel === 'PAGE_DECLARED' && !selectPassportOrderCommerce(commerce));
  return {
    orderCommerce,
    omittedPageDeclared,
    useTransactionOrder,
    platformValue: orderCommerce?.platform ?? (useTransactionOrder ? transaction.sourcePlatform : null),
    orderValue: orderCommerce?.externalOrderId ?? (useTransactionOrder ? transaction.externalOrderId : null),
    amountValue: orderCommerce?.amount ?? (useTransactionOrder ? transaction.amount : null),
    sellerValue: orderCommerce?.externalSellerId ?? (useTransactionOrder ? transaction.externalSellerId : null),
    titleValue: orderCommerce?.title ?? (useTransactionOrder ? transaction.title : null),
    sku: orderCommerce?.sku ?? null,
    gtin: orderCommerce?.gtin ?? null,
    upc: orderCommerce?.upc ?? null,
    variant: orderCommerce?.variant ?? null,
    quantity: orderCommerce?.quantity ?? null,
    declaredCondition: orderCommerce?.declaredCondition ?? null,
    serialNumber: orderCommerce?.serialNumber ?? null,
    merchantItemId: orderCommerce?.merchantItemId ?? null,
    listingReference: orderCommerce?.listingReference ?? null,
    declaredWeightGrams: orderCommerce?.declaredWeightGrams ?? (useTransactionOrder ? transaction.declaredWeightGrams : null),
  };
}

function sourceFact<T>(
  value: T,
  commerce: PassportCommerceInput | null,
  transaction: PassportTransactionInput,
): PassportFact<T> {
  if (commerce) {
    return fact(value, 'SOURCE_ASSERTION', {
    assertingSource: commerce.assertingSource ?? (commerce.trustLevel === 'PLATFORM_API_ATTESTED' ? 'PLATFORM_API' : commerce.trustLevel === 'USER_PROVIDED_COMMERCE_ARTIFACT' ? 'EMAIL_RECEIPT' : commerce.trustLevel === 'PAGE_DECLARED' ? 'MERCHANT_PAGE_STRUCTURED_DATA' : 'MERCHANT_API'),
      trustClass: commerce.trustLevel,
      recordedAt: commerce.capturedAt,
      sourceRecordId: commerce.id,
      sourceReference: commerce.externalOrderId,
      digestSha256: commerce.canonicalPayloadSha256,
    });
  }
  if (canAttributePassportOrderToTransaction(transaction) && (transaction.externalOrderId || transaction.sourcePlatform)) {
    return fact(value, 'SOURCE_ASSERTION', {
      assertingSource: 'MERCHANT_API',
      trustClass: 'MERCHANT_SERVER_ATTESTED',
      recordedAt: transaction.createdAt,
      sourceRecordId: transaction.id,
      sourceReference: transaction.externalOrderId,
    });
  }
  if (canAttributePassportOrderToTransaction(transaction) && transaction.merchantReference) {
    return fact(value, 'SOURCE_ASSERTION', {
      assertingSource: 'MERCHANT_API',
      trustClass: 'MERCHANT_SERVER_ATTESTED',
      recordedAt: transaction.createdAt,
      sourceRecordId: transaction.id,
      sourceReference: transaction.merchantReference,
    });
  }
  return fact(value, 'SOURCE_ASSERTION', {
    assertingSource: null,
    trustClass: null,
    recordedAt: null,
    sourceRecordId: null,
    sourceReference: null,
  });
}

export function countDisplayedUnattributedCommercialFacts(
  transaction: PassportTransactionInput,
  commerce: PassportCommerceInput | null,
): number {
  const selected = orderContextSelection(transaction, commerce);
  return [
    sourceFact(selected.platformValue ?? null, selected.orderCommerce, transaction),
    sourceFact(selected.orderValue ?? null, selected.orderCommerce, transaction),
    sourceFact(selected.amountValue, selected.orderCommerce, transaction),
    sourceFact(selected.sellerValue ?? null, selected.orderCommerce, transaction),
    sourceFact(selected.titleValue ?? null, selected.orderCommerce, transaction),
    sourceFact(selected.sku, selected.orderCommerce, transaction),
    sourceFact(selected.gtin, selected.orderCommerce, transaction),
    sourceFact(selected.upc, selected.orderCommerce, transaction),
    sourceFact(selected.serialNumber, selected.orderCommerce, transaction),
  ].filter((item) => item.value !== null && item.value !== undefined && !item.assertingSource).length;
}

function trackerValue(artifact: PassportArtifactInput | undefined): PassportFulfillment['shippingTracker']['value'] {
  if (!artifact?.shippingTracker) return null;
  return {
    lookupStatus: artifact.shippingTracker.lookupStatus,
    courierCode: artifact.shippingTracker.courierCode,
    observationSha256: artifact.shippingTracker.observationSha256,
    hashMatched: artifact.shippingTracker.hashMatched,
    interpretation: SHIPPING_TRACKER_INTERPRETATION,
  };
}

export function inventoryStateFor(
  category: InventoryCategory,
  input: {
    hasCommerceSource: boolean;
    unattributed: boolean;
    identifierArtifacts: readonly PassportArtifactInput[];
    conditionArtifacts: readonly PassportArtifactInput[];
    packingArtifacts: readonly PassportArtifactInput[];
    sealArtifacts: readonly PassportArtifactInput[];
    labelArtifacts: readonly PassportArtifactInput[];
    trackingObserved: boolean;
    trackingSupplied: boolean;
    trackingMismatch: boolean;
    shippingTerms: boolean;
    deliveryArtifacts: readonly PassportArtifactInput[];
    receiverArtifacts: readonly PassportArtifactInput[];
    returnArtifacts: readonly PassportArtifactInput[];
    hasReturn: boolean;
    shipped: boolean;
  },
): { state: InventoryState; artifactIds: string[] } {
  switch (category) {
    case 'COMMERCE_ORDER_RECORD':
      if (input.unattributed) return { state: 'REVIEW_REQUIRED', artifactIds: [] };
      return { state: input.hasCommerceSource ? 'AVAILABLE' : 'NOT_AVAILABLE', artifactIds: [] };
    case 'ITEM_IDENTIFIER_EVIDENCE': {
      const quarantined = input.identifierArtifacts.filter(isQuarantined);
      if (quarantined.length && !input.identifierArtifacts.some(isFinalized)) {
        return { state: 'REVIEW_REQUIRED', artifactIds: idsOf(input.identifierArtifacts, () => true) };
      }
      const ready = input.identifierArtifacts.filter(isFinalized);
      return ready.length
        ? { state: 'AVAILABLE', artifactIds: ready.map((item) => item.id) }
        : { state: 'NOT_AVAILABLE', artifactIds: [] };
    }
    case 'CONDITION_EVIDENCE': {
      const ready = input.conditionArtifacts.filter(isFinalized);
      return ready.length
        ? { state: 'AVAILABLE', artifactIds: ready.map((item) => item.id) }
        : { state: 'NOT_AVAILABLE', artifactIds: [] };
    }
    case 'PACKING_CAPTURE': {
      const mismatch = input.packingArtifacts.filter((item) => item.clientHashMatched === false);
      if (mismatch.length) return { state: 'REVIEW_REQUIRED', artifactIds: mismatch.map((item) => item.id) };
      const ready = input.packingArtifacts.filter(isFinalized);
      return ready.length
        ? { state: 'AVAILABLE', artifactIds: ready.map((item) => item.id) }
        : { state: 'NOT_AVAILABLE', artifactIds: [] };
    }
    case 'PACKAGE_SEALING': {
      const ready = input.sealArtifacts.filter(isFinalized);
      return ready.length
        ? { state: 'AVAILABLE', artifactIds: ready.map((item) => item.id) }
        : { state: 'NOT_AVAILABLE', artifactIds: [] };
    }
    case 'SHIPPING_LABEL_EVIDENCE': {
      const ready = input.labelArtifacts.filter(isFinalized);
      return ready.length
        ? { state: 'AVAILABLE', artifactIds: ready.map((item) => item.id) }
        : { state: 'NOT_AVAILABLE', artifactIds: [] };
    }
    case 'TRACKING_ASSOCIATION':
      if (!input.shippingTerms) return { state: 'NOT_APPLICABLE', artifactIds: [] };
      if (input.trackingMismatch) return { state: 'REVIEW_REQUIRED', artifactIds: [] };
      return {
        state: input.trackingObserved || input.trackingSupplied ? 'AVAILABLE' : 'NOT_AVAILABLE',
        artifactIds: [],
      };
    case 'WEIGHT_OBSERVATION':
      return { state: 'NOT_AVAILABLE', artifactIds: [] };
    case 'CARRIER_ACCEPTANCE':
      return { state: 'NOT_AVAILABLE', artifactIds: [] };
    case 'DELIVERY_EVIDENCE': {
      const ready = input.deliveryArtifacts.filter(isFinalized);
      if (ready.length) return { state: 'AVAILABLE', artifactIds: ready.map((item) => item.id) };
      return { state: input.shipped ? 'NOT_AVAILABLE' : 'NOT_APPLICABLE', artifactIds: [] };
    }
    case 'RECEIVER_CAPTURE': {
      const ready = input.receiverArtifacts.filter(isFinalized);
      return ready.length
        ? { state: 'AVAILABLE', artifactIds: ready.map((item) => item.id) }
        : { state: 'NOT_AVAILABLE', artifactIds: [] };
    }
    case 'RETURN_EVIDENCE': {
      if (!input.hasReturn) return { state: 'NOT_APPLICABLE', artifactIds: [] };
      const ready = input.returnArtifacts.filter(isFinalized);
      return ready.length
        ? { state: 'AVAILABLE', artifactIds: ready.map((item) => item.id) }
        : { state: 'NOT_AVAILABLE', artifactIds: [] };
    }
    case 'REFUND_EVIDENCE':
      return { state: 'NOT_APPLICABLE', artifactIds: [] };
    default:
      return { state: 'NOT_AVAILABLE', artifactIds: [] };
  }
}

const REVIEW_RELEVANCE: Record<string, Record<string, InventoryCategory[]>> = {
  VISA: {
    MERCHANDISE_NOT_RECEIVED: [
      'PACKING_CAPTURE', 'PACKAGE_SEALING', 'SHIPPING_LABEL_EVIDENCE', 'TRACKING_ASSOCIATION', 'CARRIER_ACCEPTANCE', 'DELIVERY_EVIDENCE',
    ],
    NOT_AS_DESCRIBED: ['COMMERCE_ORDER_RECORD', 'ITEM_IDENTIFIER_EVIDENCE', 'CONDITION_EVIDENCE', 'PACKING_CAPTURE', 'RECEIVER_CAPTURE'],
  },
  MASTERCARD: {
    MERCHANDISE_NOT_RECEIVED: ['PACKING_CAPTURE', 'TRACKING_ASSOCIATION', 'DELIVERY_EVIDENCE'],
    NOT_AS_DESCRIBED: ['COMMERCE_ORDER_RECORD', 'CONDITION_EVIDENCE', 'RECEIVER_CAPTURE'],
  },
  PAYPAL: {
    ITEM_NOT_RECEIVED: ['PACKING_CAPTURE', 'TRACKING_ASSOCIATION', 'DELIVERY_EVIDENCE'],
    SIGNIFICANTLY_NOT_AS_DESCRIBED: ['COMMERCE_ORDER_RECORD', 'CONDITION_EVIDENCE', 'RECEIVER_CAPTURE'],
  },
  GENERIC: {
    DEFAULT: ['COMMERCE_ORDER_RECORD', 'PACKING_CAPTURE', 'PACKAGE_SEALING', 'TRACKING_ASSOCIATION', 'DELIVERY_EVIDENCE'],
  },
};

function reviewContext(
  query: PassportReviewQuery | null,
  inventory: readonly PassportInventoryEntry[],
): PassportReviewContext | null {
  const normalized = normalizePassportReviewQuery(query);
  if (!normalized) return null;
  const framework = normalized.framework;
  const category = normalized.category;
  const mapped = REVIEW_RELEVANCE[framework]?.[category]
    ?? REVIEW_RELEVANCE.GENERIC.DEFAULT;
  const byCategory = new Map(inventory.map((entry) => [entry.category, entry.state]));
  return {
    receivingFramework: framework,
    disputeCategory: category,
    relevance: mapped.map((item) => ({
      category: item,
      inventoryState: byCategory.get(item) ?? 'NOT_AVAILABLE',
    })),
    footnote: PASSPORT_REVIEW_FOOTNOTE,
  };
}

function evaluateIntegrity(
  input: PassportAggregatorInput,
  displayedUnattributed: number,
  omittedPageDeclared: boolean,
): PassportIntegrity {
  const finalized = input.artifacts.filter(isFinalized);
  const quarantined = input.artifacts.some(isQuarantined);
  const missingManifest = finalized.some((item) => !item.manifestSha256);
  const missingFile = finalized.some((item) => !item.sha256);
  const missingBundle = finalized.some((item) => !item.evidenceBundleSha256);
  const finalizedHashMismatch = finalized.some((item) => item.clientHashMatched === false);
  const foreign = input.artifacts.some((item) => item.transactionId !== input.transaction.id);
  const auth = finalized.map((item) => item.manifestAuthentication).find((item) => item?.keyId || item?.algorithm) ?? null;
  const legacyBundle = finalized.some((item) => item.bundleBindingProfile === 'LEGACY_V1' || !item.evidenceBundleSha256);
  const legacyMac = auth?.type === 'LEGACY_SERVICE_MAC' || (auth?.algorithm && auth.algorithm !== 'HMAC-SHA256');

  const criteria: PassportIntegrity['criteria'] = {
    passportRecord: 'VERIFIED',
    evidenceManifests: !finalized.length ? 'FAILED' : missingManifest ? 'LIMITED' : 'VERIFIED',
    evidenceFileDigests: !finalized.length ? 'FAILED' : finalizedHashMismatch ? 'FAILED' : missingFile ? 'LIMITED' : 'VERIFIED',
    bundleBindings: !finalized.length ? 'FAILED' : missingBundle ? 'LIMITED' : 'VERIFIED',
    finalization: !finalized.length ? 'FAILED' : quarantined ? 'LIMITED' : 'VERIFIED',
    provenance: displayedUnattributed > 0 ? 'FAILED' : omittedPageDeclared ? 'LIMITED' : 'VERIFIED',
    evidenceLineage: foreign ? 'FAILED' : 'VERIFIED',
  };
  const failed = Object.values(criteria).some((status) => status === 'FAILED');
  const authentic = finalized.length > 0 && !failed;
  return {
    banner: authentic ? 'AUTHENTIC_PACKPROOF' : 'PACKPROOF_RECORD_WITH_LIMITATIONS',
    summary: authentic ? 'PackProof record integrity verified' : 'PackProof record integrity verified with recorded limitations',
    meaning: authentic ? INTEGRITY_MEANING_VERIFIED : INTEGRITY_MEANING_LIMITED,
    criteria,
    manifestAuthentication: {
      type: legacyMac ? 'LEGACY_SERVICE_MAC' : 'SERVICE_MAC',
      algorithm: auth?.algorithm === 'HMAC-SHA256' || !auth?.algorithm ? 'HMAC-SHA256' : 'HMAC-SHA256',
      verificationScope: 'PACKPROOF_SERVICE_ONLY',
      keyId: auth?.keyId ?? null,
      publiclyVerifiable: false,
    },
    canonicalizationProfile: 'PACKPROOF_JCS_1',
    bundleBindingProfile: legacyBundle ? 'LEGACY_V1' : 'PACKPROOF_EVIDENCE_BUNDLE_V2',
  };
}

function fulfillmentEvents(input: PassportAggregatorInput, packing: PassportArtifactInput | undefined, seal: PassportArtifactInput | undefined, label: PassportArtifactInput | undefined): PassportTimelineEvent[] {
  const events: PassportTimelineEvent[] = [];
  const push = (eventId: string, occurredAt: string | null, source: string, provenanceClass: ProvenanceClass, title: string, evidenceReference: string | null) => {
    if (!occurredAt) return;
    events.push({ eventId, occurredAt, source, provenanceClass, title, evidenceReference });
  };
  const orderCommerce = selectPassportDisplayCommerce(input.commerce);
  push(
    'ORDER_CONTEXT',
    orderCommerce?.capturedAt ?? (canAttributePassportOrderToTransaction(input.transaction) ? input.transaction.createdAt : null),
    orderCommerce?.assertingSource ?? 'PACKPROOF_SERVICE',
    'SOURCE_ASSERTION',
    'Order context recorded',
    orderCommerce?.id ?? input.transaction.id,
  );
  const sessionId = packing?.captureSessionId ?? packing?.evidenceSessionId;
  push('CAPTURE_SESSION_STARTED', packing?.createdAt ?? packing?.clientCreatedAt ?? null, 'PACKPROOF_CAPTURE', 'PACKPROOF_OBSERVATION', 'Capture session started', sessionId ?? null);
  const identifier = firstOf(input.artifacts, (item) => IDENTIFIER.has(item.type) && isFinalized(item));
  const trackingArtifact = firstOf(input.artifacts, (item) => Boolean(item.scannedTrackingNumber) && (isFinalized(item) || isQuarantined(item)));
  push('ITEM_IDENTIFIER_OBSERVED', identifier?.finalizedAt ?? trackingArtifact?.finalizedAt ?? null, 'PACKPROOF_CAPTURE', 'PACKPROOF_OBSERVATION', 'Item identifier observed', identifier?.id ?? trackingArtifact?.id ?? null);
  push('ITEM_PACKED', packing?.finalizedAt ?? null, 'PACKPROOF_CAPTURE', 'PACKPROOF_OBSERVATION', 'Item packed', packing?.id ?? null);
  push('PACKAGE_SEALED', seal?.finalizedAt ?? null, 'PACKPROOF_CAPTURE', 'PACKPROOF_OBSERVATION', 'Package sealed', seal?.id ?? null);
  push('LABEL_OBSERVED', label?.finalizedAt ?? null, 'PACKPROOF_CAPTURE', 'PACKPROOF_OBSERVATION', 'Shipping label observed', label?.id ?? null);
  const firstFinalized = firstOf(input.artifacts, isFinalized);
  push('EVIDENCE_FINALIZED', firstFinalized?.finalizedAt ?? null, 'PACKPROOF_SERVICE', 'INTEGRITY_RESULT', 'Evidence finalized', firstFinalized?.id ?? null);
  push('DELIVERY', input.delivery?.receivedAt ?? null, 'MERCHANT_API', 'SOURCE_ASSERTION', 'Delivery associated', input.delivery?.arrivalEvidenceId ?? null);
  return events;
}

export function aggregatePassport(input: PassportAggregatorInput): PackProofPassportV1 {
  const outbound = input.artifacts.filter((item) => !item.returnPassportId);
  const packing = firstOf(outbound, (item) => OUTBOUND_PACKING.has(item.type) && isFinalized(item))
    ?? firstOf(outbound, (item) => OUTBOUND_PACKING.has(item.type));
  const seal = firstOf(outbound, (item) => OUTBOUND_SEAL.has(item.type) && isFinalized(item))
    ?? firstOf(outbound, (item) => OUTBOUND_SEAL.has(item.type));
  const label = firstOf(outbound, (item) => item.type === 'SHIPPING_LABEL' && isFinalized(item))
    ?? firstOf(outbound, (item) => item.type === 'SHIPPING_LABEL');
  const trackingArtifact = firstOf(input.artifacts, (item) => Boolean(item.scannedTrackingNumber));
  const trackerArtifact = firstOf(input.artifacts, (item) => Boolean(item.shippingTracker));
  const arrival = firstOf(outbound, (item) => ARRIVAL.has(item.type) && isFinalized(item))
    ?? firstOf(outbound, (item) => ARRIVAL.has(item.type));
  const unboxing = firstOf(outbound, (item) => UNBOXING.has(item.type) && isFinalized(item))
    ?? firstOf(outbound, (item) => UNBOXING.has(item.type));
  const selected = orderContextSelection(input.transaction, input.commerce);
  const commerce = selected.orderCommerce;
  const platformValue = selected.platformValue;
  const orderValue = selected.orderValue;
  const amountValue = selected.amountValue;
  const sellerValue = selected.sellerValue;
  const titleValue = selected.titleValue;
  const expectedTracking = input.shipment?.trackingNumber ?? input.transaction.sourceTrackingNumber ?? null;
  const observedTracking = trackingArtifact?.scannedTrackingNumber ?? null;
  const observations: PassportObservation[] = [];

  for (const artifact of input.artifacts.filter((item) => ITEM_CAPTURE.has(item.type) && (isFinalized(item) || isQuarantined(item)))) {
    observations.push(observation('ITEM_CAPTURED', artifact.type, artifact));
  }
  if (observedTracking) {
    observations.push(observation('BARCODE_OBSERVED', observedTracking, trackingArtifact ?? null));
    observations.push(observation('TRACKING_OBSERVED', observedTracking, trackingArtifact ?? null));
  }
  for (const artifact of input.artifacts.filter((item) => CONDITION.has(item.type) && (isFinalized(item) || isQuarantined(item)))) {
    observations.push(observation('CONDITION_IMAGERY', artifact.type, artifact));
  }
  if (packing) {
    observations.push(observation('PACKING_CAPTURE', packing.type, packing));
    observations.push(observation('PACKAGE_INTERIOR', packing.type, packing));
  }
  if (seal) observations.push(observation('SEAL_EVENT', seal.type, seal));
  if (label) {
    observations.push(observation('SHIPPING_LABEL', label.shippingTracker?.stillSha256 ?? label.sha256, label, {
      digestSha256: label.shippingTracker?.stillSha256 ?? label.sha256,
    }));
  }
  for (const artifact of input.artifacts.filter((item) => item.appDeviceContextStatus)) {
    observations.push(observation('APP_DEVICE_CONTEXT', artifact.appDeviceContextStatus, artifact));
  }

  const expected: PassportExpectedItem = {
    title: sourceFact(titleValue ?? null, commerce, input.transaction),
    sku: sourceFact(selected.sku, commerce, input.transaction),
    gtin: sourceFact(selected.gtin, commerce, input.transaction),
    upc: sourceFact(selected.upc, commerce, input.transaction),
    variant: sourceFact(selected.variant, commerce, input.transaction),
    quantity: sourceFact(selected.quantity, commerce, input.transaction),
    declaredCondition: sourceFact(selected.declaredCondition, commerce, input.transaction),
    serialExpected: sourceFact(selected.serialNumber, commerce, input.transaction),
    merchantItemId: sourceFact(selected.merchantItemId, commerce, input.transaction),
    listingReference: sourceFact(selected.listingReference, commerce, input.transaction),
  };

  const comparisons: PassportComparison[] = [
    compareIdentifierAttribute('UPC', expected.upc.value, null),
    compareIdentifierAttribute('GTIN', expected.gtin.value, null),
    compareIdentifierAttribute('SKU', expected.sku.value, null),
    compareIdentifierAttribute('SERIAL', expected.serialExpected.value, null),
    interpretedComparison('QUANTITY', expected.quantity.value === null ? null : String(expected.quantity.value), null),
    interpretedComparison('VARIANT', expected.variant.value, null),
    compareIdentifierAttribute('TRACKING', expectedTracking, observedTracking),
    interpretedComparison('TITLE', expected.title.value, null),
  ];

  const identifierArtifacts = input.artifacts.filter((item) => IDENTIFIER.has(item.type) || Boolean(item.scannedTrackingNumber));
  const packingArtifacts = outbound.filter((item) => OUTBOUND_PACKING.has(item.type));
  const sealArtifacts = outbound.filter((item) => OUTBOUND_SEAL.has(item.type));
  const labelArtifacts = outbound.filter((item) => item.type === 'SHIPPING_LABEL');
  const trackingMismatch = input.artifacts.some((item) => item.carrierTrackingMatchStatus === 'MISMATCH');
  const inventory = inventoryCategories.map((category) => {
    const row = inventoryStateFor(category, {
      hasCommerceSource: Boolean((commerce?.id && commerceContextMayAppearAsPassportOrderContext(commerce.trustLevel)) || input.transaction.externalOrderId || (input.transaction.merchantReference && input.transaction.sourceTrustLevel !== 'PAGE_DECLARED')),
      unattributed: false,
      identifierArtifacts,
      conditionArtifacts: input.artifacts.filter((item) => CONDITION.has(item.type)),
      packingArtifacts,
      sealArtifacts,
      labelArtifacts,
      trackingObserved: Boolean(observedTracking),
      trackingSupplied: Boolean(expectedTracking),
      trackingMismatch,
      shippingTerms: input.transaction.termsSaleType !== 'LOCAL_HANDOFF',
      deliveryArtifacts: outbound.filter((item) => ARRIVAL.has(item.type) || UNBOXING.has(item.type)),
      receiverArtifacts: outbound.filter((item) => UNBOXING.has(item.type)),
      returnArtifacts: input.artifacts.filter((item) => RETURN_TYPES.has(item.type) || Boolean(item.returnPassportId)),
      hasReturn: input.returns.length > 0,
      shipped: Boolean(input.shipment),
    });
    return { category, state: row.state, artifactIds: row.artifactIds };
  });

  const artifacts: PassportArtifact[] = input.artifacts.map((item) => ({
    artifactId: item.id,
    type: item.type,
    source: artifactSource(item),
    capturedAt: item.clientCreatedAt,
    finalizedAt: item.finalizedAt,
    contentType: item.contentType,
    sizeBytes: item.sizeBytes,
    sha256: item.sha256,
    manifestSha256: item.manifestSha256,
    evidenceBundleSha256: item.evidenceBundleSha256,
    finalization: item.finalization,
    evidenceSessionId: item.evidenceSessionId ?? item.captureSessionId,
    shippingTracker: item.shippingTracker ? { ...item.shippingTracker, interpretation: SHIPPING_TRACKER_INTERPRETATION } : null,
  }));

  const derivedTimeline = fulfillmentEvents(input, packing, seal, label);
  const recordedTimeline: PassportTimelineEvent[] = input.timeline.map((item) => ({
    eventId: item.id,
    occurredAt: item.occurredAt,
    source: 'PACKPROOF_SERVICE',
    provenanceClass: 'PACKPROOF_OBSERVATION',
    title: item.summary || item.type,
    evidenceReference: null,
  }));
  const timeline = [...derivedTimeline, ...recordedTimeline].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));

  const destination = fact<PassportDestination | null>(null, 'SOURCE_ASSERTION', {
    assertingSource: null,
    trustClass: null,
    recordedAt: null,
    sourceRecordId: null,
    sourceReference: null,
    digestSha256: null,
  });

  const transactionBlock: PassportTransaction = {
    commerceContextId: commerce?.id ?? null,
    platform: sourceFact(platformValue ?? null, commerce, input.transaction),
    externalOrderId: sourceFact(orderValue ?? null, commerce, input.transaction),
    transactionDate: sourceFact(input.transaction.createdAt, commerce, input.transaction),
    amount: sourceFact(amountValue, commerce, input.transaction),
    sellerReference: sourceFact(sellerValue ?? null, commerce, input.transaction),
    destination,
    itemCount: sourceFact(selected.quantity, commerce, input.transaction),
    sourceTrustClass: commerce?.trustLevel ?? (selected.useTransactionOrder ? 'MERCHANT_SERVER_ATTESTED' : null),
    importedAt: commerce?.capturedAt ?? null,
    canonicalPayloadSha256: commerce?.canonicalPayloadSha256 ?? null,
  };

  const displayedUnattributed = [
    transactionBlock.platform,
    transactionBlock.externalOrderId,
    transactionBlock.amount,
    transactionBlock.sellerReference,
    expected.title,
    expected.sku,
    expected.gtin,
    expected.upc,
    expected.serialExpected,
  ].filter((item) => item.value !== null && item.value !== undefined && !item.assertingSource).length;

  const integrity = evaluateIntegrity(input, displayedUnattributed, selected.omittedPageDeclared);
  const sourceUpdatedAt = latestIso([
    input.transaction.updatedAt,
    ...input.artifacts.map((item) => item.finalizedAt ?? item.createdAt),
    input.shipment?.shippedAt,
    input.delivery?.receivedAt,
    ...input.returns.map((item) => item.createdAt),
  ]);
  const verificationUrl = `${input.identity.verificationBaseUrl.replace(/\/$/, '')}/passport/${input.identity.displayId}`;
  const provenance: PassportProvenanceFact[] = [];
  const pushProv = (field: string, item: PassportFact<string | number | boolean | null>) => {
    provenance.push({ field, ...item });
  };
  pushProv('platform', transactionBlock.platform);
  pushProv('externalOrderId', transactionBlock.externalOrderId);
  if (amountValue) {
    pushProv('amount.currency', fact(amountValue.currency, transactionBlock.amount.provenanceClass, transactionBlock.amount));
    pushProv('amount.minorUnits', fact(amountValue.minorUnits, transactionBlock.amount.provenanceClass, transactionBlock.amount));
  }
  if (observedTracking) pushProv('trackingObserved', fact(observedTracking, 'PACKPROOF_OBSERVATION', { assertingSource: 'PACKPROOF_CAPTURE', trustClass: 'PACKPROOF_CAPTURE', sourceRecordId: trackingArtifact?.id ?? null }));
  if (expectedTracking) pushProv('trackingSupplied', fact(expectedTracking, 'SOURCE_ASSERTION', { assertingSource: 'MERCHANT_API', trustClass: 'MERCHANT_SERVER_ATTESTED', sourceRecordId: input.transaction.id }));
  const weight = selected.declaredWeightGrams;
  if (weight !== null && weight !== undefined) {
    pushProv('declaredWeightGrams', fact(weight, 'SOURCE_ASSERTION', {
      assertingSource: commerce?.assertingSource ?? 'MERCHANT_API',
      trustClass: commerce?.trustLevel ?? 'MERCHANT_SERVER_ATTESTED',
      sourceRecordId: commerce?.id ?? input.transaction.id,
    }));
  }

  const shipment: PassportShipment | null = input.shipment ? {
    carrier: fact(input.shipment.carrier, 'SOURCE_ASSERTION', { assertingSource: 'MERCHANT_API', trustClass: 'MERCHANT_SERVER_ATTESTED', recordedAt: input.shipment.createdAt, sourceRecordId: input.transaction.id }),
    trackingSupplied: fact(input.shipment.trackingNumber, 'SOURCE_ASSERTION', { assertingSource: 'MERCHANT_API', trustClass: 'MERCHANT_SERVER_ATTESTED', recordedAt: input.shipment.createdAt, sourceRecordId: input.transaction.id }),
    trackingObserved: fact(observedTracking, observedTracking ? 'PACKPROOF_OBSERVATION' : 'SOURCE_ASSERTION', {
      assertingSource: observedTracking ? 'PACKPROOF_CAPTURE' : null,
      trustClass: observedTracking ? 'PACKPROOF_CAPTURE' : null,
      sourceRecordId: trackingArtifact?.id ?? null,
    }),
    trackingThirdParty: fact(null, 'THIRD_PARTY_ASSERTION', { assertingSource: null, trustClass: null }),
    labelObservedByPackProof: Boolean(label && isFinalized(label)),
    associatedAt: input.shipment.shippedAt ?? input.shipment.createdAt,
    packingEvidenceId: input.shipment.packingEvidenceId,
    sealEvidenceId: input.shipment.sealEvidenceId,
  } : null;

  const delivery: PassportDelivery | null = input.delivery ? {
    carrier: fact(input.delivery.carrier, 'SOURCE_ASSERTION', { assertingSource: 'MERCHANT_API', trustClass: 'MERCHANT_SERVER_ATTESTED', recordedAt: input.delivery.receivedAt }),
    trackingNumber: fact(input.delivery.trackingNumber, 'SOURCE_ASSERTION', { assertingSource: 'MERCHANT_API', trustClass: 'MERCHANT_SERVER_ATTESTED', recordedAt: input.delivery.receivedAt }),
    receivedAt: fact(input.delivery.receivedAt, 'SOURCE_ASSERTION', { assertingSource: 'MERCHANT_API', trustClass: 'MERCHANT_SERVER_ATTESTED', recordedAt: input.delivery.receivedAt }),
    arrivalArtifactId: input.delivery.arrivalEvidenceId,
    signatureAvailable: false,
    deliveryPhotoAvailable: Boolean(arrival),
  } : null;

  const receiver: PassportReceiver | null = arrival || unboxing ? {
    arrivalArtifactId: arrival?.id ?? null,
    unboxingArtifactId: unboxing?.id ?? null,
    observedAt: unboxing?.finalizedAt ?? arrival?.finalizedAt ?? null,
  } : null;

  return {
    object: PASSPORT_OBJECT,
    schemaVersion: 1,
    identity: {
      passportId: input.identity.passportId,
      displayId: input.identity.displayId,
      schemaVersion: 1,
      rendererCompatibility: 'PASSPORT_WEB_V1',
      transactionId: input.transaction.id,
      state: 'CURRENT',
      issuedAt: input.identity.issuedAt,
      sourceUpdatedAt,
      merchantPlatform: platformValue ?? null,
      externalOrderId: orderValue ?? null,
      verificationUrl,
      qrPayload: verificationUrl,
    },
    integrity,
    transaction: transactionBlock,
    items: [{ index: 0, expected, observations, comparisons }],
    fulfillment: {
      captureSessionId: packing?.captureSessionId ?? packing?.evidenceSessionId ?? null,
      packingArtifactId: packing?.id ?? null,
      sealArtifactId: seal?.id ?? null,
      labelArtifactId: label?.id ?? null,
      trackingObserved: fact(observedTracking, observedTracking ? 'PACKPROOF_OBSERVATION' : 'PACKPROOF_OBSERVATION', {
        assertingSource: observedTracking ? 'PACKPROOF_CAPTURE' : null,
        trustClass: observedTracking ? 'PACKPROOF_CAPTURE' : null,
        sourceRecordId: trackingArtifact?.id ?? null,
      }),
      shippingTracker: fact(trackerValue(trackerArtifact), trackerArtifact ? 'PACKPROOF_OBSERVATION' : 'PACKPROOF_OBSERVATION', {
        assertingSource: trackerArtifact ? 'PACKPROOF_CAPTURE' : null,
        trustClass: trackerArtifact ? 'PACKPROOF_CAPTURE' : null,
        sourceRecordId: trackerArtifact?.id ?? null,
        digestSha256: trackerArtifact?.shippingTracker?.observationSha256 ?? null,
      }),
    },
    shipment,
    delivery,
    receiver,
    returns: input.returns.map((item) => ({
      returnPassportId: item.id,
      status: item.status,
      reason: item.reason,
      packingArtifactId: item.packingEvidenceId,
      sealArtifactId: item.sealEvidenceId,
      trackingSupplied: fact(item.shippingTrackingNumber, 'SOURCE_ASSERTION', {
        assertingSource: 'MERCHANT_API',
        trustClass: 'MERCHANT_SERVER_ATTESTED',
        sourceRecordId: item.id,
      }),
    })),
    evidenceInventory: inventory,
    artifacts,
    timeline,
    reviewContext: reviewContext(input.reviewQuery, inventory),
    provenance,
    limitations: {
      physicalCorrespondence: 'NOT_AVAILABLE',
      businessLegalRelevance: 'REVIEW_REQUIRED',
      doesNotAuthenticateItem: true,
      doesNotProveCustody: true,
      doesNotDecideFraudOrFault: true,
      doesNotGuaranteeDisputeOutcome: true,
      absenceOfEvidenceDoesNotAffectAuthenticity: true,
      noEvidentiaryWeightScore: true,
      presentationExportIsNotSource: true,
      manifestAuthenticationScope: 'PACKPROOF_SERVICE_ONLY',
      shippingTrackerInterpretation: SHIPPING_TRACKER_INTERPRETATION,
      humanReviewDisclaimer: input.humanReviewDisclaimer,
    },
    createdAt: input.identity.issuedAt,
    updatedAt: sourceUpdatedAt,
  };
}

export function verificationUrlFor(displayId: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/passport/${displayId}`;
}
