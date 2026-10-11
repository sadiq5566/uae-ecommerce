import "server-only";

export type Mail = { to: string; subject: string; text: string };
export interface Mailer { send(mail: Mail): Promise<{ sent: boolean }>; }

/** Development only: prints the message (including reset links) to the server console. Nothing is sent. */
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

// Add real providers here (e.g. Resend, SES, SendGrid) behind the same interface and select by MAIL_PROVIDER.
export function getMailer(): Mailer {
  return process.env.NODE_ENV === "production" ? unconfiguredMailer : consoleMailer;
}
