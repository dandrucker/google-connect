import { google } from 'googleapis';
import { getAuthClient, type AuthOptions } from './auth';

function gmailApi(options: AuthOptions = {}) {
  return google.gmail({ version: 'v1', auth: getAuthClient(options) });
}

export interface OutgoingMail {
  to: string | string[];
  subject: string;
  /** Plain text body. Supply `html` instead for a rich message. */
  text?: string;
  html?: string;
  cc?: string | string[];
  replyTo?: string;
}

function headerList(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value.join(', ') : value;
}

/**
 * Encode an RFC 2822 message the way the Gmail API expects: base64url, with
 * the padding and URL-unsafe characters swapped out.
 */
function toBase64Url(message: string): string {
  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function buildMessage(mail: OutgoingMail): string {
  const contentType = mail.html
    ? 'text/html; charset=utf-8'
    : 'text/plain; charset=utf-8';

  const headers = [
    `To: ${headerList(mail.to)}`,
    mail.cc ? `Cc: ${headerList(mail.cc)}` : null,
    mail.replyTo ? `Reply-To: ${mail.replyTo}` : null,
    // Encode the subject so non-ASCII characters survive transit.
    `Subject: =?utf-8?B?${Buffer.from(mail.subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: ${contentType}`,
  ].filter(Boolean);

  return `${headers.join('\r\n')}\r\n\r\n${mail.html ?? mail.text ?? ''}`;
}

/**
 * Send mail as the authorised account.
 *
 * Requires the GMAIL_SEND scope, which cannot read the inbox. Note that Google
 * invalidates refresh tokens carrying any Gmail scope when the account
 * password changes — re-run `authorize` if sending starts failing after a
 * password reset.
 */
export async function sendMail(
  mail: OutgoingMail,
  options: AuthOptions = {}
): Promise<{ id: string }> {
  const response = await gmailApi(options).users.messages.send({
    userId: 'me',
    requestBody: { raw: toBase64Url(buildMessage(mail)) },
  });

  return { id: response.data.id ?? '' };
}
