# ADR 0002: Commerce context and field provenance

- Status: Accepted
- Date: 2026-08-11

## Context

PackProof must prepopulate a passport from product pages, listings, carts and orders without forcing users to retype descriptions. Directly copying browser text into mutable transaction terms would lose origin, allow later ambiguity and incorrectly elevate page data into an authoritative order or physical fact.

## Decision

Introduce a versioned `CommerceContext` resource containing a canonical snapshot, source trust class, external references, field-level provenance, digest, lifecycle and explicit order binding.

- Platform-API or merchant-server data may establish merchant/order assertions within its authorization scope.
- Page/JSON-LD data may prefill a draft only.
- Imported snapshots become immutable after claim or order binding.
- Participant additions/corrections are separate assertions with lineage.
- Listing images are references unless independently captured/finalized as evidence.
- Payment, buyer identity, custody, authenticity and legal relevance are never inferred from a commerce context.

## Consequences

The data model is richer than a description string, but enables reliable no-retyping UX, dispute reconstruction and adapter neutrality. Platform adapters must map into the canonical schema rather than preserve provider payloads as the public model.
