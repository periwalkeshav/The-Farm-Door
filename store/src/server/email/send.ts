/**
 * Email delivery. In development (EMAIL_TRANSPORT=log) messages are stored in
 * the email log (Admin > Email log) and printed to the console instead of sent.
 */
import nodemailer, { type Transporter } from "nodemailer";
import type { DbOrTx } from "@/db";
import { emailLog } from "@/db/schema";
import { env } from "@/lib/env";
import { isPlaceholder, readSettings } from "../settings";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  template: string;
  orderId?: number;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
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
    const files = message.attachments?.map((a) => a.filename) ?? [];
    console.info(`[email:log] to=${message.to} subject="${message.subject}"${files.length ? ` attachments=${files.join(",")}` : ""}\n${message.text}\n`);
    await db.insert(emailLog).values({
      to: message.to,
      subject: message.subject,
      template: message.template,
      status: "LOGGED",
      html: message.html,
      attachments: files,
      orderId: message.orderId,
    });
    return { ok: true };
  }
  try {
    // Replies go to the support address from Settings (the sending address may have no inbox).
    const { supportEmail } = await readSettings(db, "store");
    const replyTo = supportEmail && !isPlaceholder(supportEmail) ? supportEmail : undefined;
    await smtp().sendMail({ from: e.EMAIL_FROM, replyTo, to: message.to, subject: message.subject, html: message.html, text: message.text, attachments: message.attachments });
    await db.insert(emailLog).values({
      to: message.to,
      subject: message.subject,
      template: message.template,
      status: "SENT",
      attachments: message.attachments?.map((a) => a.filename) ?? [],
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
