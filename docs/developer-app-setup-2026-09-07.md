# Developer-app setup

Date: 2026-09-07. Intended audience is DarkMatter's own team managing client accounts. This is an implementation checklist, not a claim that any application has been approved or configured in this session.

## Observed app inventory

| Platform | Observed current state | Next action |
|---|---|---|
| Meta | Signed-in inventory lists OILY, n8n-SocialMedia-Intelligence and Cannabis News Publisher, all in development; no Scheduly-named app | Recover access to documented Scheduly apps or prepare a dedicated replacement; do not repurpose unrelated apps |
| LinkedIn | DarkMatter Social Scheduler, app `266161292`, client ID `78gne90kdpeddz`, company verified; Community Management Development Tier says Review in progress | Continue this existing application; do not create a duplicate or claim approval |
| LinkedIn optional products | Share on LinkedIn and OpenID Connect show Request access on the scheduler app | Request only if personal-profile publishing/identity flow is retained; current code expects both |
| TikTok | Developer portal says login required | Verify any existing app only after sign-in; direct internal-tool eligibility remains an independent problem |
| Google/YouTube | Cloud Console requests account re-verification | Sign into the intended project owner account, inspect projects/APIs/OAuth/audit status |

Repository documentation references FB app `26447834738219900` and IG app `2680727678978976`; these are historical code/documentation evidence only, not confirmed live ownership. There is no need to create a developer app for each client: one approved application per provider can support multiple separately authorised client accounts, subject to provider rules.

## Shared preparation

Choose canonical production and staging web/API domains before configuring redirects. Existing source names `scheduly.darkm.co`, while the repository homepage is `scheduly-alpha.vercel.app`; their production routing needs verification. Document exact HTTPS callback URLs, public privacy policy, terms, data-deletion/disconnection flow, support contact and retention policy. Use business-controlled developer accounts, a second appropriate owner, separate staging credentials where supported and encrypted server-side secrets.

Prepare working staging features, a reviewer login with suitable test accounts, and a short recording showing authorisation, account selection, composition, approval, publishing status and disconnection. The recording must match actual available behaviour and permissions. Never supply fabricated approval evidence or describe this internal platform as public SaaS to obtain access.

## Meta: Facebook and Instagram

Use a dedicated business-owned Meta app with Facebook Page publishing and Instagram professional-account publishing configured. The current code uses Instagram Login separately from Facebook Login; preserve that distinction when selecting scopes.

- Facebook publishing baseline: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, and identity permissions required by the selected login flow. Add other permissions only for an implemented, justified feature.
- Instagram Login baseline: `instagram_business_basic`, `instagram_business_content_publish`. Insights can be a separate justified capability. Do not mix these names with the Facebook-Login Instagram scope family.
- Current callbacks: `/api/social/auth/facebook/callback` and `/api/social/auth/instagram/callback` on the backend host. Register exact staging and production URIs in the relevant products.
- Inspect Business Verification, App Review/Advanced Access, permitted use cases and any provider verification requirements shown for this actual app. Development access to test/admin assets is not client-wide production approval.
- Start with Page text/photo/video and Instagram image/carousel/Reel; expose Story publishing only for the tested eligible account/format. No personal Facebook-profile posting.
- Store granted scopes and selected asset identity, and verify permissions before enqueueing. Provide clear reconnect instructions. A token with no expiry timestamp can still be revoked.

Meta's official API workspace documents the separate login models and professional-account requirements. [Meta Instagram API documentation](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api). Direct Meta documentation pages failed to load in this session; confirm the app-specific review requirements in its dashboard before submission.

## LinkedIn: company Pages first

Keep the existing DarkMatter Social Scheduler app. Its Community Management request is pending. This product includes organisation publishing even though Scheduly will not have community-management UI.

Implement organisation discovery and Page selection for authorised administrators; store `urn:li:organization:{id}` separately from personal identity. Use `w_organization_social` for organisation posts, with the approved read/admin-discovery scopes needed by the chosen endpoints. Current code requests only personal publishing and hardcodes `urn:li:person`, so permission approval alone will not fix Page publishing.

Callback: `/api/social/auth/linkedin/callback`. Verify this against `LINKEDIN_REDIRECT_URI` and the app's actual Auth settings. Prepare Development-tier testing, then the Standard-tier request needed for routine production use. The available tiers impose limits and approval is discretionary. [Access tiers](https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access), [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-03).

## YouTube: OAuth and upload audit are different gates

Confirm the intended Google Cloud project and enabled YouTube Data API v3. Configure a Web OAuth client and callback `/api/social/auth/youtube/callback`. Current code shares the Google OAuth client with Ads; a separate Scheduly project/client is preferable if the existing grant belongs to unrelated reporting infrastructure.

Use `youtube.upload` and `youtube.readonly` for the upload/channel selection features; add Analytics scopes only if that feature ships. Enable offline authorisation, encrypt refresh tokens and handle revocation. Confirm that all client authorising accounts are supported by the OAuth audience; an Internal Google Workspace app does not automatically cover external client accounts. Complete OAuth verification when required. [Google verification guidance](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification).

Separately inspect the YouTube API compliance audit: unverified projects can have uploads restricted to private regardless of the requested visibility. Track processing and the actual privacy status after upload. Use resumable sessions persisted across worker restarts; collect title, description, audience and privacy explicitly. Do not claim a hashtag guarantees Shorts classification. [YouTube upload restriction](https://developers.google.com/youtube/v3/docs/videos).

## TikTok: choose a supported route

TikTok's Direct Post guidelines exclude private/internal upload utilities for a team's managed accounts. Because Jason confirmed internal-only use, do not make native Direct Post approval a launch dependency. Existing code or domain-verification files do not prove approval. [TikTok guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines/).

Preferred investigation: a supported publishing API provider whose terms and account model cover this deployment. Ayrshare documents direct publishing and asynchronous status completion; evaluate its fit and quote before committing. Retain provider job IDs and reconcile final post URLs. [Ayrshare TikTok](https://www.ayrshare.com/docs/apis/post/social-networks/tiktok).

Fallback: a scheduled manual hand-off with prepared media/caption and an assigned team member, recorded as awaiting manual action until the final post is verified. TikTok's Upload-to-inbox API, if approved for the actual use case, is also a hand-off rather than auto-publication. Do not present either as unattended posting.

If native integrations are ever legitimately approved for the actual product, implement current creator metadata, privacy selection without a preset, interaction restrictions, commercial disclosure, upload consent, owned media-domain verification and asynchronous status handling. Login Kit, organic Content Posting and TikTok Ads are distinct products.

## Owner hand-offs

The immediate missing inputs are a Scheduly sign-in, access to its original Meta apps or confirmation they are inaccessible, and Google Cloud re-verification. Do not send passwords or app secrets in chat. Complete login in the browser and store secrets only in the approved server environment. Provider subscription spend, legally binding submissions and the final client-facing launch require a concrete decision when those steps are reached.
