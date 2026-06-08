const env = require('../config/env');
const logger = require('../utils/logger');

// Lazy-load the SDK so the server boots even when the package isn't
// installed yet (Railway re-deploys take a moment to pick up new deps).
let resendClient = null;
function getClient() {
  if (resendClient) return resendClient;
  if (!env.email?.resendApiKey) return null;
  try {
    const { Resend } = require('resend');
    resendClient = new Resend(env.email.resendApiKey);
    return resendClient;
  } catch (err) {
    logger.warn(`Resend SDK unavailable: ${err.message}`);
    return null;
  }
}

// Send one email via Resend. Returns true on success, false if no
// provider is configured (so callers can decide whether to surface an
// error). Failures are logged but not re-thrown — email is best-effort.
async function sendEmail({ to, subject, html, text, replyTo }) {
  const client = getClient();
  if (!client) {
    logger.debug(`Email skipped (no RESEND_API_KEY) — would have sent "${subject}" to ${Array.isArray(to) ? to.join(',') : to}`);
    return false;
  }
  if (!to || (Array.isArray(to) && to.length === 0)) return false;
  try {
    const { data, error } = await client.emails.send({
      from: env.email.fromAddress,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text: text || stripHtml(html),
      reply_to: replyTo || undefined,
    });
    if (error) {
      logger.warn(`Resend send error: ${error.message || JSON.stringify(error)}`);
      return false;
    }
    logger.debug(`Email sent (${data?.id || 'no-id'}): "${subject}" to ${(Array.isArray(to) ? to : [to]).join(',')}`);
    return true;
  } catch (err) {
    logger.warn(`Resend send threw: ${err.message}`);
    return false;
  }
}

function stripHtml(s) { return String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }

// Wrap a body block in our standard layout. Keeps every notification
// email visually consistent without us hand-writing the chrome each time.
function layout({ title, preheader, bodyHtml, ctaLabel, ctaPath }) {
  const ctaUrl = ctaPath ? `${env.email.appUrl}${ctaPath.startsWith('/') ? ctaPath : '/' + ctaPath}` : null;
  return `<!doctype html>
<html><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
  ${preheader ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="padding:24px 28px 8px;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#475569;">Scheduly</p>
          <h1 style="margin:6px 0 0;font-size:18px;font-weight:600;color:#0f172a;">${escapeHtml(title)}</h1>
        </td></tr>
        <tr><td style="padding:12px 28px 4px;font-size:14px;line-height:1.55;color:#334155;">
          ${bodyHtml}
        </td></tr>
        ${ctaUrl ? `<tr><td style="padding:12px 28px 24px;">
          <a href="${ctaUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;">${escapeHtml(ctaLabel || 'Open')}</a>
        </td></tr>` : ''}
        <tr><td style="padding:18px 28px 24px;font-size:11px;color:#94a3b8;border-top:1px solid #f1f5f9;">
          You're getting this because Scheduly fired a notification for your account or team. Manage preferences inside the app.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { sendEmail, layout };
