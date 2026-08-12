# Architecture decision records

Architecture decisions are immutable records. If a decision changes, add a new ADR that supersedes the old one; do not rewrite the old rationale into a different decision.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-incremental-layered-architecture.md) | Incremental layered architecture with ports and adapters | Accepted |
| [0002](0002-commerce-context-and-field-provenance.md) | First-class commerce context and field provenance | Accepted |
| [0003](0003-one-core-multiple-transports.md) | One application core for callable, REST, Connect and platform adapters | Accepted |
| [0004](0004-transactional-outbox-and-versioned-events.md) | Transactional outbox and versioned at-least-once events | Accepted |
| [0005](0005-generated-artifacts-and-release-provenance.md) | Generated-artifact and release-provenance boundaries | Accepted |
| [0006](0006-android-secure-capture-boundary.md) | Android is the current secure-capture platform boundary | Accepted |
| [0007](0007-physical-matcher-validation-gate.md) | Production physical matcher remains validation-gated | Accepted |
| [0008](0008-manifest-authentication-evolution.md) | Explicit HMAC boundary and versioned asymmetric evolution | Accepted |
