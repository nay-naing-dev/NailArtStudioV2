import { config, mailEnabled } from '../config/env.js';
import { User } from '../models/User.js';
import { sendBroadcast, verifyMailer } from '../services/mailer.js';
import { ApiError } from '../utils/ApiError.js';

const customerFilter = { role: 'customer', email: { $exists: true, $nin: [null, ''] } };

// Recipient count, whether email is set up and the sender name, so the panel can show them before sending.
export async function broadcastAudience(req, res) {
  const customers = await User.countDocuments(customerFilter);
  res.json({ customers, emailEnabled: mailEnabled(), studioName: config.mail.studioName });
}

export async function sendCustomerBroadcast(req, res) {
  if (!mailEnabled()) {
    throw new ApiError(503, 'Email is not configured. Set SMTP_HOST and MAIL_FROM on the server.');
  }

  const { subject, messageContent } = req.body;
  const recipients = await User.distinct('email', customerFilter);
  if (recipients.length === 0) throw ApiError.badRequest('There are no customers with an email address yet.');

  // Fail fast on bad credentials instead of reporting every customer as a failed delivery.
  try {
    await verifyMailer();
  } catch (err) {
    throw new ApiError(502, `Couldn't connect to the mail server: ${err.message}`);
  }

  const { sent, failed } = await sendBroadcast({ subject, message: messageContent, recipients });
  if (failed.length) console.warn(`Broadcast "${subject}": ${failed.length} of ${recipients.length} failed`, failed);
  if (sent === 0) throw new ApiError(502, `No emails could be delivered. First error: ${failed[0]?.reason}`);

  res.json({ sent, failed: failed.length, total: recipients.length, failedEmails: failed.map((f) => f.email) });
}
