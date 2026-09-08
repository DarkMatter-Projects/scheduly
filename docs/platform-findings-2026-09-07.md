# Platform findings

Date: 2026-09-07. Baseline: `03d4bc5b59ffc61e40a5b94d52e3a2135ce8bdef`.

## Coverage and limits

All 285 tracked files were retrieved through the connected GitHub plugin and their Git blob hashes verified. The source tree and exact source commit were reconstructed as a shallow local checkout. The platform surface comprises 72 migrations and 107 backend JavaScript files. Routes, jobs, data structures, dependencies and frontend workflows were inventoried; publishing, approvals, media, OAuth and authorisation received deeper inspection. Reporting and community modules were assessed for scope and dependencies, not exhaustively validated.

Live observations: the deployed landing page and sign-in page load; the authenticated app was unavailable without login. Meta and LinkedIn developer inventories were accessible; TikTok and Google Cloud need sign-in/re-verification. No live post, production database query, migration or privileged application write was performed. Findings below do not assert that a particular client incident has occurred.

## Confirmed diagnostic reproductions

Run `node --test audit/reproduce-baseline.cjs`. Seven tests execute unchanged service/job code with isolated database/provider stubs. They confirm the defective behaviour, so a passing diagnostic is not a passing acceptance test. Real MySQL transactions, concurrency and external provider responses are not covered by these stubs.

| Priority | Finding | Evidence and reproduction | Required correction |
|---|---|---|---|
| P1 | Editors can schedule through the edit endpoint | `routes/posts.routes.js` permits editors to PUT; `post.service.js:updatePost` accepts `scheduledAt` and changes status to scheduled for an editor's own post | Centralise transitions; enforce manager/publisher permission on every path |
| P1 | Approved content can change without new approval | `updatePost` rejects published/publishing only and leaves approved status unchanged after content edits | Immutable revisions; invalidate approvals and queued deliveries when publishable content changes |
| P1 | An unused approval link can reset a published post | `post_approval_tokens.service.js:recordDecision` forcibly sets any non-pending status to pending approval | Bind links to revisions and allowed states; transactional single-use consumption |
| P1 | A post can be marked published without a platform call | `publishJob.js` treats zero pending targets as a successful local-only publication | Derive outcomes from all targets and verified provider evidence; distinguish draft/no-target and completed attempts |
| P1 | Token refresh uses Facebook for every network | `tokenRefreshJob.js` selects all expiring active social accounts and dispatches `refreshLongLivedToken` without a platform branch | Provider-specific refresh/reconnect with account-level locking |
| P1 | TikTok fallback stores refresh-token plaintext | `tiktok_posting.service.js:ensureFreshAccessToken` decrypts the old token when the response omits a replacement and writes that value to the encrypted column | Preserve existing ciphertext; verify encryption round trips and rotation |
| P2 | Target changes are unsupported in the update contract | `updatePost` ignores `targetAccountIds`. The edit screen derives selected targets but does not send a changed target list | Explicit transactional destination editing, validated for client ownership and publication state |

## Further source-backed reliability gaps

| Area | Finding | Source |
|---|---|---|
| TikTok outcome | `publish_id` from initial acceptance is immediately stored as a published post ID. A manual status GET can mark a target failed, but does not reconcile the parent or persist the final public ID | `publisher.service.js`, `tiktok_posting.service.js`, `posts.controller.js:refreshTiktokTargetStatus` |
| Worker recovery | Atomic scheduled-to-publishing update prevents a simple double claim, but there is no lease expiry or recovery path for a process killed after claiming. Failed targets have no durable retry orchestration | `jobs/publishJob.js`, `jobs/scheduler.js`, migration 005 |
| Partial results | Some destinations can publish while the parent becomes failed. The target enum has only pending/published/failed, with no processing or unknown-outcome state | `publisher.service.js`, migration 005 |
| Deployment health | Migration failure is explicitly non-fatal. `/api/health` reports OK independently of DB availability and is the deployment health check | `server/start.sh`, `server/src/app.js`, `railway.json` |
| LinkedIn | Account identity and author URN are always personal; no organisation discovery or company-Page author dispatch | `config/linkedin.js`, `services/linkedin.service.js:authorUrnFor` |
| YouTube | Upload completion returns a video ID without checking processing and actual visibility. Quota estimate counts successful posts only in a rolling window, using a hardcoded historical upload cost | `youtube.service.js`, `config/youtube.js` |
| OAuth | Pending OAuth state is kept in one process Map; restarts or callbacks reaching another instance lose state | `controllers/social.controller.js` |
| Client boundaries | Post reads and social account lists lack membership checks; client filters are caller-supplied. Posts derive client association through targets rather than direct client ownership | `posts.controller.js`, `post.service.js:listPosts`, `social.controller.js:listAccounts`, migration 005 |
| Session lifecycle | Middleware trusts signed role claims without checking current active status or session revocation; deactivation/password change does not invalidate existing JWTs | `middleware/auth.js`, `auth.service.js`, `user.service.js` |
| Media | Images are padded/resized for Instagram and the original can be overwritten/deleted. This loses reusable originals and is unsuitable as one universal derivative for Stories and other formats | `media.service.js:processUpload` |
| Validation | TikTok duration check references `durationSeconds`, but the publisher media mapping does not populate it. LinkedIn document UI is present while upload MIME allowlist excludes documents | `publisher.service.js`, `middleware/upload.js`, `PostCreatePage.jsx` |
| Payload model | One shared caption/media set and many platform columns live on the post. There are no independent destination revisions | `post.service.js`, migrations 005/027 onwards |
| Unnecessary access | Facebook OAuth requests messaging and advertising scopes; Instagram requests messaging/comments scopes. Jobs for community and ads run by default | `config/facebook.js`, `config/instagram.js`, `jobs/scheduler.js` |
| Maintainability | Composer is roughly 100 KB; reporting widget renderer about 94 KB. README describes only two networks and deployment documentation names the former owner | `PostCreatePage.jsx`, `WidgetRenderer.jsx`, `README.md`, `DEPLOYMENT.md` |

YouTube's current documentation describes upload restrictions for unaudited projects and its current quota model. Rework the local quota budget against the actual project's console limits instead of treating the old counter as authoritative. [Upload restrictions](https://developers.google.com/youtube/v3/docs/videos), [Quota and audits](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits).

## Verification results

- Seven isolated diagnostic reproductions confirmed the behaviours above.
- All 107 backend JavaScript files passed `node --check`.
- Initial frontend lint: 70 errors and four warnings. No existing backend test/lint script or GitHub Actions workflow is present in the baseline tree.
- Host Node 22.11 is below the frontend's dependency engine requirement. A supported bundled Node 24 runtime was used for the later build checks.
- Frontend production build passed with the original lockfile after repeating `npm ci` under Node 24.19.0 (Vite 8.0.8). An earlier install under unsupported Node omitted the native Rolldown binding; the final verification restored the original locked dependencies. No application dependency manifest or lockfile was changed.
- Production authentication, migrations against a real DB, media upload, actual scheduling, provider posting, deployed configuration, storage persistence and restore remain unverified.

The application is not ready to become the team's sole publisher. The useful foundation is the product surface; the release-critical work is the state machine, permissions, provider access, background execution and evidence of publication.
