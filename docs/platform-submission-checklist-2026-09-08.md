# Scheduly platform submission checklist

Checked 2026-09-08. This is the current checklist and supersedes older setup notes. **The four platform applications have not all been submitted.**

## Workspace and shared requirements

- [x] Hosted workspace available at https://scheduly-workspace.vercel.app/workspace.html.
- [x] Password sign-in, account creation and recovery interface deployed. Jason's authenticated Admin access observed in both the in-app browser and Chrome.
- [x] Admin, Editor, Content Creator and Viewer roles implemented with server-side enforcement and client assignments.
- [x] Dedicated Supabase database, private media storage and authenticated API deployed.
- [x] Public privacy, terms and data-deletion pages deployed.
- [x] Scheduly icon generated and used by the workspace; Google and LinkedIn uploads completed.
- [x] GitHub rebuild branch connected to Vercel deployment.
- [x] 29 behavioural tests passed, targeted frontend lint/build passed, and Deno encryption runtime test passed.
- [x] Native review performed. Safe retry finding fixed and regression-tested.
- [ ] Production email delivery service and delivery checks.
- [ ] All-provider account connections, live publishing worker and delivery reconciliation.
- [ ] Live platform analytics ingestion and reports reconciled with authoritative platform data.
- [ ] Production readiness, unattended scheduling and team acceptance checks. Hosted calendar scheduling remains disabled.

## TikTok

App: DarkMatter Scheduly `7683147026833475605`. Sandbox: `7683114165468284949`.

- [x] Login Kit and Content Posting API upload mode configured in sandbox.
- [x] Scopes `user.info.basic` and `video.upload`; Direct Post off.
- [x] Approved icon, public website, privacy and terms configured in sandbox.
- [x] Production website ownership verification accepted by TikTok using the exact user-provided file.
- [x] Authorised sandbox target `rossi6239` added.
- [x] Server-only sandbox credentials and separate token encryption key configured in Supabase.
- [x] Real hosted OAuth completed. TikTok returned display name **Rossi**, assigned to DarkMatter.
- [x] Admin-only original-video selection, preview, explicit destination consent and draft transfer implemented.
- [x] Actual MP4 uploaded. TikTok status returned **SEND_TO_USER_INBOX**. No public post made.
- [x] Expiring, one-use authorisation state; encrypted grants; cross-client connection protection; duplicate-transfer prevention tested.
- [x] Tested sandbox configuration imported into production submission form and truthful product/scope explanation entered.
- [x] Chrome authorisation verified as Rossi after the user signed in.
- [x] Two actual Chrome recordings saved, inspected and attached: `scheduly-tiktok-consent-2026-09-08.mp4` and `scheduly-tiktok-review-2026-09-08.mp4`. The second records selection, consent and a status check of the previously transferred draft, not a fresh transfer. This limitation is explicitly disclosed in the submission.
- [x] Production configuration saved and application submitted on 2026-09-08. Portal confirms **In review** and “Your app has been submitted for review”.
- [ ] TikTok review approved. Production credentials must replace sandbox credentials only after approval and a controlled test.
- [ ] Account disconnection UI and durable operational recovery tooling for ambiguous provider outcomes.

The MP4 named `tiktok-sandbox-test-2026-09-08.mp4` is the original test content, **not a review recording**. Do not upload it as evidence of the application flow.

## LinkedIn

App: DarkMatter Social Scheduler `266161292`.

- [x] Business/company association verified.
- [x] Community Management API Development Tier request submitted: portal currently says **Review in progress**.
- [x] Approved Scheduly icon saved.
- [x] Scheduly-specific privacy URL update applied.
- [ ] Product access approved; development limits and later Standard Tier requirements satisfied.
- [ ] Hosted OAuth, organisation discovery/selection, publishing and reporting integration implemented and tested.
- [ ] Appropriate redirect URI registered against the implemented callback.

The Community Management API product includes organisation publishing. This does not mean Scheduly will include a community-management interface. No duplicate application or competing product request was created.

## Meta: Facebook and Instagram

App: Scheduly `1557802719481548`. Review draft: `1557804679481352`.

- [x] Dedicated app created with Instagram and Facebook Pages use cases.
- [x] DarkMatter business verification completed.
- [x] Privacy and data-deletion URLs configured.
- [ ] Basic settings fully persisted. Meta reports “Changes saved”, but re-opening Basic still shows the icon missing and the terms field as `https://www.facebook.com/`. Do not mark icon/terms complete until a fresh load retains them.
- [x] `pages_manage_posts` added to the Pages use case and marked Ready for testing.
- [ ] Remaining publishing permissions added and tested, then included in review. The earlier review request contains `pages_show_list`, `business_management`, `public_profile`, which is insufficient for publishing.
- [ ] Hosted connection and publishing flows implemented; required API calls executed.
- [ ] Permission-specific demonstration recordings, data-handling answers and reviewer access instructions completed.
- [ ] App Review submitted and approved. Current portal status: **Not submitted**.

## Google / YouTube

Project: `scheduly-508008`. OAuth client: Scheduly hosted workspace.

- [x] Dedicated Cloud project and Web OAuth client created.
- [x] YouTube Data API v3 enabled.
- [x] App name, support contact, icon, website, privacy and terms branding saved.
- [x] `youtube.upload` and `youtube.readonly` scopes added and saved.
- [ ] Working hosted OAuth callback and authorised redirect URI.
- [ ] Channel identity selection, private upload test, resumable transfer recovery and actual processing checks.
- [ ] Domain ownership verification and OAuth verification submission with working-flow evidence.
- [ ] YouTube API compliance audit submitted where needed for production upload visibility.
- [ ] YouTube Analytics API and reporting scopes/integration.

Current audience remains **External / Testing**. Verification Center's “Verification is not required since your app is configured with a Testing status” is not production approval.

## Verification and recovery notes

Provider credentials, refresh tokens and encryption key are not included in this checklist or frontend source. The three new TikTok tables have RLS enabled and no anonymous/authenticated SELECT access. Their no-policy configuration is intentional because the authenticated server gateway performs access checks.

The first edge deployment exposed a Deno `Buffer` import mismatch, fixed with an explicit `node:buffer` import and a real Deno encryption round-trip test. Hosted sign-in and OAuth were rechecked after the fix. A regional TikTok upload hostname was initially rejected before any video bytes were sent; the allowlist now accepts HTTPS destinations under TikTok's own `tiktokapis.com` domain and rejects redirects. The exact failed test-attempt record was cleared and the original test asset then reached TikTok's inbox successfully.

Rollback: restore the previous workspace Edge Function and Vercel deployment from before the connector change; retain the additive private tables and originals. Do not rotate or discard `PROVIDER_TOKEN_KEY` while encrypted grants depend on it. Review recordings must exclude credentials and unrelated client content.

## Reference requirements

- [TikTok web authorisation](https://developers.tiktok.com/docs/en/login-kit-web)
- [TikTok draft uploads](https://developers.tiktok.com/docs/en/content-posting-api-get-started-upload-content)
- [TikTok media transfer, including regional upload hosts](https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide)
- [YouTube server-side OAuth and scopes](https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps)
