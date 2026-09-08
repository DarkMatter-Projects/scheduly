# Publishing acceptance checklist

Date: 2026-09-07. These are future release criteria; they have not passed in the current system.

## Behaviour

- Two clients with different memberships: reads, writes, uploads, account selection, approvals, exports and guessed IDs cannot cross the configured boundary.
- Editor drafts but cannot schedule through PUT, bulk operations, calendar drag, publish-now or any alternative path.
- Manager approves a revision; changing caption, media, targets or relevant metadata invalidates sign-off and pauses delivery.
- Revoked, expired, consumed and stale approval links cannot change state. Concurrent decisions produce one consistent result.
- A draft with no destination remains a draft. Invalid/past timestamps are rejected consistently. UTC and IANA timezone render correctly, including DST cases.
- Separate destination variants preserve each caption, crop, order, format and disclosure during create/edit/duplicate/reschedule.
- Original media bytes survive processing. Derived images/video metadata are verified, and failed uploads cannot be scheduled.

## Publishing fault injection

- Two workers claim the same due delivery; only one submission occurs.
- Restart the worker before provider submission, during upload, after provider acceptance and before database completion.
- A provider timeout after acceptance becomes unknown outcome and is reconciled before retry, preventing blind duplicate creation.
- A single destination fails in a multi-network post; successful destinations stay published and are not retried.
- A token expires, is revoked or rotates without a replacement refresh token; ciphertext remains encrypted and only the correct provider refreshes it.
- Rate limits honour retry windows. Permanent errors stop retrying and create actionable team notifications.
- An inactive/disconnected account cannot publish an already queued job.
- Duplicate/out-of-order webhooks are authenticated and deduplicated. Processing never becomes published solely from initial upload acceptance.
- A cancelled/rescheduled delivery cannot run from a stale queued message. In-flight cancellation explains when a provider operation can no longer be cancelled.

## Live provider evidence

For every enabled network and content format, record: approved test content, account identity, intended timestamp/timezone, job/attempt IDs, API response/operation ID, final platform ID/link, visible result and actual publication time. Verify text/media/order/audience, not just a success HTTP status.

- Facebook Page: text, photo, supported multi-photo and video.
- Instagram professional account: image, carousel and Reel; Story separately if exposed.
- LinkedIn company Page: text, image and video; multi-image/document only once implemented end-to-end.
- YouTube: uploaded video finishes processing and has the intended actual visibility; test Shorts eligibility separately.
- TikTok: provider-confirmed final publication, or explicit manual hand-off followed by verified publication.

## Operations and cutover

- CI installs from the lockfile on supported Node, runs behavioural tests, lint/type checks and build.
- Failed migrations prevent readiness and dependent code promotion. Liveness, DB readiness and worker heartbeat are separate signals.
- Provider secrets never enter the browser bundle, audit event payloads or ordinary logs.
- Queue lag and failed/unknown outcomes alert an owner. Alerts themselves are delivery-tested.
- Restore a backup of database and media into an isolated environment and reconcile checksums, mappings and future schedules.
- Reconcile old/new calendars and in-flight operations; only one scheduler owns a destination during migration or rollback.
- Native `/review` performed once on the implementation; reproducible release-blocking findings resolved.
- Small-client pilot completes and Jason gives the final go-live decision.
