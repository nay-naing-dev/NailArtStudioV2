import nodemailer from 'nodemailer';
import { config } from '../config/env.js';

let transporter;

// One pooled SMTP connection set, reused across broadcasts.
function getTransporter() {
  if (!transporter) {
    const { host, port, secure, user, pass, concurrency } = config.mail;
    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      ...(user && { auth: { user, pass } }),
      pool: true,
      maxConnections: concurrency,
    });
  }
  return transporter;
}

const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Plain text in, a simple branded HTML email out. Blank lines start a new paragraph.
function renderHtml(subject, message) {
  const paragraphs = message
    .trim()
    .split(/\n\s*\n/)
    .map((p) => `<p style="margin:0 0 16px">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const studio = escapeHtml(config.mail.studioName);
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#fdf6f7;font-family:Helvetica,Arial,sans-serif;color:#2a1a20">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #ecdfe3;border-radius:4px 28px 8px 28px">
    <tr><td style="padding:32px 32px 8px">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#c2416b">${studio}</p>
      <h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:24px;font-weight:600">${escapeHtml(subject)}</h1>
      <div style="font-size:15px;line-height:1.6">${paragraphs}</div>
    </td></tr>
    <tr><td style="padding:16px 32px 28px;border-top:1px solid #ecdfe3;font-size:12px;color:#6b5860">
      You're receiving this because you have an account with ${studio}.
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Sends the same announcement to every address, one message per recipient so nobody sees the others.
 * Never throws for individual delivery failures; returns which addresses failed instead.
 */
export async function sendBroadcast({ subject, message, recipients }) {
  const transport = getTransporter();
  const html = renderHtml(subject, message);
  const text = `${message.trim()}\n\n--\n${config.mail.studioName}`;
  const failed = [];
  let sent = 0;

  // Batches the size of the connection pool keep memory flat and respect the provider's rate limit.
  const size = config.mail.concurrency;
  for (let i = 0; i < recipients.length; i += size) {
    const batch = recipients.slice(i, i + size);
    const results = await Promise.allSettled(
      batch.map((to) => transport.sendMail({ from: config.mail.from, to, subject, text, html })),
    );
    results.forEach((r, j) => {
      if (r.status === 'fulfilled') {
        sent += 1;
        // The SMTP server's reply ("250 2.0.0 OK ...") proves hand-off; anything after that is the inbox provider's call.
        console.info(`[broadcast] accepted ${batch[j]}: ${r.value.response} ${r.value.messageId}`);
      } else failed.push({ email: batch[j], reason: r.reason?.message || 'Unknown error' });
    });
  }

  return { sent, failed };
}

/** Checks the SMTP connection and credentials without sending anything. */
export const verifyMailer = () => getTransporter().verify();
