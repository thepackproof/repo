# Key registry v1

HMAC records must not be reinterpreted as public digital signatures ([ADR 0008](../adr/0008-manifest-authentication-evolution.md)).

Executable registry: `functions/src/domain/v1/key-registry.ts`.

| keyId | purpose | algorithm | verification policy |
|---|---|---|---|
| `packproof-manifest-v1` | Evidence manifest MAC | HMAC-SHA256 | `PACKPROOF_SERVICE_ONLY` |
| `packproof-connect-callback-v1` | Partner callbacks | HMAC-SHA256 | `SERVER_ONLY` |
| `packproof-merchant-pepper-v1` | API secret verify | HMAC-SHA256 | `SERVER_ONLY` |

Rotation adds a new keyId. Historical verification policy stays attached to the records that used the prior key.
