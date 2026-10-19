/**
 * Email delivery. In development (EMAIL_TRANSPORT=log) messages are stored in
 * the email log (Admin > Email log) and printed to the console instead of sent.
 */
import nodemailer, { type Transporter } from "nodemailer";
import type { DbOrTx } from "@/db";
import { emailLog } from "@/db/schema";
import { env } from "@/lib/env";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  template: string;
  orderId?: number;
};

let transporter: Transporter | undefined;

function smtp(): Transporter {
  transporter ??= nodemailer.createTransport(env().SMTP_URL);
  return transporter;
}

/** Sends (or logs) an email. Never throws; returns whether it was handed off. */
export async function sendEmail(db: DbOrTx, message: EmailMessage): Promise<{ ok: boolean; error?: string }> {
  const e = env();
  if (e.EMAIL_TRANSPORT === "log") {
    console.info(`[email:log] to=${message.to} subject="${message.subject}"\n${message.text}\n`);
    await db.insert(emailLog).values({
      to: message.to,
      subject: message.subject,
      template: message.template,
      status: "LOGGED",
      html: message.html,
      orderId: message.orderId,
    });
    return { ok: true };
  }
  try {
    await smtp().sendMail({ from: e.EMAIL_FROM, to: message.to, subject: message.subject, html: message.html, text: message.text });
    await db.insert(emailLog).values({
      to: message.to,
      subject: message.subject,
      template: message.template,
      status: "SENT",
      orderId: message.orderId,
    });
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[email] failed to send "${message.subject}" to ${message.to}: ${error}`);
    await db.insert(emailLog).values({
      to: message.to,
      subject: message.subject,
      template: message.template,
      status: "FAILED",
      error: error.slice(0, 500),
      orderId: message.orderId,
    });
    return { ok: false, error };
  }
}
