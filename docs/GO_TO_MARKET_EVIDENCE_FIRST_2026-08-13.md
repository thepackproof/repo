# PackProof evidence-first go-to-market strategy

Status: `CONTROLLING_GTM_POSITIONING`

Effective: 2026-08-13

Product boundary: PackProof is neutral, evidence-based infrastructure for e-commerce. It helps participants create, preserve, organize, and selectively present a structured record. PackProof does not determine who is truthful, who is at fault, whether fraud or tampering occurred, or how a dispute, refund, chargeback, account action, insurance matter, marketplace case, or legal claim should be decided.

## 1. Launch thesis

PackProof does not need an SISV algorithm to deliver day-one value. The launch product is the evidence vault and protocol:

1. both participants review and confirm structured transaction terms;
2. the seller records a guided continuous packing video;
3. the seller visibly marks the label/package boundary with the designated `PP` mark, applies the prescribed clear tape or seal, and records a high-resolution reference view;
4. the buyer records the received package, the corresponding boundary and seams, and the unboxing sequence;
5. the app protects originals in an Android Keystore-backed encrypted queue when synchronization is interrupted;
6. the service independently records received bytes, computes SHA-256, creates a service-authenticated manifest, and records server receipt/finalization events; and
7. authorized participants can generate a concise dossier that links the transaction terms, timeline, evidence, provenance, integrity results, and limitations.

This creates a consistent, review-ready record that is materially different from an unstructured camera-roll upload. It does not prove scene truth, uninterrupted physical custody, item authenticity, or a guaranteed external outcome.

## 2. Initial customer and wedge

The first customer is an independent seller or small merchant handling high-value, low-frequency shipments where one disputed transaction is operationally significant. Initial categories should favor ordinary legal goods that can be documented safely without specialized regulated-item handling.

Primary jobs to be done:

- create a repeatable fulfillment record without building a custom evidence system;
- show what terms both participants confirmed;
- preserve a guided packing/unboxing sequence and exact finalized file fingerprints;
- retain evidence through intermittent connectivity;
- retrieve an organized dossier quickly when a support, marketplace, payment, insurance, or legal process requests documentation; and
- reduce ambiguity and post-purchase confusion by giving both participants access to the same structured record.

The product is not marketed as seller protection against buyers. It is a neutral record for both participants. The same protocol can document seller packing, buyer receipt/unboxing, returns, concerns, and cancellations.

## 3. Four launch value pillars

### 3.1 Visible protocol and deterrence hypothesis

The visible `PP` boundary mark, tape/seal protocol, participant invitation, and notice that a structured evidence record exists may discourage opportunistic misrepresentation by increasing the perceived effort and reviewability of a disputed transaction.

This is a hypothesis, not a launch performance claim. PackProof must not publish a deterrence percentage, fraud-reduction percentage, or claim that a participant will back down without a representative controlled study. Approved language is `designed to make the transaction record more deliberate, visible, and reviewable` or `may discourage opportunistic misrepresentation`. Prohibited language includes `cryptographic bluff`, `defeats 95% of fraud`, `90% of scammers back down`, and `fraud-proof`.

### 3.2 Review-ready dispute support

PackProof organizes reason-specific evidence for an authorized participant to submit through the applicable merchant, processor, issuer, marketplace, insurer, carrier, or legal process. Visa Dispute Condition 13.1 concerns merchandise/services not received, and 13.3 concerns merchandise/services not as described or defective. Mastercard uses its own current rules and documentation categories; Visa numbering must not be attributed to Mastercard.

PackProof does not claim that a claims agent has a fixed review time, that a dossier satisfies every network or platform requirement, or that the evidence causes a merchant-favorable result. Approved language is `organizes transaction and fulfillment evidence for review` and `may help an authorized participant respond with specific documentation`. The external decision-maker and current rules control the outcome.

The dossier roadmap should prioritize a concise first-page review summary followed by source-linked detail. Until that layout exists and passes visual QA, do not call the current dossier a one-page dossier.

### 3.3 Human-reviewable package observations

The day-one physical protocol is human-reviewable. PackProof preserves the seller's marked-and-sealed reference observation and the buyer's arrival/unboxing observations in a clear sequence. A reviewer may note visible continuity or variance in the mark, tape, seams, label, or cardboard.

PackProof itself must not state that a visible difference proves opening, substitution, reproduction, fraud, fault, or the responsible actor. It must not state that visual consistency proves the same package, unchanged contents, authenticity, or uninterrupted custody. Human observations remain contextual evidence interpreted by the authorized reviewer.

### 3.4 Optional carrier context, not a current backstop

The launch product records user-supplied carrier and tracking fields and may preserve photographed or scanned label observations. It has no contracted USPS, FedEx, UPS, carrier, aggregator, intake-scale, laser-dimension, possession, route, weight, or delivery telemetry integration.

Carrier weight or dimension data is a post-launch partnership/integration opportunity. If implemented, PackProof may record the source, time, correction history, measurement semantics, uncertainty, and comparison context. It must not claim that a weight difference `instantly exposes fraud` or identifies who caused it. Until a live contracted integration passes its separate gate, carrier telemetry must not appear in launch positioning.

## 4. Exact technical claim boundary

Approved current statements, only after the corresponding runtime gate passes:

- PackProof records a guided continuous video file produced by the native capture workflow.
- Online capture may include verified Firebase App Check / Play Integrity app context and device-key-possession evidence where available.
- Offline capture remains explicitly `OFFLINE_UNATTESTED` and is not upgraded retroactively.
- Client wall time is client-observed and untrusted; server receipt and finalization times are separately recorded.
- Optional GPS is client-observed context and does not prove capture location, custody, or scene truth.
- Android Keystore AES-256-GCM protects queued evidence subject to the documented device/key limitations.
- The server computes SHA-256 over the received original bytes, compares declared size and media type, and creates a service-authenticated manifest.
- A passing verifier demonstrates consistency among the supplied original, canonical manifest, and recorded digests under the stated format; it does not prove the physical scene or participant conduct.
- Evidence records and audit links are create-restricted and tamper-evident under the documented controls; PackProof does not claim absolute immutability against every privileged actor.

Prohibited or currently unsupported statements:

- Do not claim `hardware attestation proves the video was shot continuously`.
- Do not claim `Apple App Attest` for the current Android-only release.
- Do not claim an `atomic UTC capture timestamp`.
- Do not claim `GPS proves where the packing occurred`.
- Do not claim `the file has not been altered since the box was sealed`.
- Do not claim `the dossier proves the merchant's case`.
- Do not claim `claims agents decide in the merchant's favor`.
- Do not claim `Visa/Mastercard certified`, `Visa/Mastercard compliant`, or network endorsement.
- Do not publish any PackProof-specific fraud, deterrence, dispute-win, or chargeback-win percentage without representative independent evidence.
- Do not claim an `immutable timeline` without the bounded create-restricted/tamper-evident qualification.

## 5. Messaging hierarchy

Primary category:

> Neutral evidence infrastructure for e-commerce.

Primary promise:

> Create a shared, review-ready record from agreement through packing, arrival, and return.

Supporting pillars:

- **Shared terms:** both participants see and confirm the same structured record.
- **Guided fulfillment evidence:** continuous packing/unboxing workflows plus a visible human-reviewable seal protocol.
- **Resilient preservation:** encrypted offline retention and retry through server finalization.
- **Verifiable digital integrity:** server-computed hashes, manifests, and source-linked dossiers.
- **Faster evidence retrieval:** an organized record instead of scattered messages, receipts, and camera-roll files.

Mandatory qualifier:

> PackProof records and organizes evidence. It does not authenticate an item or person, prove scene truth or custody, determine fraud or fault, decide disputes, or guarantee acceptance or outcomes.

## 6. Launch channels and packaging

### Independent-seller launch

- guided Android app;
- two-party invitation and terms confirmation;
- packing, arrival/unboxing, and Return Passport evidence;
- private dossier download;
- simple per-transaction or launch-period pricing only after billing is implemented and tested; and
- education centered on the protocol, evidence retention, and limits rather than fear-based fraud claims.

### Merchant/platform launch

- PackProof Button for page-declared handoff;
- Merchant API for scoped transaction creation and participant claims;
- PackProof Connect for an exact tested callback path;
- reason-specific evidence export mapping maintained with processors/acquirers; and
- no promise that an integration changes network liability or guarantees representment success.

## 7. Evidence for the GTM claims

Before publishing quantitative efficacy claims, run an independently auditable pilot with pre-specified definitions and denominators. Track at minimum:

- invited, accepted, and completed transactions;
- successful seller and buyer capture rates;
- offline recovery and finalization rates;
- dossier generation and retrieval time;
- support contacts before formal disputes;
- dispute rate by reason/category and transaction cohort;
- evidence submission rate;
- external outcome by network/platform/reason code, without treating outcome as PackProof's decision;
- abandonment and accessibility rates;
- user-reported clarity and burden;
- privacy/consent withdrawal; and
- incidents, evidence loss, and verifier failures.

Do not infer causation from a before/after comparison without accounting for selection, merchant mix, value, channel, reason code, seasonality, policy changes, and other confounders. Any published rate needs counts, time window, population, exclusions, uncertainty, and an explicit no-guarantee statement.

## 8. SISV and dataset roadmap

SISV is a long-term research and enterprise differentiation opportunity, not a day-one dependency. The launch protocol may create high-resolution reference and arrival observations that are technically useful for later research, but production customer evidence is not automatically a training dataset.

SISV research requires:

- separate affirmative opt-in consent that is not required to use the core service;
- a clear research purpose and participant notice;
- collection minimization and redaction of labels, addresses, barcodes, faces, and unrelated surroundings where feasible;
- defined retention, withdrawal, deletion, access, and legal-hold behavior;
- separation between operational evidence storage and research datasets;
- dataset lineage, labeling, versioning, and access audit;
- representative same-source, different-source, environmental, device, material, damage, and reproduction populations;
- independent blind validation; and
- the permanent neutral-output and non-adjudication boundary in ADR 0009.

The commercial sequence is therefore:

`Evidence vault -> repeatable two-party protocol -> merchant/platform integrations -> measured workflow value -> consent-governed SISV research -> independently validated bounded observations`.

## 9. Release decision

The weekend release-candidate objective is the evidence vault and two-device protocol. The SISV algorithm is removed from the critical path. The `PP` mark, tape/seal sequence, high-resolution seller reference, buyer arrival observation, and human-reviewable dossier sequence remain in scope. Automated physical comparison remains hidden and `NOT_AVAILABLE`.
