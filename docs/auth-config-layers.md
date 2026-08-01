# Auth config layers

OutlabsAuthUI must stay honest about what this console can change versus what the
host deploy owns. Use three layers; do not invent free-form feature-flag CRUD in
the SPA.

## Layers

1. **Deploy-time AuthConfig (`GET /auth/config`)**  
   Preset, capability flags, and advertised auth methods. Changed by host env /
   restart. The Settings **Runtime capabilities** panel is read-only.

2. **Mutable typed config (DB + Settings)**  
   Day-2 org vocabulary that does not reshape auth methods or authz shape. Today
   that is entity types via `GET/PUT /config/entity-types`. Superusers may edit;
   everyone may read when the backend exposes it.

3. **Host-only secrets and transport**  
   OAuth client secrets, Twilio/Mailgun credentials, SMTP wiring. Never stored in
   the library DB and never edited from this console. Host `.env` / secret manager
   remains the recipe.

## Rules of thumb

- Changing login methods, hierarchy, ABAC, or API-key capability → deploy-time
  AuthConfig.
- Changing structural / access-group type vocabulary → DB Settings (entity-types
  pattern).
- Provider credentials or delivery transport → host only.

If a future knob becomes runtime-mutable, it needs a **typed** `/config/<key>`
contract, explicit precedence, audit events, and an allowlist — not a generic KV
feature-flag UI.

## Current decision

Phase 1 (honesty panel + entity-types) is the end-state for this console until the
backend adds a typed allowlist API. Do not expose `feature_flags` KV editing from
OutlabsAuthUI. The library may keep `ConfigKeys.FEATURE_FLAGS` reserved; that is
not a console product surface.

## Related

- SPA shell/API target config: [`runtime-configuration.md`](./runtime-configuration.md)
- Coverage status: [`progress/coverage-audit.md`](./progress/coverage-audit.md)
