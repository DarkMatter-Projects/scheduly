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
- Google: dedicated project `scheduly-508008`, organisation darkm.co.za, account jason@darkm.co.za. YouTube Data API v3 enabled. OAuth consent configuration created after approved policy acceptance. OAuth client credentials, verification and upload audit are unfinished.
- LinkedIn: DarkMatter Social Scheduler `266161292`, Community Management Development Tier review in progress. This request pre-existed this build turn.
- TikTok: signed in; only DarkMatter Reporting Insights is currently listed. The private team/client use case must not be misrepresented as public SaaS to obtain Direct Post approval. Supported provider or manual handoff route remains to be selected.
- Supabase: dedicated Scheduly project `vymziezvqzpnxydakwmc` created in DarkMatter's Org, Ireland (`eu-west-1`), after explicit approval of US$10/month. Private schema and authenticated Edge gateway deployed.

## Next delivery gates

Complete portal review materials against the actual hosted product, configure hosted authentication and credentials securely, implement and test native provider adapters, verified analytics ingestion, media validation/derivatives, client approval links, role management, publishing retries/reconciliation, operational monitoring, backups and migration/rollback rehearsal. Jason approves the final production cutover. No existing live scheduler was changed.

## Review and browser evidence

Native Codex review was run twice. Findings led to retained composer checkpoints, stable save-operation identifiers and transactional response receipts, consistent post-before-delivery locking, complete image/video attachment review and clearing hidden search filters when changing pages. Account-specific reporting counts and exports now respect destination selection.

Observed in the in-app browser: a two-account sample saved its separate LinkedIn caption, retained its 2026-09-15 09:30 SAST proposed time, moved through review/approval/scheduling and created one job for each destination. Uploading an original image and saving the edit created revision 4, reset approval and cancelled both revision 3 jobs. Data survived the local API restart. Month/week/list views and client filters were exercised. Navigating from an unmatched content search to Analytics showed all 13 planned samples. No browser console errors were reported at the final composer check.

CSV export is implemented, but the in-app browser did not emit a download event, so receipt of the downloaded file is not verified. Viewport emulation confirmed a 390px document with no horizontal overflow and a readable list layout; expanded screenshot captures showed browser compositor tiling, so full desktop/mobile screenshot fidelity remains partially verified. The default desktop calendar and composer were visually compared with both generated concepts. No live social publishing or measured social analytics has been tested.

## Hosted foundation, 2026-09-08

Project URL: https://supabase.com/dashboard/project/vymziezvqzpnxydakwmc

The CLI-generated private-workspace migration was rehearsed against a fresh local database. All nine tables enabled RLS, anonymous/authenticated schema access was denied, and transactional rollback restored the empty database. Native review identified no actionable migration defect. Applied via the connected Supabase plugin and verified the same access restrictions live. Security advisors reported nine informational no-policy notices: intentional default-deny tables behind the server gateway. See https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy.

The `workspace` Edge Function verifies bearer tokens using Supabase `getUser`, requires verified non-anonymous users, and passes only that user ID into the existing membership-checked workflow. Gateway JWT verification is intentionally handled in the function body, allowing the current signing-key model; this is not anonymous data access. Both missing and forged tokens returned HTTP 401 in live dashboard tests. The first deployment hit an Edge Runtime environment-mutation restriction; version 2 removed that mutation and passed the live request tests. Database operations for a real signed-in user remain unverified until the login link is completed.

The real frontend uses explicit `VITE_WORKSPACE_*` configuration and a PKCE email-link login gate. The default preview remains local. Hosted preview runs on port 5176; Supabase's temporary site URL points to `http://127.0.0.1:5176/workspace.html`. Replace this with the reviewed hosted HTTPS callback before team rollout. Only a publishable key is used in the browser. No private credentials are committed. A first login email was requested for jason@darkm.co.za; confirmation is pending. The DarkMatter client container and Jason's manager membership were provisioned, with no posts or social credentials imported.

Sixteen automated tests, lint, hosted/local client builds and Deno checking pass. Native review of the gateway and login changes found no actionable defects. Hosted uploads and live scheduling are deliberately unavailable; native provider connections, analytics ingestion, hosted frontend deployment, team invitations and full login verification remain unfinished. The gateway rejects hosted schedule requests and keeps the approved content intact.

### Private media gateway

The private `scheduly-media` bucket is provisioned with a 20 MB limit and JPEG, PNG, WebP and MP4 allowlist. Workspace Edge Function version 3 adds verified-user uploads, client membership checks, server-generated object paths and five-minute preview links. Failed metadata writes remove the uploaded object. Routine snapshot polling preserves valid preview URLs and active video playback.

Validation: 20 platform behavioural tests pass; rebuilt workspace ESLint passes; hosted Vite build and Deno check pass. The legacy-wide lint command remains failing in old application files and generated output. Hosted upload success still needs a real confirmed user session; do not treat deployment as proof of an end-to-end upload. Native media review identified rotating video sources; the cache and playback fix addresses it.

Vercel import can find the repository, but currently selects `main`. The rebuilt branch must be selected before deployment; no legacy deployment was replaced.

### Hosted Team access, 2026-09-08

Added Admin, Editor, Content Creator and Viewer roles with independent client assignments, audited access changes, stale-update protection and last-Admin protection. Jason's verified hosted user is the initial Admin. The additive migration was rehearsed in a local transaction, including rollback and denied direct anonymous access, then applied to Scheduly. Edge Function version 5 enforces the verified-email team allowlist, role and ownership checks. Admins can grant access and request a sign-in email separately. The invitation action has not been used to email other team members.

22 behavioural tests, workspace lint, hosted build and Deno check pass. Native review identified initial Admin bootstrapping and role upload permissions; both were corrected. Public privacy and deletion instruction pages are included for developer app setup. Applications remain incomplete until actual connection/publishing flows and reviewer evidence exist.

### Developer portals, latest observed state

Meta support email, privacy policy, deletion instructions and Business and pages category were saved. App icon and working publishing review evidence remain outstanding; no submission was made. LinkedIn Community Management API remains under review. Requesting Share on LinkedIn produced an exclusive-product restriction, so no duplicate application or product change was made.

Google web OAuth client named Scheduly hosted workspace was created with the HTTPS workspace origin. Credentials are retained in ignored `.env.google.local`, mode 0600. No server redirect URI is configured yet. OAuth verification and YouTube upload audit are not submitted. TikTok Direct Post guidelines were rechecked and still exclude internal/private team upload utilities.

Vercel deployment for GitHub commit 9376d716 was READY. Public privacy page was opened successfully. The in-app and Chrome workspace tabs both showed sign-in, so the positive hosted Admin UI test still awaits the user's active browser session. Jason's confirmed email and active Admin row were verified directly in Supabase.
