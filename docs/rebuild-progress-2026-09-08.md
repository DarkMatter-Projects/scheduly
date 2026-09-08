# Rebuild progress

2026-09-08. Branch `codex/scheduly-rebuild`.

The new workspace is an additive, local rehearsal application. The original deployment entry points remain unchanged. This is the first functional foundation, not a claim that the platform is ready for client publishing.

Implemented: new calendar/month/week/list, shared client/account/status/search filters, content list, revision review, per-account caption composer and preview, private local original media library, proposed SAST time, manager scheduling, cancellation, operational reporting and CSV export. Social performance metrics remain unavailable until verified provider ingestion is connected.

Data persists in local PostgreSQL 17. Each write verifies client membership. Post edits create revisions, invalidate approval and cancel the previous queued deliveries in one transaction. Optimistic revision checks prevent stale updates. Schedule calls are serialised and create unique destination jobs. Unknown provider outcomes block edits/cancellation. Due rehearsal jobs become needs-attention; no provider can be called by this server. Production startup is deliberately disabled. Hosted auth, provider integration and app acceptance are unfinished.

## Start locally

Use Node 24 or later and Docker.

```sh
docker compose -f platform/compose.yaml -p scheduly-rebuild up -d --wait
npm --prefix platform ci
cd platform
LOCAL_REHEARSAL=1 npm start
```

In a second terminal, from `client`:

```sh
npm ci
npx vite --config vite.workspace.config.js
```

Open `http://127.0.0.1:5175/workspace.html`. The API binds to loopback port 4319. The local database uses port 55439 and contains fictional sample clients. Do not import live credentials or client schedules into this rehearsal. Local media lives in ignored `platform/.data/media`. A browser refresh and API restart preserve records.

## Validation

Thirteen automated tests currently pass against a separate local PostgreSQL test database. Create it once with `docker compose -f platform/compose.yaml -p scheduly-rebuild exec -T database createdb -U scheduly scheduly_test`, then `npm --prefix platform test`. They cover client isolation, approval permissions, empty targets, revision invalidation, duplicate scheduling, stale saves, media ownership, unknown outcomes, honest rehearsal delivery state, partial-save recovery, lost-response idempotency and reconciliation lock ordering.

## Application setup observed

- Meta: dedicated Scheduly app `1557802719481548`, business DarkMatter PTY LTD, Instagram and Pages use cases, Tech Provider classification. Registration complete; app remains unpublished. Access verification and App Review not yet submitted.
- Google: dedicated project `scheduly-508008`, organisation darkm.co.za, account jason@darkm.co.za. YouTube Data API v3 enabled. OAuth consent configuration, credentials, verification and upload audit are unfinished.
- LinkedIn: DarkMatter Social Scheduler `266161292`, Community Management Development Tier review in progress. This request pre-existed this build turn.
- TikTok: signed in; only DarkMatter Reporting Insights is currently listed. The private team/client use case must not be misrepresented as public SaaS to obtain Direct Post approval. Supported provider or manual handoff route remains to be selected.
- Supabase: no existing Scheduly project. Organisation/cost confirmation required by the Supabase tool before creating a dedicated hosted project. Local foundation continues independently.

## Next delivery gates

Complete portal review materials against the actual hosted product, configure hosted authentication and credentials securely, implement and test native provider adapters, verified analytics ingestion, media validation/derivatives, client approval links, role management, publishing retries/reconciliation, operational monitoring, backups and migration/rollback rehearsal. Jason approves the final production cutover. No existing live scheduler was changed.

## Review and browser evidence

Native Codex review was run twice. Findings led to retained composer checkpoints, stable save-operation identifiers and transactional response receipts, consistent post-before-delivery locking, complete image/video attachment review and clearing hidden search filters when changing pages. Account-specific reporting counts and exports now respect destination selection.

Observed in the in-app browser: a two-account sample saved its separate LinkedIn caption, retained its 2026-09-15 09:30 SAST proposed time, moved through review/approval/scheduling and created one job for each destination. Uploading an original image and saving the edit created revision 4, reset approval and cancelled both revision 3 jobs. Data survived the local API restart. Month/week/list views and client filters were exercised. Navigating from an unmatched content search to Analytics showed all 13 planned samples. No browser console errors were reported at the final composer check.

CSV export is implemented, but the in-app browser did not emit a download event, so receipt of the downloaded file is not verified. Viewport emulation confirmed a 390px document with no horizontal overflow and a readable list layout; expanded screenshot captures showed browser compositor tiling, so full desktop/mobile screenshot fidelity remains partially verified. The default desktop calendar and composer were visually compared with both generated concepts. No live social publishing or measured social analytics has been tested.
