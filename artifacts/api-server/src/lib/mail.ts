import nodemailer from "nodemailer";
import { env } from "./env";
import { logger } from "./logger";
import { shouldLogRawAccountLink } from "./accountLinkDelivery";
import { ServiceUnavailableError } from "../services/errors";

type Locale = "uk" | "cs";
type AccountLinkKind = "invitation" | "password-reset";

const copy: Record<Locale, Record<AccountLinkKind, { subject: string; intro: string; action: string }>> = {
  uk: {
    invitation: { subject: "Запрошення до CRM Solar", intro: "Вас запросили до CRM Solar.", action: "Прийняти запрошення" },
    "password-reset": { subject: "Відновлення пароля CRM Solar", intro: "Надійшов запит на відновлення вашого пароля.", action: "Відновити пароль" },
  },
  cs: {
    invitation: { subject: "Pozvánka do CRM Solar", intro: "Byli jste pozváni do CRM Solar.", action: "Přijmout pozvánku" },
    "password-reset": { subject: "Obnovení hesla CRM Solar", intro: "Byla podána žádost o obnovení vašeho hesla.", action: "Obnovit heslo" },
  },
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export async function deliverAccountLink(input: { kind: AccountLinkKind; email: string; token: string; locale?: string }): Promise<"console" | "smtp"> {
  const locale: Locale = input.locale === "cs" ? "cs" : "uk";
  const path = input.kind === "invitation" ? "/invite/accept" : "/reset-password";
  const link = `${env.APP_URL ?? "http://localhost:5173"}${path}?token=${encodeURIComponent(input.token)}`;

  if (env.EMAIL_PROVIDER === "console") {
    if (shouldLogRawAccountLink(env.NODE_ENV, env.EMAIL_PROVIDER)) {
      logger.info({ accountLink: link, email: input.email, kind: input.kind }, "ACCOUNT_LINK");
    } else {
      logger.info({ email: input.email, kind: input.kind }, "Account link created without delivery");
    }
    return "console";
  }

  const message = copy[locale][input.kind];
  try {
    const transport = nodemailer.createTransport(env.SMTP_URL!);
    await transport.sendMail({
      from: env.EMAIL_FROM!,
      to: input.email,
      subject: message.subject,
      text: `${message.intro}\n\n${message.action}: ${link}`,
      html: `<p>${escapeHtml(message.intro)}</p><p><a href="${escapeHtml(link)}">${escapeHtml(message.action)}</a></p>`,
    });
    logger.info({ email: input.email, kind: input.kind }, "Account email delivered");
    return "smtp";
  } catch (err) {
    logger.error({ err, email: input.email, kind: input.kind }, "Account email delivery failed");
    throw new ServiceUnavailableError("Could not deliver account email", "email_delivery_failed");
  }
}
