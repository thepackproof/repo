# PackProof Passport Schema v1

Status: `IMPLEMENTED` in source. Live issuance still requires a deployed functions revision and a transaction that passes Proof (Passport) 1.0 eligibility.

Product name: **Proof**. Technical synonym: Passport. Technical `object` discriminator remains `packproof_passport` until schemaVersion 2. See [ADR 0015](../adr/0015-proof-is-the-passport.md).

## 0. Governing decision

The Proof is **not** another evidence record, video, manifest, claims report, or PDF.

> The Proof is the canonical, human- and machine-readable aggregation of the transaction’s existing PackProof records. Passport is the deprecated product name for the same projection.

| Surface | Role |
|---|---|
| `GET` JSON Proof (`/passport` and `/proof`) | Canonical representation |
| Web Proof | Interactive rendering of that JSON |
| Zendesk ticket sidebar | Interactive rendering of that JSON for claims review; see [ADR 0016](../adr/0016-zendesk-claims-presentation-surface.md) |
| Salesforce Case record page | Interactive rendering of that JSON for claims review; see [ADR 0017](../adr/0017-salesforce-claims-presentation-surface.md) |
| Claims / network projection | Filtered view of the same JSON |
| PDF / `evidence_report` | Presentation export of a frozen snapshot |

PDF remains `presentationOnly: true`. Native evidence is still original bytes, manifests, bundle bindings, commerce-context snapshots, shipments, deliveries, Return Passports, and audit events. This matches the architecture contract: generated reports are not the native evidence source.

Do not overload these identities:

| Identity | Prefix / form | Meaning |
|---|---|---|
| Proof display ID | `PP-XXXX-XXXX-XXXX` | Human-facing Proof identifier |
| Proof resource ID | `ppt_...` | Canonical API identifier (`identity.passportId` in schema v1) |
| Proof snapshot ID | `pps_...` | Frozen projection used for PDF and dispute packets |
| PackProof transaction ID | `txn_...` | Agreed item, terms, participants, workflow |
| Source / order ID | platform-native | Merchant or marketplace order reference |
| Commerce context ID | `ctx_...` | Immutable imported order/listing snapshot |
| Passport draft ID | `draft_...` | Prefill before order binding — **not** this Passport |
| Return Passport ID | `return_...` | Reverse-logistics workflow resource |

`passport_draft` stays the pre-binding draft. A Proof is issued only after a bound transaction has server-finalized evidence.

## 1. Resource graph (projection, not a new store)

```text
Proof (Passport projection)
  reads → transaction
  reads → commerce context (if bound)
  reads → evidence artifacts + manifests
  reads → shipments, deliveries, Return Passports
  reads → timeline / audit events
  optionally reads → review-context configuration
  writes → passport identity binding on the transaction (once)
  writes → optional immutable snapshots + PDF exports
```

Most Passport fields are derived. The only new durable facts are:

1. stable Passport identity bound to a transaction;
2. optional frozen snapshots (canonical JSON + digest);
3. optional presentation exports (PDF bytes + digest + renderer version).

## 2. Eligibility (Passport 1.0)

A live Passport may be issued or returned only when all of the following are true:

1. a PackProof transaction exists and is tenant-authorized for the caller;
2. at least one identified commerce/transaction source exists (`commerceContextId`, Connect `source.externalOrderId`, or merchant reference);
3. every imported commercial fact that is displayed carries source attribution (or is omitted);
4. at least one evidence artifact is `FINALIZED` with `sha256` and `manifestSha256`;
5. limitations are always attached.

If eligibility fails, the API returns `409 PASSPORT_NOT_READY` with the failed criteria. Do not emit an empty or “inauthentic” Passport.

`NOT AVAILABLE` inventory rows never fail eligibility and never make a Passport inauthentic.

## 3. Canonical object

```ts
type PackProofPassportV1 = {
  object: 'packproof_passport';
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
  createdAt: string; // ISO-8601, first issuance
  updatedAt: string; // ISO-8601, latest source-record time considered
};
```

Unknown fields are rejected at parse time (`additionalProperties: false`). Breaking changes require `schemaVersion: 2`.

## 4. Provenance classes

Every displayed material fact carries one class. Do not collapse them.

| Class | Meaning | Existing repo sources |
|---|---|---|
| `SOURCE_ASSERTION` | Merchant/platform told PackProof | `CommerceContext.fieldProvenance` with `MERCHANT_API` / `PLATFORM_API` / `EXTERNAL_ADAPTER`; Connect order fields |
| `PARTICIPANT_ASSERTION` | Seller/buyer declared it | `SELLER_ENTERED` / `BUYER_ENTERED`; transaction terms confirmed by participants |
| `PACKPROOF_OBSERVATION` | Captured on a PackProof acquisition path | Finalized artifacts, shipping-label scan, OSS tracker observation |
| `THIRD_PARTY_ASSERTION` | Carrier/payment/other external system | Not first-class in 1.0; merchant-asserted shipment/delivery stays `SOURCE_ASSERTION` until a carrier adapter exists |
| `INTEGRITY_RESULT` | PackProof calculated it | File SHA-256, manifest SHA-256, bundle digest, `hashMatched`, `clientHashMatched` |
| `DERIVED_COMPARISON` | Compared recorded facts without a broader conclusion | Expected ↔ observed; tracking same/different |

Field-level provenance on imported commerce data continues to use `functions/src/domain/v1/common.ts` (`source`, `confidence`, `importedAt`, `sourceReference`). Passport provenance classes are the **display/aggregation** vocabulary mapped from those fields plus capture/integrity results.

```ts
type PassportFact<T> = {
  value: T;
  provenanceClass: 'SOURCE_ASSERTION' | 'PARTICIPANT_ASSERTION' | 'PACKPROOF_OBSERVATION' | 'THIRD_PARTY_ASSERTION' | 'INTEGRITY_RESULT' | 'DERIVED_COMPARISON';
  assertingSource: string | null; // e.g. MERCHANT_API, PACKPROOF_CAPTURE, UPS_TRACKING_API
  trustClass: 'MERCHANT_SERVER_ATTESTED' | 'PLATFORM_API_ATTESTED' | 'USER_PROVIDED_COMMERCE_ARTIFACT' | 'PAGE_DECLARED' | 'PACKPROOF_CAPTURE' | 'PACKPROOF_SERVICE' | null;
  recordedAt: string | null;
  sourceRecordId: string | null; // ctx_, art_, shipment_, txn_, pps_, ...
  sourceReference: string | null; // external order/listing id, artifact id
  digestSha256: string | null;
};
```

`PAGE_DECLARED` facts may appear only as draft lineage. They must not be presented as Passport order context.

`USER_PROVIDED_COMMERCE_ARTIFACT` facts may appear as Passport order context with provenance class `SOURCE_ASSERTION`. Approved copy is that PackProof received transaction metadata from seller-provided commerce correspondence. They must not be presented as a merchant- or platform-attested order, a verified purchase, or an `ORDER_BOUND` fact.

## 5. Identity

```ts
type PassportIdentity = {
  passportId: string;          // ppt_...
  displayId: string;           // PP-XXXX-XXXX-XXXX
  schemaVersion: 1;
  rendererCompatibility: 'PASSPORT_WEB_V1';
  transactionId: string;       // txn_...
  state: 'CURRENT';            // live projection; snapshots use a different object
  issuedAt: string;
  sourceUpdatedAt: string;     // max(updatedAt) of contributing records
  merchantPlatform: string | null;
  externalOrderId: string | null;
  verificationUrl: string;     // absolute URL to this Passport
  qrPayload: string;           // same URL; PDF encodes it
};
```

Issuance rule: the first time eligibility passes, bind `passportId` + `displayId` on the transaction. They never change. Subsequent `GET`s re-aggregate into the same identity.

`displayId` is Crockford Base32 of 60 bits from `SHA-256("packproof-passport-display-v1\n" || passportId)`, grouped `PP-XXXX-XXXX-XXXX`. Recalculating it from `passportId` must yield the same display id. Do not use order IDs or transaction IDs as the display id.

Verification URL (1.0): `{CONNECT_LINK_BASE_URL}/passport/{displayId}` with authorization still required for PII. The QR does not grant access.

## 6. Authenticity and integrity

Banner copy is frozen:

```text
AUTHENTIC PACKPROOF
PackProof record integrity verified
```

What this means (required subtitle / tooltip):

> PackProof's evidence records and integrity bindings associated with this Passport successfully verify.

Forbidden banner copy: `VERIFIED TRANSACTION`, `VERIFIED ITEM`, `CLAIM VALID`, `Evidence Valid`, `AUTHENTIC ITEM`, `DIGITAL SIGNATURE VERIFIED`.

```ts
type IntegrityStatus = 'VERIFIED' | 'RECORDED' | 'LIMITED' | 'FAILED';

type PassportIntegrity = {
  banner: 'AUTHENTIC_PACKPROOF' | 'PACKPROOF_RECORD_WITH_LIMITATIONS';
  summary: 'PackProof record integrity verified' | 'PackProof record integrity verified with recorded limitations';
  meaning: string; // exact sentence above, or the limitations variant
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
    publiclyVerifiable: false; // 1.0: HMAC is not a digital signature
  };
  canonicalizationProfile: 'PACKPROOF_JCS_1';
  bundleBindingProfile: 'PACKPROOF_EVIDENCE_BUNDLE_V2' | 'LEGACY_V1';
};
```

Evaluation (1.0):

| Criterion | `VERIFIED` | `LIMITED` | `FAILED` |
|---|---|---|---|
| Passport record | Live generator or snapshot digest verifies | Snapshot stale vs sources | Snapshot digest mismatch |
| Evidence manifests | Every `FINALIZED` artifact has `manifestSha256` | Some finalized artifacts lack manifests (legacy) | Manifest digest mismatch when rehashed |
| File digests | Every `FINALIZED` artifact has `sha256` | Mixed legacy | Server hash mismatch vs stored bytes |
| Bundle bindings | Every `FINALIZED` artifact has `evidenceBundleSha256` | Legacy v1 bindings labeled | Binding mismatch |
| Finalization | ≥1 `FINALIZED` | Also has `QUARANTINED` | No finalized artifact (ineligible) |
| Provenance | Displayed commerce facts have attribution | Some facts omitted rather than unattributed | Unattributed commercial fact displayed |
| Lineage | Artifact IDs resolve to this transaction | Legacy IDs accepted via compatibility | Artifact bound to another transaction |

`AUTHENTIC_PACKPROOF` requires no `FAILED` criterion and at least one `FINALIZED` artifact. `QUARANTINED` artifacts produce `LIMITED` on finalization, not an inauthentic Passport. `LIMITED` criteria stay on the individual integrity/inventory dimensions; they do not change the authenticity banner.

Never describe HMAC-SHA256 service authentication as a digital signature. External reviewers verify file / manifest / bundle hashes. PackProof verifies service MAC. A future asymmetric KMS/HSM signer is a new `manifestAuthentication.type`; it must not reinterpret HMAC records.

## 7. Transaction context

```ts
type PassportTransaction = {
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

type PassportDestination = {
  representation: 'REDACTED' | 'LOCALITY' | 'FULL';
  locality: string | null;      // e.g. Columbus, OH
  postalCodePrefix: string | null;
  fullAddress: string | null;   // only if caller is authorized
};
```

Aggregation:

| Passport field | Primary source |
|---|---|
| platform / order | `commerceContexts.source` or `transactions.source` (Connect) |
| amount | commerce context item.amount, else transaction amount |
| seller reference | Connect `externalSellerId` / merchant principal — never a secret |
| destination | **Not stored in 1.0 core records.** Emit `null` + inventory `NOT_AVAILABLE` until a privacy-scoped destination resource exists |
| importedAt / digest | `commerceContext.source.capturedAt`, `canonicalPayloadSha256` |

Display copy: “eBay asserted SKU … as part of the imported order context,” never a bare `SKU: ABC123` without source. For `USER_PROVIDED_COMMERCE_ARTIFACT`, say PackProof received transaction metadata from seller-provided commerce correspondence. Evidence sessions freeze `originalArtifactSha256` and `normalizedSnapshotSha256` at `CAPTURING` so later context changes cannot rewrite the import capture was started against.

## 8. Items, observations, comparisons

```ts
type PassportItem = {
  index: number;
  expected: PassportExpectedItem;
  observations: PassportObservation[];
  comparisons: PassportComparison[];
};

type PassportExpectedItem = {
  title: PassportFact<string | null>;
  sku: PassportFact<string | null>;
  gtin: PassportFact<string | null>;
  upc: PassportFact<string | null>;
  variant: PassportFact<string | null>; // joined selectedOptions
  quantity: PassportFact<number | null>;
  declaredCondition: PassportFact<string | null>;
  serialExpected: PassportFact<string | null>;
  merchantItemId: PassportFact<string | null>;
  listingReference: PassportFact<string | null>;
};

type PassportObservation = {
  kind:
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
  result: PassportFact<string | boolean | number | null>;
  artifactId: string | null;
  evidenceSessionId: string | null;
  frameReference: string | null; // e.g. 00:38.422; null in 1.0 unless stored
  capturedAt: string | null;
};

type ComparisonResult =
  | 'SAME'
  | 'DIFFERENT'
  | 'CONSISTENT_WITH_DECLARED'
  | 'NOT_CONSISTENT_WITH_DECLARED'
  | 'NOT_COMPARED';

type PassportComparison = {
  attribute: 'UPC' | 'GTIN' | 'SKU' | 'SERIAL' | 'QUANTITY' | 'VARIANT' | 'TRACKING' | 'TITLE';
  expected: string | null;
  observed: string | null;
  result: ComparisonResult;
  method: 'EXACT_NORMALIZED' | 'DECLARED_INTERPRETATION' | 'NOT_COMPARABLE';
  footnote: 'RELATIONSHIP_ONLY';
};
```

Required footnote on every comparison block:

> Comparisons report relationships between recorded data. They do not establish product authenticity, legal ownership, custody or liability.

Rules:

- Exact machine identifiers (normalized UPC/GTIN/SKU/serial/tracking): `SAME` / `DIFFERENT` only. Never `MATCH`.
- Interpreted attributes (color, “black / 512 GB” from photos): `CONSISTENT_WITH_DECLARED` / `NOT_CONSISTENT_WITH_DECLARED`, or `NOT_COMPARED` in 1.0 if no extractor exists.
- Missing either side: `NOT_COMPARED`, not `DIFFERENT`.
- **Expected** means “represented by the commerce/order source,” not independently verified by PackProof.

### 1.0 observation extractors (only what the repo actually stores)

| Observation | 1.0 source | Later |
|---|---|---|
| ITEM_CAPTURED | `ITEM_PHOTO` or `PACKING_VIDEO` finalized | — |
| BARCODE_OBSERVED | shipping-label `scannedTrackingNumber` / tracker; identifier telemetry if present on manifest | product UPC from identifier still |
| SERIAL_OBSERVED | none unless captured into manifest/identifiers | OCR / scan |
| QUANTITY_OBSERVED | none (do not infer 1 from one video) | explicit count protocol |
| CONDITION_IMAGERY | `CONDITION_PHOTO` | — |
| PACKING_CAPTURE | `PACKING_VIDEO` / `STATION_PACKING_VIDEO` | — |
| PACKAGE_INTERIOR | packing video present; no separate type | dedicated still |
| SEAL_EVENT | `SHIPPING_LABEL` (seal reference protocol) | — |
| SHIPPING_LABEL | `SHIPPING_LABEL` + optional still SHA-256 | — |
| TRACKING_OBSERVED | `scannedTrackingNumber` + `shippingTracker` | carrier API |
| WEIGHT | Connect `declaredWeightGrams` is **expected**, provenance `SOURCE_ASSERTION`, not an observation | scale capture |
| APP_DEVICE_CONTEXT | artifact `assurance.appDeviceContext` / `attestationStatus` | — |

Connect ingestion today stores title, description, amount, and identifiers provenance; SKU/GTIN/UPC/serial are often null. Passport must show `null` + `NOT_COMPARED` rather than invent values.

## 9. Fulfillment, shipment, delivery

```ts
type PassportFulfillment = {
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
    interpretation: 'OPEN_SOURCE_TRACKING_NUMBER_VALIDATION_NOT_CARRIER_CUSTODY';
  } | null>;
};
```

Shipment and delivery are separate from capture:

```ts
type PassportShipment = {
  carrier: PassportFact<string | null>;
  trackingSupplied: PassportFact<string | null>;      // merchant/platform
  trackingObserved: PassportFact<string | null>;      // PackProof capture
  trackingThirdParty: PassportFact<string | null>;    // null in 1.0
  labelObservedByPackProof: boolean;
  associatedAt: string | null;
  packingEvidenceId: string | null;
  sealEvidenceId: string | null;
};

type PassportDelivery = {
  carrier: PassportFact<string | null>;
  trackingNumber: PassportFact<string | null>;
  receivedAt: PassportFact<string | null>;
  arrivalArtifactId: string | null;
  signatureAvailable: false; // 1.0: not a PackProof resource
  deliveryPhotoAvailable: boolean;
};
```

Do not phrase merchant-associated UPS tracking as “UPS reports” unless a carrier adapter supplied `THIRD_PARTY_ASSERTION`.

`receiver` is non-null only when unboxing / arrival artifacts exist. `returns` is omitted from PDF page generation when empty; JSON uses `[]`.

## 10. Evidence inventory

Four states only. Not scores.

```ts
type InventoryState = 'AVAILABLE' | 'NOT_AVAILABLE' | 'NOT_APPLICABLE' | 'REVIEW_REQUIRED';

type PassportInventoryEntry = {
  category:
    | 'COMMERCE_ORDER_RECORD'
    | 'ITEM_IDENTIFIER_EVIDENCE'
    | 'CONDITION_EVIDENCE'
    | 'PACKING_CAPTURE'
    | 'PACKAGE_SEALING'
    | 'SHIPPING_LABEL_EVIDENCE'
    | 'TRACKING_ASSOCIATION'
    | 'WEIGHT_OBSERVATION'
    | 'CARRIER_ACCEPTANCE'
    | 'DELIVERY_EVIDENCE'
    | 'RECEIVER_CAPTURE'
    | 'RETURN_EVIDENCE'
    | 'REFUND_EVIDENCE';
  state: InventoryState;
  artifactIds: string[];
};
```

Mapping from current protocol completeness:

| Category | AVAILABLE | NOT_APPLICABLE | REVIEW_REQUIRED |
|---|---|---|---|
| COMMERCE_ORDER_RECORD | commerce context or Connect source | — | unattributed |
| ITEM_IDENTIFIER_EVIDENCE | `IDENTIFIER_PHOTO` or observed barcode | — | quarantined identifier |
| CONDITION_EVIDENCE | `CONDITION_PHOTO` | local-handoff policy if ever used | — |
| PACKING_CAPTURE | packing video finalized | — | packing present but hash mismatch |
| PACKAGE_SEALING | seal reference finalized | — | — |
| SHIPPING_LABEL_EVIDENCE | `SHIPPING_LABEL` | — | — |
| TRACKING_ASSOCIATION | observed or merchant tracking | no shipping terms | mismatch recorded |
| WEIGHT_OBSERVATION | captured weight (none in 1.0) | — | — |
| CARRIER_ACCEPTANCE | third-party scan (none in 1.0) | — | — |
| DELIVERY_EVIDENCE | delivery photo / unboxing | not yet shipped | — |
| RECEIVER_CAPTURE | buyer unboxing | outbound-only review | — |
| RETURN_EVIDENCE | return packing/seal | no return passport | — |
| REFUND_EVIDENCE | not a PackProof resource | always in 1.0 | — |

`NOT AVAILABLE` does not make the Passport inauthentic. Do not rank, score, or color the Passport by completeness.

## 11. Artifact index and timeline

```ts
type PassportArtifact = {
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
  shippingTracker: object | null;
};

type PassportTimelineEvent = {
  eventId: string;
  occurredAt: string;
  source: string;
  provenanceClass: PassportFact<never>['provenanceClass'];
  title: string;
  evidenceReference: string | null;
};
```

Timeline is chronological, derived from transaction `createdAt`, evidence `finalizedAt` / `clientCreatedAt`, shipment `shippedAt`, delivery `receivedAt`, and existing timeline events. PackProof does not write a prose narrative.

Physical-fulfillment chain events (Page 1 strip): `ORDER_CONTEXT` → `CAPTURE_SESSION_STARTED` → `ITEM_IDENTIFIER_OBSERVED` → `ITEM_PACKED` → `PACKAGE_SEALED` → `LABEL_OBSERVED` → `EVIDENCE_FINALIZED` → `CARRIER_ACCEPTANCE` → `DELIVERY`. Missing steps are omitted, not marked failed.

## 12. Review context (projection only)

```ts
type PassportReviewContext = {
  receivingFramework: 'VISA' | 'MASTERCARD' | 'PAYPAL' | 'GENERIC' | string;
  disputeCategory: string;
  relevance: Array<{
    category: string;
    inventoryState: InventoryState;
  }>;
  footnote: 'CONFIGURATION_ONLY';
};
```

Query parameter on `GET`, never stored inside Passport identity. Changing Visa rules updates configuration, not historical Passports. Footnote:

> Relevance categories reflect the configured receiving-party workflow. PackProof does not determine evidentiary weight or dispute outcome.

## 13. Limitations (always present)

```ts
type PassportLimitations = {
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
  shippingTrackerInterpretation: 'OPEN_SOURCE_TRACKING_NUMBER_VALIDATION_NOT_CARRIER_CUSTODY';
  humanReviewDisclaimer: string;
};
```

Page 1 footer (frozen):

> Review the evidence and provenance on the following pages. PackProof does not determine fraud, fault, or liability.

## 14. Snapshots and PDF export

```ts
type PackProofPassportSnapshotV1 = {
  object: 'packproof_passport_snapshot';
  schemaVersion: 1;
  snapshotId: string;          // pps_...
  passportId: string;
  transactionId: string;
  snapshotVersion: number;     // monotonic per passport
  passport: PackProofPassportV1;
  canonicalPayloadSha256: string; // SHA-256 of JCS-canonical passport JSON
  rendererVersion: string;     // packproof-passport-pdf@MAJOR.MINOR.PATCH
  generatedAt: string;
};

type PackProofPassportExportV1 = {
  object: 'packproof_passport_export';
  schemaVersion: 1;
  snapshotId: string;
  format: 'PDF';
  presentationOnly: true;
  downloadUrl: string | null;
  downloadUrlExpiresAt: string | null;
  fileSha256: string;
  rendererVersion: string;
};
```

Today’s `evidence_report` / dossier PDF becomes this export. Native artifacts are unchanged. Existing `POST /v1/transactions/{id}/reports` may remain as a compatibility alias that snapshots the Passport and renders PDF.

PDF pagination (1.0 renderer):

| Page | Content | Omit when |
|---|---|---|
| 1 | Identity, integrity banner, transaction, expected↔observed, inventory chips, fulfillment strip, limitations footer | never |
| 2 | Item / interior / seal / label stills + packing-duration reference | no image artifacts; still show packing duration if video exists |
| 3 | Expected vs observed detail | never |
| 4 | Shipment + delivery | both shipment and delivery null **and** no tracking observation |
| 5 | Returns / post-transaction | `returns.length === 0` and no receiver evidence |
| Appendix | Artifact hashes, manifests, bundle digests, auth type, key ID, snapshot digest, verifier version, verification URL | never |

Do not embed packing video in the PDF. Reference `artifactId` and verification URL.

## 15. HTTP contract (additive)

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/v1/transactions/{transactionId}/passport` | Live aggregation; issues identity on first success |
| `GET` | `/v1/passports/{passportId}` | Same live aggregation by Passport id (`ppt_` or `PP-…`) |
| `POST` | `/v1/transactions/{transactionId}/passport/snapshots` | Freeze snapshot; idempotent |
| `GET` | `/v1/passports/{passportId}/snapshots/{snapshotId}` | Immutable snapshot JSON |
| `POST` | `/v1/passports/{passportId}/snapshots/{snapshotId}/exports` | PDF export of that snapshot |
| `GET` | `/v1/transactions/{transactionId}/review-package` | **Unchanged** compatibility resource |

Scopes: `evidence:read` for GET; `evidence:read` plus existing report write for snapshot/export.

`GET .../passport?framework=VISA&category=MERCHANDISE_NOT_RECEIVED` fills `reviewContext` only.

Compatibility: Connect `packproof.evidence.finalized` stays an evidence-artifact callback. A later `packproof.passport.updated` event is out of 1.0 unless explicitly scheduled.

## 16. Visual hierarchy (web and PDF Page 1)

Order is mandatory:

1. PACKPROOF + Proof display ID + QR
2. AUTHENTIC PACKPROOF banner + meaning sentence
3. Transaction (platform, order, amount, date, expected item one-liner)
4. Expected ↔ observed (SAME / DIFFERENT / NOT COMPARED only)
5. Evidence available chips (AVAILABLE / NOT AVAILABLE / NOT APPLICABLE / REVIEW REQUIRED)
6. Fulfillment chain
7. Limitations footer

Claims workers should understand the transaction in 10–20 seconds. Cryptographic appendix is not Page 1.

## 17. Frozen Passport 1.0 criteria

1. Stable Passport identity (`ppt_` + `PP-…`), never overloaded with order or transaction IDs.
2. Bound PackProof transaction.
3. At least one identified transaction/commerce source.
4. Source attribution for all imported commercial facts that are displayed.
5. At least one server-finalized PackProof evidence artifact.
6. Artifact hashes and manifest binding on finalized artifacts.
7. Immutable original source records or digests where applicable (commerce canonical payload SHA-256; artifact bytes).
8. Explicit expected-versus-observed distinction and comparison vocabulary.
9. Explicit provenance classification on material facts.
10. Evidence inventory using only AVAILABLE / NOT AVAILABLE / NOT APPLICABLE / REVIEW REQUIRED.
11. Chronological evidence timeline.
12. No evidentiary-weight score.
13. No fraud, fault, or liability determination.
14. Absence of evidence does not make a Passport less authentic.
15. Verification URL/QR linking presentation to the canonical Passport.
16. Versioned Passport schema (`schemaVersion: 1`).
17. Versioned export renderer (`rendererVersion`).
18. Clear limitations statement, including HMAC-is-not-a-signature and OSS-tracker-is-not-custody.

## 18. Implementation map (existing code)

| Passport domain | Application / domain source |
|---|---|
| Identity | New binder on `transactions/{id}` plus display-id generator |
| Integrity | `finalizeReceivedEvidence`, Evidence Format v2, artifact assurance |
| Transaction | `CommerceContextApplicationService`, transaction `source`, merchant transaction DTO |
| Expected items | `ItemDescriptor` + `fieldProvenance` |
| Observations | `MerchantEvidenceArtifactDto`, shippingLabel parse, `shippingTracker` |
| Comparisons | New pure function over expected + observations |
| Package & label | packing/seal types, `SHIPPING_LABEL`, tracker observation |
| Shipment & delivery | `MerchantShipmentDto`, `MerchantDeliveryDto` |
| Post-transaction | `MerchantReturnPassportDto`, buyer unboxing/delivery types |
| Inventory | Replaces `protocolCompleteness` booleans with four states |
| Artifacts | Existing evidence list; do not duplicate bytes |
| Timeline | `MerchantTimelineEventDto` + derived fulfillment events |
| Review context | New config module; not persisted on the Passport |
| Limitations | Extend `ReviewLimitations`; keep human-review disclaimer |
| PDF | Current `generateEvidencePacket` becomes snapshot renderer |

## 19. Explicit non-goals for 1.0

- Product authenticity, custody, or SNAD adjudication.
- Live UPS/FedEx/USPS custody APIs.
- Scoring Passports or hiding incomplete ones.
- Treating `passport_draft` as a Proof.
- Publicly verifiable asymmetric signatures (HMAC remains service-only).
- Embedding video in PDF.
- Storing destination PII on the Passport by default.
- Changing Connect webhook field names in the same change set.

## 20. Suggested implementation order

1. Domain types + passport identity binder + eligibility.
2. Aggregator service (pure projection) with unit tests on comparison and inventory states.
3. `GET /v1/transactions/{id}/passport`.
4. Snapshot + PDF renderer (Page 1 + appendix first).
5. Web Passport using the same DTO.
6. Optional review-context query projection.
7. Deprecate “dossier” product language in favor of Passport; keep `evidence_report` as the export object name until a versioned API bump.
