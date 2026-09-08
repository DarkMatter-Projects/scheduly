# TikTok review recording

Status: real hosted sandbox authorisation and draft upload verified on 2026-09-08. TikTok returned SEND_TO_USER_INBOX. Two Chrome evidence clips attached and the application submitted. The portal confirms In review. See platform-submission-checklist-2026-09-08.md for the current status.

- Production app: DarkMatter Scheduly, 7683147026833475605.
- Review sandbox: Scheduly review sandbox, 7683114165468284949.
- Intended products: Login Kit and Content Posting API upload mode.
- Intended scopes: user.info.basic and video.upload. Direct Post remains off.
- Real use: DarkMatter team and authorised client accounts. Do not describe it as a public multi-agency product.

## Required evidence

1. Show the hosted Scheduly URL and sign-in screen. Enter passwords before recording or exclude that segment.
2. Sign in to an authorised workspace account. Show its client context.
3. Start a TikTok connection from Scheduly, show TikTok consent for only the requested scopes, and select the authorised sandbox target account.
4. Return to Scheduly and show the actual account identity returned by TikTok.
5. Select an original, non-sensitive test video. Show the destination account and preview. Explain that this transfers a draft, which must be completed in TikTok.
6. Explicitly confirm the draft transfer. Show actual processing/status results, without access tokens or client secrets.
7. Show the corresponding TikTok inbox/draft result. Do not publish publicly for the recording.

## Submitted evidence

Chrome authorisation succeeded as Rossi after the user signed in. Two clips were captured from the application tab, converted to MP4, visually inspected and uploaded:

- `../review-assets/scheduly-tiktok-consent-2026-09-08.mp4`: actual TikTok consent and return to the connected account.
- `../review-assets/scheduly-tiktok-review-2026-09-08.mp4`: original-video selection, explicit consent and the actual SEND_TO_USER_INBOX status check of a previously transferred draft. It does not show a fresh transfer or the mobile inbox; the submission explicitly explains this limitation.

The actual files are in the project knowledge directory's `review-assets/`, outside this source repository. The original sandbox test MP4 was not submitted as an application demo.

Production configuration saved and final submission sent on 2026-09-08. TikTok displayed In review and confirmed receipt. Approval remains pending; the hosted integration still uses sandbox credentials. Further recording may be required by the reviewer.

## Sources

- https://developers.tiktok.com/docs/en/login-kit-web
- https://developers.tiktok.com/docs/en/content-posting-api-get-started-upload-content
- The app submission portal requires a sandbox demonstration for an app that has not previously been approved.
