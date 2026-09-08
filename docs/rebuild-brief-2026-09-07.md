# Scheduly rebuild brief

Date: 2026-09-07. Audience: DarkMatter's internal social team and client accounts only.

## Decision

Rebuild Scheduly as a focused planning, approval and publishing product. Retain useful React components and workflow concepts, but replace the publishing lifecycle, authorisation boundaries and data model. Do not perform a cosmetic reskin and assume publishing is fixed.

The existing application is a substantial prototype: 285 tracked files, 72 MySQL migrations, React/Vite frontend, Express backend, MySQL and in-process cron, with local/R2 media storage. Source baseline: `03d4bc5b59ffc61e40a5b94d52e3a2135ce8bdef` in `DarkMatter-Projects/scheduly`. This assessment is a platform-wide source review with deeper examination of critical workflows. It is not an exhaustive line-by-line security audit or a successful live publishing certification.

The repository visibility stays unchanged, as requested. No production application, database, developer app, permission or social post was changed during this assessment.

## The product the team should use

Later's useful reference is its visual calendar, reusable media and collaborative planning. Its calendar supports planning across the requested networks; its publishing product is a reference for workflow rather than a promise of API feature parity. [Later calendar](https://later.com/social-media-content-calendar/), [Later publishing](https://later.com/social-media-publishing/).

1. **Today:** approvals waiting, posts due, failed or overdue deliveries, disconnected accounts and assigned work.
2. **Calendar:** client and channel filters, month/week/list views, drag-to-reschedule, explicit Africa/Johannesburg timezone by default, campaign labels and unscheduled drafts.
3. **Composer:** one campaign post with independently editable text, media order, crop, thumbnail, format and metadata for each destination. Clear account names and previews. Save drafts without having to publish.
4. **Approvals:** internal manager review and optional client sign-off. Approval applies to a specific content revision. Editing approved content invalidates its approval and pauses its scheduled delivery.
5. **Media library:** client folders, original files, reusable derivatives, search, tags, video metadata, rights/expiry notes and visible validation failures. Preserve the original rather than padding every uploaded image for Instagram.
6. **Publishing activity:** status per account, platform link, attempt history, retry only the failed destination, reconnect actions and manual hand-off tasks.
7. **Accounts and team:** client membership, publishing permissions, connection health, expiry and granted capabilities.
8. **Basic organic results:** verified published posts and available network metrics, with refresh time and unavailable metrics clearly labelled. Keep advanced reporting outside the launch critical path.

Exclude community inbox, comments/DM ingestion, sentiment monitoring, paid-ad management, custom dashboard builder and AI-generation expansion from v1. Internal comments on draft posts remain useful collaboration. Excluding a module means disabling its routes, jobs and unnecessary OAuth scopes, not just hiding a navigation item. Preserve legacy records until migration is reconciled.

## Architecture recommendation

| Layer | Recommended direction | Reason |
|---|---|---|
| Frontend | Retain React/Vite; introduce TypeScript incrementally; Vercel | Avoid an unnecessary framework rewrite while simplifying the workflow |
| Database/auth | Dedicated Scheduly Supabase project with explicit client memberships and RLS | This is an operational publishing product with credentials, rather than a reporting dashboard |
| API | Typed, validated API with central permission and workflow checks | Every write path must enforce the same approval/scheduling rules |
| Queue | Transactional outbox and durable Postgres queue | A committed schedule must survive restarts and deployments |
| Worker | Separate continuously running Node worker for media processing and publishing | Long video uploads must not depend on a browser tab or an HTTP request timeout |
| Storage | Private originals and derivatives; controlled expiring delivery URLs | Protect draft assets while allowing providers to fetch approved files |
| Providers | Adapter per network; evaluate a supported TikTok publishing provider | Keep scheduling semantics independent of provider-specific APIs |
| Operations | Error tracking, worker heartbeat, queue lag, alerts, database backups and restore drills | A page loading successfully is insufficient evidence of scheduler health |

Supabase Queues provides durable Postgres-backed delivery, and Storage supports RLS policies. These features do not guarantee exactly-once publication to an external social network. [Queues](https://supabase.com/docs/guides/queues), [Storage access](https://supabase.com/docs/guides/storage/security/access-control).

Use GitHub -> database migration -> application deployment, with the worker version tied to the same reviewed release. Select the worker hosting service after confirming existing infrastructure and costs. The current source documents Railway, but its live account, database, volume and backups were not verified. Do not migrate merely to replace working infrastructure; first inventory existing users, posts, account connections and assets.

## Data and publishing lifecycle

Core records: clients, client memberships, social accounts, encrypted OAuth grants, media originals, media derivatives, posts, post revisions, destination variants, approval decisions, scheduled deliveries, delivery attempts, provider events and audit events.

Every post and asset gets an explicit client owner. Each destination has a unique `(post_revision, social_account)` delivery identity. The parent post aggregates destination outcomes rather than overwriting them. Provider container IDs, upload session IDs and final published IDs are separate fields.

Workflow: `draft -> in_review -> approved -> scheduled`. Delivery: `queued -> uploading -> processing -> published`, with explicit `retry_wait`, `needs_attention`, `awaiting_manual_action`, `cancelled` and `unknown_outcome` states. A parent can be partially published. No destinations means unscheduled/draft, never published.

The schedule transaction validates membership, approval revision, active account, capability and media readiness, then records the delivery and outbox message atomically. The worker claims it with a lease, snapshots the approved payload, records the attempt and starts the provider operation. Persist operation identifiers before polling. A worker restart resumes an existing operation where supported.

Retry transient failures with bounded backoff and provider rate-limit guidance. Permission and media failures require action. A timeout after submission has an unknown outcome: reconcile it before another create request. An expired queue lease alone is not evidence that a post was never published. Do not claim guaranteed exactly-once posting where a provider does not offer an idempotent create operation.

Client approval links must expire, be revocable and bind to one revision. Record the external reviewer separately from the employee who created the link. Links cannot reset published, publishing or cancelled content. Store UTC timestamps plus the intended IANA timezone; validate DST and rescheduling behaviour.

## Delivery sequence and exit criteria

| Stage | Work | Exit criterion |
|---|---|---|
| 0. Baseline and access | Source audit, inspect live DB/assets, confirm app ownership, stable staging domains and provider route | Inventory reconciled; test accounts and credentials available securely |
| 1. Foundation | Client memberships, auth, validated APIs, revision-bound approvals, original media storage, CI | Two-client isolation and all role transitions tested; fresh environment reproducible |
| 2. Publishing engine | Transactional jobs, leases, provider operation tracking, retry/reconcile and status UI | Restart, duplicate invocation, partial failure and ambiguous timeout tests pass |
| 3. Meta pilot | Facebook Page and Instagram professional-account publishing, review materials | Approved test content publishes at its due time; native IDs and visible results verified |
| 4. Remaining channels | LinkedIn company Pages after access approval, YouTube after verification/audit, supported TikTok route | Per-format live acceptance tests pass for each enabled capability |
| 5. Team pilot and migration | One or two clients; compare schedules/results daily; train team; restore drill | Agreed pilot completes without unexplained missed or duplicate posts; rollback rehearsed |
| 6. Main-platform cutover | Reconcile all future jobs, pause old publisher, switch scheduling authority, monitor | Exactly one scheduler owns every destination; Jason approves final go-live |

Planning allowance: roughly 4-8 engineering weeks for a focused rebuild and pilot, subject to source reuse, team/account counts and live data complexity. This is an initial estimate, not a commitment. Platform reviews have independent timing and can block individual channels. Build and application-review preparation should run alongside one another.

Proposed operational targets for the pilot: due work begins within two minutes under normal load; actionable failures surface within five minutes; no duplicate post caused by an application retry in the exercised scenarios. Measure provider processing time separately. Set backup retention, recovery-time and recovery-point targets after the hosting inventory.

## Migration and rollback

Export the current schema, users/roles, client/account mappings, drafts, future schedules, published IDs, approvals and asset checksums. Do not copy token ciphertext without confirming its encryption key and format; favour a controlled reconnect where ownership is unclear. Import into staging, reconcile each object and asset, and compare rendered calendars for the same timezone/date range.

Rehearse restoring both data and media. Before switching production scheduling authority, pause the old scheduler and reconcile all in-flight provider operations. Never have old and new workers publishing the same queue. A rollback returns only unresolved deliveries after checking actual platform outcomes, so restoring a database backup cannot blindly repost content already live.

## Decisions still requiring real evidence

- Existing production login and database/storage access: current team usage and data have not been inspected.
- Access to the original Meta developer apps versus creating a dedicated replacement.
- Supported TikTok provider fit, number of connected profiles and budget. Ayrshare documents direct TikTok publishing and asynchronous status updates, but commercial suitability for this internal deployment must be confirmed before selection. [Provider documentation](https://www.ayrshare.com/docs/apis/post/social-networks/tiktok).
- Google Cloud account re-verification and the correct project/channel owner.
- Native `/review`, staging verification and tested rollback are release gates for implementation; no behavioural production change has been made in this assessment.

See [source findings](platform-findings-2026-09-07.md), [developer-app setup](developer-app-setup-2026-09-07.md) and [acceptance checklist](publishing-acceptance-2026-09-07.md).
