# SISV physical observations - neutral, validation-gated evidence architecture

PackProof 0.8.5.0 includes the acquisition and evidence architecture required to research the whitepaper's proposed Stochastic Ink Spread Verification (SISV) layer. PackProof is neutral, evidence-based infrastructure for e-commerce. SISV is limited to preserving physical observations and, after separate validation, reporting bounded comparison measurements. It is not a fraud detector, tamper detector, authenticity service, custody proof, participant risk model, or dispute-adjudication system.

The current production API intentionally returns no similarity measurement or physical-comparison outcome because no frozen comparison engine, quality policy, observation policy, supported-population statement, or PackProof-specific blind validation corpus has passed the required gates.

## Non-adjudication boundary

SISV may eventually describe what the authorized comparison process observed under a named profile. It must not determine or imply:

- why an observed variance exists;
- when a physical change occurred;
- whether a package was opened, substituted, reproduced, damaged, or intentionally altered;
- which participant or third party caused an observation;
- whether a participant is honest, dishonest, suspicious, fraudulent, abusive, or at fault;
- whether an item, package, label, or person is authentic;
- whether custody was continuous; or
- whether a transaction, refund, return, chargeback, insurance matter, account action, marketplace case, or legal claim should be approved, denied, escalated, or resolved in a particular way.

Even after validation, the only permitted categorical SISV observations are:

- `CONSISTENT_WITH_REFERENCE` - the eligible observations were consistent within the recorded profile and thresholds; this does not prove identity, authenticity, custody, honesty, or absence of change;
- `VARIANCE_OBSERVED` - eligible observations differed beyond the recorded profile and thresholds; this does not identify cause, time, intent, actor, tampering, fraud, or commercial/legal significance;
- `INCONCLUSIVE` - the comparison could not support either bounded observation under the recorded policy; and
- `NOT_EVALUATED` - no authorized comparison was performed.

SISV output may be stored and presented as one evidence layer. It must not automatically change transaction, shipment, return, account, payment, refund, chargeback, claim, or legal state. Separate digital byte-integrity controls may continue to fail closed when the actual uploaded bytes, length, or media type do not match their authenticated reservation.

## Capture profile `PP-PHYSICAL-MATTE-V1`

The initial research profile is deliberately narrow: matte/low-gloss paper labels on ordinary paperboard/cardboard. It acquires three full-quality original JPEG frames from each of five required regions:

1. `LABEL_IDENTIFIER` - identifier/print/handwriting region.
2. `INK_EDGE_A` - first ink/toner-to-label transition.
3. `INK_EDGE_B` - second independent ink/toner-to-label transition.
4. `LABEL_BOX_BOUNDARY` - label-to-cardboard boundary bridge.
5. `ADJACENT_CARDBOARD` - local package substrate context.

The result is 15 independently hashed evidence objects. Each frame carries the profile/version, quality policy, intent (`REFERENCE` or `VERIFICATION`), capture group, region, frame index, acquisition attempt, and original image dimensions. Android also computes versioned measurement signals from a bounded down-sampled decode: luminance mean/dispersion, 5th/95th-percentile luminance, shadow/highlight clipping fractions, and Laplacian variance as a focus/sharpness proxy. These values are retained as `MEASUREMENT_SIGNAL_ONLY_THRESHOLDS_NOT_VALIDATED`; they are research inputs, not proof that a frame is usable. Client gating currently establishes only a minimum image-dimension condition. Validated focus, glare, perspective, lens coverage/obscuration, compression, material eligibility, and out-of-distribution thresholds remain future validation work, so the manifest truthfully reports acquisition quality as `NOT_EVALUATED`.

## Reference boundary

The app offers seller reference acquisition while the shipped transaction is `TERMS_LOCKED` or `PACKED`, and buyer verification acquisition in `SHIPPED`, `BUYER_REVIEW`, or `DISPUTED`. Server authorization binds reference frames to the seller and verification frames to the buyer. These role bindings establish service authorization only; they do not establish who caused a later observation. Because an encrypted offline capture may legitimately synchronize after a later transaction-state change, the backend does not treat upload time as capture time. The comparison service uses the earliest complete reference group so a later questioned package cannot silently replace the evidentiary foundation.

Online 15-frame sessions use one fresh App Check capture session bound to the capture profile, capture group, and maximum evidence count. Every frame still receives its own fixed request fingerprint, pending upload ID, and exact Storage path. Offline capture remains explicitly `OFFLINE_UNATTESTED`.

## Current observation behavior

`getPhysicalCorrespondenceStatus` currently exposes only:

- `NOT_EVALUATED` when a required reference or verification set does not yet exist;
- `ACQUISITION_INCOMPLETE` when the relevant acquisition set is incomplete under the profile; or
- `RESEARCH_ONLY / COMPARISON_NOT_ENABLED` after complete reference and verification sets are present.

The current endpoint does not produce a physical-comparison measurement. Its comparison artifact version, observation-policy version, and aggregate measurement remain null. Historical documentation may refer to reserved `MATCH` and `NON_MATCH` schema concepts; new SISV contracts must not use those terms as PackProof product outcomes. This prevents acquisition success from being misrepresented as identity, authenticity, custody, or a finding about participant conduct.

## Work required before enabling measurements

A future SISV comparison release must freeze region eligibility, registration, quality gates, extractor/model artifact hash, patch aggregation, device/substrate calibration strata, and the neutral observation policy before opening an independently controlled blind test. The release report must include false-consistency and false-variance behavior, acquisition failures, inconclusive rates, robustness-test outcomes, package-level independence, subgroup results, and appropriate confidence bounds. Print/scan, display replay, transplant, deliberate damage, and adaptive reproduction attempts are separate robustness populations. These measurements characterize the comparison method; they do not characterize either participant.

Any consumer-facing result must preserve the per-region observations, acquisition and eligibility states, policy and artifact versions, supported-population statement, uncertainty, and limitations. It must not collapse the record into an identity probability, authenticity score, tamper likelihood, fraud score, participant risk score, or recommended action.

Use `npm run validate:physical -- <dataset.json>` for the repository validation-analysis scaffold. It warns when the comparison artifact or observation policy is not frozen, when the dataset is not marked blind, and when repeated observations share independent physical units.
