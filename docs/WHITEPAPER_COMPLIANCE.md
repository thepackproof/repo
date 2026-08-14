# White-paper compliance and release gates

This file translates the PackProof Technical Whitepaper, version 1.0 dated 7 August 2026, into engineering and release-review gates. It is a control checklist, not a claim that PackProof is certified, accredited, legally admissible, scientifically validated, or secure in every deployment.

The white paper reviewed a path- and date-bound 0.2.1 source snapshot without a repository commit identifier. Every `IMPLEMENTED` claim therefore still needs verification against the exact source revision, signed application build, backend configuration, and runtime environment being released.

## Non-negotiable current boundary

The reviewed snapshot did not contain a stochastic physical feature extractor, physical matcher, calibrated decision thresholds, or a PackProof-specific validation corpus. Until every applicable `MUST-PHYSICAL` and `VALIDATION` gate below has passed:

- production physical correspondence is `NOT_AVAILABLE`;
- an experimental implementation may be exposed only as `RESEARCH_ONLY`;
- the application, API, dossier, documentation, and sales material must not emit a production `MATCH` or `NON_MATCH` claim;
- no result may be described as authentic, genuine, unclonable, forensic-grade, zero-error, legally binding, chargeback proof, or universally supported.

PackProof's product scope is narrower than a generic physical-matching research program. PackProof is neutral evidence-based infrastructure for e-commerce. Even after SISV validation, its product-facing output is limited to `CONSISTENT_WITH_REFERENCE`, `VARIANCE_OBSERVED`, `INCONCLUSIVE`, or `NOT_EVALUATED` under a named profile. SISV must never infer cause, timing, intent, actor, authenticity, custody, fraud, fault, liability, participant risk, or a recommended transaction, payment, refund, chargeback, account, marketplace, insurance, or legal disposition. SISV observations must not automatically change workflow state.

`docs/CLAIMS_REGISTER.json` is the machine-readable claim baseline. A release that changes claim wording or capability status must update that register and attach the evidence that justifies the change.

## Gate meanings

| Gate | Release meaning |
|---|---|
| `MUST-NOW` | Required for an honest evidence-centric Android/backend release, even while physical matching is unavailable. |
| `MUST-PHYSICAL` | Required before physical comparison can be enabled outside research mode. Necessary, but not sufficient, for a performance claim. |
| `VALIDATION` | Scientific, statistical, operational, and adversarial evidence required before claiming physical-match performance. Software alone cannot satisfy it. |
| `THIRD-PARTY` | Requires evidence from an independent laboratory, assessor, security reviewer, provider, carrier, payment network, counsel, court, or other competent external party. |

## MUST-NOW release matrix

| ID | Exact white-paper heading | Required release behavior | Acceptance evidence |
|---|---|---|---|
| NOW-01 | **Document status and review boundary**; **2.2 Approved and prohibited formulations**; **Appendix D. Claim register** | Enforce claim classes and bounded wording across the UI, API, dossiers, documentation, and release material. | Claims-register review and automated prohibited-phrase scan pass. |
| NOW-02 | **1.4 Assurance layers** | Report acquisition quality, app/device context, byte integrity, physical correspondence, carrier context, and business/legal relevance independently. Never collapse missing or weak dimensions into one green `verified` state. | Contract/UI tests cover passed, failed, missing, offline, unsupported, and inconclusive combinations. |
| NOW-03 | **1.3 Explicit non-goals**; **13.6 Human interpretation** | State that PackProof does not by itself prove identity, contents, scene honesty, custody, fraud, legal outcome, or third-party acceptance. | Required caveats appear in high-consequence UI and every exported dossier. |
| NOW-04 | **4.1 Acquisition objectives** | Preserve original camera bytes and record capture profile, requested/observed regions, app/build/device/OS/camera metadata, time sources, online challenge/attestation, consent, hashes, and processing history. | End-to-end original-byte and required-field tests pass for online and offline capture. |
| NOW-05 | **4.5 Telemetry interpretation** | Treat motion, network, IP-derived region, and optional location as contextual signals only. Precise location is opt-in, purpose-bound, minimized, and excluded from shareable dossiers by default. | Consent-denied workflow succeeds; copy tests prohibit categorical human-presence, custody, or location-truth claims. |
| NOW-06 | **4.6 Original preservation and derived artifacts** | Keep originals, normalized data, patches, templates, scores, decisions, redactions, and presentation copies as distinct artifacts. Bind every derivative to its parent digest, transformation version, parameters, and environment. | Lineage traversal and derivative-reproduction tests pass. A PDF never replaces native evidence or its manifest. |
| NOW-07 | **6.2 Reviewed 0.2.1 evidence path**; **6.3 Hashing** | Use app-private capture staging, independently compute SHA-256 over exact original bytes on client and server, bind byte length/content type, and reject mismatches. | Real-device/backend end-to-end test, known-answer vectors, truncation/transcoding tests, and one-byte mutation test pass. |
| NOW-08 | **6.4 Authenticated encryption for offline queues** | Protect queued evidence with Android Keystore AES-256-GCM, a fresh unique IV, authenticated container metadata, verified tags, atomic state changes, and documented key-loss/restore/rotation behavior. | Tampered tag/header tests fail closed; crash/reboot/reinstall/backup/root/storage-exhaustion tests show no plaintext leakage or ambiguous success. |
| NOW-09 | **6.5 Canonicalization and manifest binding**; **Appendix A. Minimum evidence-manifest profile** | Publish a versioned manifest schema and use RFC 8785 JCS or a fully specified canonicalization profile with test vectors. Identify every field's provenance. | Cross-language canonicalization/schema vectors cover key order, Unicode, escaping, nulls, arrays, numbers, timestamps, algorithms, and incompatible versions. |
| NOW-10 | **6.5 Canonicalization and manifest binding** | Version the bundle binding. New formats should use a structured or domain-separated encoding; historical verification must retain support for the observed `SHA256(fileSha256 + "\\n" + manifestSha256)` format. | Cross-language known-answer and downgrade/algorithm-substitution tests pass. |
| NOW-11 | **6.6 HMAC versus digital signatures** | Describe HMAC-SHA256 manifests as PackProof-service-verifiable, not publicly verifiable. Preserve secret key versions for historical verification. | Copy review passes and records remain verifiable after controlled secret rotation. |
| NOW-12 | **6.7 Device and application attestation** | Server-verify provider verdict, nonce/challenge, app/account/request binding, expiry, and replay state. Keep attestation separate from physical-scene truth. | Replayed, expired, mismatched-app, emulator/root, invalid-token, and provider-unavailable tests produce explicit assurance states. |
| NOW-13 | **6.7 Device and application attestation** | Do not claim a remotely proven hardware-backed device key unless full Android Key Attestation chain, trusted root, challenge, security-level, and revocation validation is implemented. | Client `hardwareBacked` Boolean is treated as a signal; forged, revoked, software-level, and untrusted chains fail any future verified claim. |
| NOW-14 | **6.8 Time semantics**; **7.2 Assurance unavailable or weaker offline** | Label every time by source and uncertainty. A later server receipt must not upgrade an offline wall clock into a trusted capture time or online-attested state. | Clock-change, reboot, delayed-sync, and offline-to-online tests preserve `OFFLINE_UNATTESTED` acquisition provenance. |
| NOW-15 | **6.9 Immutability and privileged actors** | Use create-restricted/tamper-evident wording. Apply least privilege, separation of duties, monitored administrative/key use, separately administered audit export, evidence holds, and restoration-verification drills. | Privileged mutation exercise is detected and audited; destructive-role and restore-and-rehash tests pass. |
| NOW-16 | **7.3 Queue state machine**; **7.4 Offline validation tests** | Use explicit atomic/idempotent queue states. Bind retries and grants to one participant, transaction, evidence identity, immutable request fingerprint, byte set, and exact reserved path. Retain ciphertext until server finalization. | Fault matrix covers airplane mode, upload loss, process death, reboot, expired grant, corrupt container/tag, missing key, multiple captures, repeated sync, update/reinstall, and partial server failure without duplicate evidence. |
| NOW-17 | **10.7 Software verification** | Maintain deterministic vectors and security tests for hashes, canonicalization, authentication, manifest parsing, timestamp semantics, rules, authorization, replay, malformed media, parser/Unicode/length limits, webhooks, keys, privacy lifecycle, and model supply chain. | CI vectors pass and no unresolved critical release security finding remains. |
| NOW-18 | **12.1 Enterprise interface principles**; **13.3 Foundation package** | Enterprise APIs and dossiers expose structured evidence and provenance, not a single verdict. Preserve originals, manifests, hashes, verifier instructions, audit records, versions, time semantics, limitations, and custody gaps. | A clean-room reviewer can verify the evidence package without the production presentation app. |
| NOW-19 | **14.1 Data classification and minimization**; **14.2 Access and segregation**; **14.3 Retention and regional requirements** | Classify and minimize sensitive evidence. Enforce tenant/object isolation, least privilege, restricted support elevation, no public original URLs, short-lived/revocable sharing, per-class retention, regional policy, deletion, and legal hold. | Cross-tenant access, sharing expiry/revocation, deletion/hold, backup, and regional-storage tests pass. |
| NOW-20 | **14.4 Secure development and model governance**; **14.5 Incident response** | Produce SBOMs, signed/reproducible release evidence, reviewed source and dependencies, environment separation, vulnerability handling, and incident plans for evidence, credentials, keys, rules, models, thresholds, webhooks, and validation data. | Release provenance and incident tabletop are approved and linked from the release record. |

## MUST-PHYSICAL feature matrix

These gates allow a physical matcher to enter a frozen validation candidate. They do not authorize a production accuracy claim.

| ID | Exact white-paper heading | Required implementation | Acceptance evidence |
|---|---|---|---|
| PHY-01 | **3.2 The proposed composite fingerprint** | Version composite region profiles covering eligible label markings, ink/toner transitions, unprinted label texture, label/tape-to-cardboard boundaries, adjacent cardboard, seams/tape/folds, and repeated viewpoints as applicable. | Immutable profile schema records required/optional regions, geometry, coverage, and version. |
| PHY-02 | **4.2 Guided region protocol**; **4.3 Multi-frame acquisition** | Guide every required region, use a recorded fresh challenge online, and version multi-frame selection and computational-photography behavior. | Capture cannot complete without a region result; replayed/expired challenges fail; fixed frame sequences produce deterministic selections. |
| PHY-03 | **4.4 Quality gates** | Implement versioned per-region checks for focus, blur, exposure, glare, scale, perspective, coverage, occlusion, damage, compression, continuity, challenge completion, and eligibility. Record attempts, rejection reasons, abandonment, and FTA. | Golden boundary corpus and reason-code/state-machine tests pass; rejected attempts remain in operational denominators. |
| PHY-04 | **5.1 Region eligibility and substrate scope** | Check material/device/profile eligibility at enrollment and verification. Unknown or out-of-scope cases return `UNSUPPORTED` or `INCONCLUSIVE`, never a forced decision. | Runtime support matrix enforces validated, conditional, and unsupported combinations. |
| PHY-05 | **5.2 Registration** | Record transform, residual error, inliers, rejected areas, masks, deformation, and wrong-location checks. Do not use reproducible barcode/text layout as stochastic identity evidence. | Perspective/distortion/crease/wrong-location/excess-deformation tests pass or return inconclusive. |
| PHY-06 | **5.3 Feature extraction** | Version the extractor and feature schema; test and expose sensitivity to device, image pipeline, light, compression, operator, wear, replacement, replay, reconstruction, and transplant. Protect templates as sensitive derived evidence. | Deterministic feature vectors, leakage probes, authorization, retention, and deletion tests pass. |
| PHY-07 | **5.4 Patch scoring and robust aggregation** | Emit per-patch score, quality, eligibility, and diagnostics. Freeze fusion, minimum coverage, missing-data, clipping, normalization, outlier, contradiction, and tie rules. | Property tests cover zero/low coverage, missing patches, extreme scores, contradictory boundary evidence, and deterministic ties. |
| PHY-08 | **5.5 Damage tolerance** | Distinguish benign damage, material loss, repair/re-taping, transplant, deliberate feature removal, and damaged-looking impostors. Permit inconclusive rather than force a match. | Severity and selective-presentation corpus exercises every state and minimum-surviving-evidence rule. |
| PHY-09 | **5.6 Cross-device operation** | Maintain `VALIDATED`, `CONDITIONALLY_SUPPORTED`, and `UNSUPPORTED` states by device, camera path, OS/API, capture profile, and substrate. | Unknown or changed camera pipelines cannot inherit support silently. |
| PHY-10 | **5.7 Three-way decision rule** | Translate the research threshold model into neutral PackProof observations: `CONSISTENT_WITH_REFERENCE`, `VARIANCE_OBSERVED`, and `INCONCLUSIVE`, with separate acquisition, quality, eligibility, and policy states. Do not label raw similarity as probability, identity, authenticity, tamper, fraud, fault, risk, or disposition. | Exact threshold-boundary, floating-point, quality-failure, unsupported-state, neutral-copy, and no-workflow-side-effect tests pass. |
| PHY-11 | **8.6 Reference and model compromise** | Use stronger enrollment authorization, preserve original reference media, sign/version model and threshold artifacts, and create new derivative records for re-analysis instead of overwriting historical decisions. | Unauthorized reference replacement fails; two model versions yield two retained, independently verifiable result records. |
| PHY-12 | **Appendix B. Decision and reporting profile** | Bind every result to evidence hashes, registration/patch diagnostics, coverage, model/feature/calibration/threshold versions, decision, intended use, validation population, uncertainty, subgroup warnings, limitations, environment, and audit trail. | JSON Schema and golden dossier tests reject incomplete or unversioned results. |

## VALIDATION claim matrix

| ID | Exact white-paper heading | Evidence required before a production physical claim | Release condition |
|---|---|---|---|
| VAL-01 | **3.1 What prior research supports**; **3.5 Research results are not transferable performance claims** | PackProof-specific, package-level evidence on the actual target materials, devices, capture protocol, and operating conditions. | External literature is cited only as feasibility; PackProof metrics come only from the frozen PackProof study. |
| VAL-02 | **3.3 Optical resolution and the molecular-scale fallacy**; **3.4 Feature scales** | Calibrated-target measurements, repeated acquisitions, signal/spatial-band evidence, scale ablations, and device/content shortcut tests. | Unsupported fine scales and shortcut-dependent features are removed from the claim and model. |
| VAL-03 | **3.6 Falsifiable hypotheses** | Pre-registered tests of H1-H6: within/between-source signal, boundary incremental value, device/operator/site/environment limits, quality rejection, attack generalization, and change detection. | Every failed hypothesis narrows scope; it is not rewritten as a favorable claim. |
| VAL-04 | **9.1 Unit of analysis and independence** | Package/physical-source-level sampling and cluster-aware inference. Split at package, batch, printer, device, operator, site, and time where relevant. | No frames from one package cross partitions; pair counts are not represented as independent package trials. |
| VAL-05 | **9.2 Required metrics**; **9.3 ROC, DET, and three-way decisions** | FMR, FNMR, same/different inconclusive rates, FTA, FTE, attack success, repeatability, reproducibility, ROC/DET, operating points, counts, and intervals. | Pre-registered conditional and end-to-end denominators reconcile every attempted acquisition. |
| VAL-06 | **9.4 Confidence bounds and the rule of three** | Exact or defensible confidence intervals reflecting independent units, clustering, and sampling design. | Zero observed errors are reported with bounds; combinatorial comparisons are never treated as independent trials. |
| VAL-07 | **9.5 Threshold selection and overfitting control** | Before blind-data access, freeze eligibility, quality, preprocessing, registration, masks, failure handling, extractor/model, fusion, strata, thresholds, metrics, subgroups, attacks, interval methods, criteria, and change rules. | The frozen package is hashed/timestamped. Any post-unblinding change requires a new blind confirmation set. |
| VAL-08 | **9.6 Calibration and prevalence**; **9.7 Subgroup and worst-case reporting** | Held-out calibration if probability output is offered; report material, manufacturer, device, OS/API, operator/accessibility, site, environment, damage, online/offline, device relationship, and attack subgroups with uncertainty. | Material subgroup degradation blocks release even if aggregate metrics pass. |
| VAL-09 | **10.2 Phase-gated plan**; **10.3 Dataset design** | Complete scope, feasibility, acquisition, robustness, adversarial, blind-confirmatory, prospective-field, and change-control gates using a representative, blinded, leakage-controlled corpus. | Each gate has signed evidence and exit approval; failure narrows support or returns the system to development. |
| VAL-10 | **10.4 Measurement-system analysis**; **10.5 Environmental and durability study** | Characterize scale, distortion, sharpness, noise, exposure, color/light, compression, focus, frame selection, quality/eligibility gates, transit, aging, heat/cold, moisture, UV, abrasion, crease, dirt, tape, and combined exposures. | Reports include attempts, abandonment, gate sensitivity/specificity, repeatability/reproducibility, severity, elapsed time, and subgroup outcomes. |
| VAL-11 | **10.6 Adversarial validation** | Independent black-box and informed attacks covering print/scan, screen replay, reconstruction/generation, label reuse, boundary transplant, overlays/coatings/damage, partial presentation, reference compromise, relay, and camera injection. | Attack success is reported by capability, equipment, knowledge, attempts, feedback, time, and cost; adaptive iteration is included. |
| VAL-12 | **10.8 Independent replication and release gates** | Independent custody of the blind protocol/corpus, frozen executable/build/model/thresholds, reproducible originals/manifests, all primary criteria passing, no unresolved critical security finding, and approved residual risk. | Independent report and signed release decision exist. A schedule or marketing deadline cannot waive the gate. |
| VAL-13 | **10.9 Ongoing performance monitoring** | Monitor acquisition/inconclusive rates, score/calibration drift, reviewed mismatches, attacks/probing, device/OS/camera changes, cryptographic/logging health, subgroup disparities, and verifier failures. | Alert, rollback, impact-assessment, and targeted/full revalidation triggers are approved before production enablement. |

## THIRD-PARTY and external-dependency gates

| ID | Exact white-paper heading | External evidence or decision required | Claim boundary |
|---|---|---|---|
| EXT-01 | **6.6 HMAC versus digital signatures** | Independent cryptographic design review and, when external verification is a product feature, KMS/HSM-backed asymmetric signing with published verifier/key status. | Current HMAC is service-verifiable only. Citing FIPS does not establish compliance. |
| EXT-02 | **10.7 Software verification**; **15.3 Cryptographic and evidence hardening** | Independent mobile/cloud penetration test, configuration review, dependency review, and cryptographic assessment. | Internal tests alone do not prove the system secure. |
| EXT-03 | **10.8 Independent replication and release gates** | Independent laboratory or academic replication of the frozen physical method. | Developer-selected or post-score-excluded trials cannot support a confirmatory claim. |
| EXT-04 | **11.1 How to read the mapping**; **11.2 Forensic collection and interpretation** | Scope-specific assessment against current normative text by a competent body; laboratory accreditation where applicable. | Standards mapping is not certification, accreditation, conformity, or endorsement. |
| EXT-05 | **11.3 Cybersecurity and cryptography** | Where a customer requires FIPS-validated modules, verify the exact module, certificate, mode, operational environment, and cryptographic boundary. | Use of a named algorithm is not module validation. |
| EXT-06 | **11.4 GS1 interoperability** | Identifier/vocabulary/event/query/signature implementation and applicable GS1 conformance testing. | Digital Link does not authenticate an object; current HMAC is not a GS1 public-signature profile. |
| EXT-07 | **12.2 Carrier evidence** | Contracted carrier/aggregator source, event semantics, correction handling, and provider conformance for possession, route, weight, or delivery claims. | A photographed or scanned tracking number proves only an observation under its stated normalization rule. |
| EXT-08 | **12.3 Payment and marketplace disputes** | Representative independently auditable outcome study by reason code, network, region, merchant type, and policy version for any historical outcome statistic. | PackProof never guarantees an issuer, network, or platform result. |
| EXT-09 | **13.1 Authentication is not admissibility**; **13.2 Expert-method reliability** | Case-specific foundation, qualified counsel/expert evidence, and decision by the relevant court or tribunal. | PackProof cannot promise legal validity, admissibility, or evidentiary weight. |

## Locked formulas and semantics

- Original and stored bytes: SHA-256 over the exact native byte stream before any decode/re-encode.
- Offline queue: AES-256-GCM with unique IVs and verified authentication tags.
- Historical reviewed bundle: `SHA256(fileSha256 + "\n" + manifestSha256)`; new schema versions should use an unambiguous structured or domain-separated binding.
- Conceptual patch fusion: `S = sum(w_i * q_i * s_i) / sum(w_i * q_i)`, where local score, bounded quality, region weights, minimum coverage, and all edge behavior are frozen. The paper permits another robust fusion method only if it is specified and validated.
- Research threshold notation may retain `T_nonmatch` and `T_match` for reproducibility, but PackProof product semantics are neutral: `S <= T_nonmatch` maps only to `VARIANCE_OBSERVED`; `T_nonmatch < S < T_match` maps to `INCONCLUSIVE`; and `S >= T_match` maps only to `CONSISTENT_WITH_REFERENCE`, after eligibility, quality, and coverage pass. None of these states establishes cause, actor, authenticity, custody, fraud, fault, liability, risk, or disposition.
- Zero-event one-sided 95% bound: `p_upper = 1 - 0.05^(1/N)`, approximately `3/N` for independent Bernoulli trials. Shared packages, sessions, devices, or operators require cluster-aware inference.

No fixed performance target is supplied by the white paper. Each intended use must pre-register its own consequence-appropriate targets and confidence requirements.

## Release evidence record

Every release review should record:

- source commit or immutable source-archive hash;
- dependency lock, SBOM, native/app/backend build identifiers, and reproducible artifact evidence;
- APK package, version name/code, SDK/ABI metadata, size, and SHA-256;
- Firebase/project/environment identity and configuration/rules deployment evidence;
- manifest, canonicalization, capture-profile, queue-container, model, feature-schema, threshold-policy, and key versions;
- real-device startup, capture, offline, synchronization, server-finalization, access-control, and dossier-verification results;
- claims-register diff and approval;
- explicitly disabled, research-only, conditional, and validated capabilities;
- unresolved findings, accepted residual risk, rollback path, and revalidation triggers.

Passing compilation, static inspection, installation, or a prior build report is intermediate evidence. It does not replace runtime, production-configuration, scientific, security, or independent validation required by the applicable gate.
