import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

export type Mail = { to: string; subject: string; text: string; html?: string; replyTo?: string };
export interface Mailer { send(mail: Mail): Promise<{ sent: boolean }>; }

/** Development without SMTP: prints the message (including reset links) to the server console. Nothing is sent. */
const consoleMailer: Mailer = {
  async send(m) {
    console.info(`\n[mail:dev — NOT SENT] to=${m.to}\nsubject: ${m.subject}\n${m.text}\n`);
    return { sent: false };
  },
};

/** Production without a configured provider: never log message bodies (they contain tokens). */
const unconfiguredMailer: Mailer = {
  async send(m) {
    console.warn(`[mail] no provider configured; email "${m.subject}" was not sent`);
    return { sent: false };
  },
};

let transport: Transporter | undefined;
const smtpConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

/** SMTP (Zoho, Gmail, SES SMTP...) configured with SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / EMAIL_FROM. Port 465 uses TLS from the start. */
const smtpMailer: Mailer = {
  async send(m) {
    try {
      const port = Number(process.env.SMTP_PORT) || 465;
      transport ??= nodemailer.createTransport({
        host: process.env.SMTP_HOST, port, secure: port === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
      });
      await transport.sendMail({ from: process.env.EMAIL_FROM || process.env.SMTP_USER, to: m.to, replyTo: m.replyTo, subject: m.subject, text: m.text, html: m.html });
      return { sent: true };
    } catch (e) {
      console.warn(`[mail] SMTP send failed for "${m.subject}":`, (e as Error).message); // never log the body: it can hold reset links
      return { sent: false };
    }
  },
};

export function getMailer(): Mailer {
  if (smtpConfigured()) return smtpMailer;
  return process.env.NODE_ENV === "production" ? unconfiguredMailer : consoleMailer;
}
