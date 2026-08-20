# ADR 0013: Transaction Intake Layer over commerce_context

- Status: Accepted
- Date: 2026-08-19

## Context

Sellers already have transaction evidence in email receipts, order pages, share sheets, browser DOMs, screenshots, and eventually marketplace APIs. Asking them to retype SKU, variant, buyer, and order number is the friction PackProof should not charge. Direct marketplace partnerships are not required to capture most of that evidence.

The repository already has the destination model: a versioned `commerce_context` with field provenance and `canonicalPayloadSha256` (ADR 0002), adapter neutrality (ADR 0003), and Passport copy that distinguishes source assertions from PackProof observations. It does not yet have a consumer intake path, a trust class for seller-provided correspondence, or a capture-bound freeze of the import the session was started against.

Naming a new `CanonicalTransaction` or `EbayOrder` resource would fork the domain. Treating an eBay sold-email as `PAGE_DECLARED` would hide it from Passport order context. Treating it as `PLATFORM_API_ATTESTED` would overclaim. Gmail/Outlook mailbox OAuth is the right event model for later automation and is not an Android 1.0 launch item (`agent.md` remains the execution control).

## Decision

Transaction intake is a set of adapters over the existing `commerce_context` snapshot. It is not a second transaction type and not a live `transaction` row.

```text
GmailReceiptAdapter
OutlookReceiptAdapter
ShareSheetAdapter
BrowserExtensionAdapter
ScreenshotImportAdapter
MarketplaceApiAdapter [future]
        ↓
TransactionNormalizer (application service)
        ↓
commerce_context  (immutable imported snapshot)
        ↓
passport_draft    (confirm only missing fields)
        ↓
transaction       (user starts PackProof)
        ↓
evidence_session intake freeze at CAPTURING
        ↓
PackProof Passport
```

A detected order is a context plus draft. Tapping Pack & Protect creates the transaction and opens capture. Marketplace identity stays a field (`source.platform` / `source.platformIdentifier`), never a resource kind.

### Trust

Add `USER_PROVIDED_COMMERCE_ARTIFACT`:

| Trust class | Prefill | Passport order context | Authoritative `ORDER_BOUND` |
|---|---|---|---|
| `MERCHANT_SERVER_ATTESTED` | Yes | Yes | Yes, with external order ID |
| `PLATFORM_API_ATTESTED` | Yes | Yes | Yes, with external order ID |
| `USER_PROVIDED_COMMERCE_ARTIFACT` | Yes | Yes, as `SOURCE_ASSERTION` | No |
| `PAGE_DECLARED` | Yes | No (draft lineage only) | No |

Approved Passport language for user-provided intake: PackProof received transaction metadata from seller-provided commerce correspondence. PackProof does not verify that the buyer purchased the item.

Consumer adapters map as follows:

- email receipt, share sheet, screenshot, PDF → `USER_PROVIDED_COMMERCE_ARTIFACT`
- browser extension and PackProof Button → `PAGE_DECLARED`
- merchant/platform APIs → existing attested classes
- Android notification listener → trigger only, never the canonical record

Bank/card scraping is out of scope. Inbox-wide generative reading is forbidden; parsers are versioned and deterministic.

### Freeze at capture

`commerce_context.canonicalPayloadSha256` hashes the normalized snapshot. Intake also records `originalArtifactSha256` for the source bytes (MIME, share payload, PDF, or API body).

When an evidence session enters `CAPTURING`, copy both hashes onto the session and set `intakeFrozenAt`. After that instant the freeze is immutable. Later context supersession must not rewrite what capture was started against. Legacy sessions without hashes may freeze with null hashes; new intake must supply the original artifact hash.

### Sequencing

Mailbox push (Gmail `users.watch`, Microsoft Graph mail subscriptions) is a later adapter over the same normalizer. The first email path is share/import of the message into the same parsers. This ADR does not authorize Gmail/Outlook OAuth on the Android 1.0 critical path.

## Consequences

- Domain and Passport tests must reject `ORDER_BOUND` for user-provided artifacts, including those that carry an extracted order number.
- User-provided contexts may satisfy Passport issuance as an identified commerce source without becoming merchant- or platform-attested.
- Capture redeem must persist intake freeze fields. Application intake creates `CREATED` contexts and `READY_FOR_REVIEW` drafts; it does not create transactions.
- Field provenance may record `extractionMethod`, `extractionQuality`, and `sourceArtifactSha256` without rewriting existing required keys. `extractionQuality` is parser extraction quality (`EXACT_LABELED`, `FORMAT_MATCH`, `HEURISTIC`), not evidentiary truth. High-confidence fields may autofill; heuristic fields get one lightweight confirmation. Do not make users confirm every field.
- Multi-item `items[]` on the context remains a later additive schema change; v1 keeps the current singular `ItemDescriptor`.
