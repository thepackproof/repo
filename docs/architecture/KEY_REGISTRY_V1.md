# Key registry v1

HMAC records must not be reinterpreted as public digital signatures ([ADR 0008](../adr/0008-manifest-authentication-evolution.md)).

| keyId | purpose | algorithm | verification policy |
|---|---|---|---|
| `packproof-manifest-v1` | Evidence manifest MAC | HMAC-SHA256 | `PACKPROOF_SERVICE_ONLY` |
| Connect callback HMAC | Partner callbacks | HMAC-SHA256 | service verification |
| Merchant API credential pepper | API secret verify | HMAC | server-only |

Rotation adds a new keyId. Historical verification policy stays attached to the records that used the prior key.
