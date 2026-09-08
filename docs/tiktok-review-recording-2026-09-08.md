# TikTok review recording

Status: not recorded or submitted. No successful TikTok authorisation or draft transfer has been observed.

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

## Remaining gates

- Target account authorisation: @rossi6239 observed in the sandbox target users on 2026-09-08. This is not yet a Scheduly OAuth connection.
- Hosted TikTok OAuth and draft-upload integration: not implemented.
- URL ownership: portal supplied tiktokVYW9HHSeQFFnebPNAkuwwg2LQVsoIuLa.txt. File contents have not been retrieved; browser security policy blocked opening its blob URL. User file handoff required. Do not fabricate the signature.
- Public terms page: prepared in client/public/terms.html.
- Reviewer video: must demonstrate the real sandbox flow, not simulated success or a slideshow.

## Sources

- https://developers.tiktok.com/docs/en/login-kit-web
- https://developers.tiktok.com/docs/en/content-posting-api-get-started-upload-content
- The app submission portal requires a sandbox demonstration for an app that has not previously been approved.
