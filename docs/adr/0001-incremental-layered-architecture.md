# ADR 0001: Incremental layered architecture

- Status: Accepted
- Date: 2026-08-11

## Context

The current product has useful behavior distributed across Expo screens/providers, client libraries, Firebase callables/triggers, Firestore adapters and a newer merchant API service layer. A rewrite would put the functioning offline/native evidence path and compatibility records at unnecessary risk. Continuing to add policy to transports would deepen duplication.

## Decision

Migrate incrementally to domain, application, infrastructure and presentation/transport layers using ports and adapters.

- Domain policy has no Firebase, React, Expo or Express dependency.
- Application services orchestrate domain policy through ports.
- Firebase, device, storage, crypto, commerce and notification implementations are adapters.
- Mobile screens, callable functions, REST routes and Connect handlers are presentation/transport adapters.
- Existing implementations remain behind compatibility adapters until replacement behavior is characterized and accepted.

## Consequences

Migration temporarily adds translation code and parallel adapters, but it prevents parallel business rules. New core behavior requires domain/application tests. A legacy module may remain large until its transition matrix is characterized; file movement alone is not considered architectural progress.
