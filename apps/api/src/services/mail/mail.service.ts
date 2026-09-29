import nodemailer from "nodemailer";
import { env } from "../../config/env.js";

// --- Email Service Abstraction ---
// Allows swapping SMTP for SendGrid, Mailgun, Postmark, etc.

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailService {
  readonly name: string;
  send(message: EmailMessage): Promise<boolean>;
  get available(): boolean;
}

// --- SMTP Adapter (existing behavior, refactored) ---

class SmtpEmailService implements EmailService {
  readonly name = "smtp";
  private transport: ReturnType<typeof nodemailer.createTransport> | null;

  constructor() {
    this.transport = env.SMTP_HOST
      ? nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE,
          auth: env.SMTP_USER && env.SMTP_PASSWORD ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined
        })
      : null;
  }

  get available() { return this.transport !== null; }

  async send(message: EmailMessage): Promise<boolean> {
    if (!this.transport) return false;
    await this.transport.sendMail({ from: env.MAIL_FROM, ...message });
    return true;
  }
}

// --- Console Adapter (development — logs emails to console) ---

class ConsoleEmailService implements EmailService {
  readonly name = "console";
  get available() { return true; }

  async send(message: EmailMessage): Promise<boolean> {
    console.log(`[EMAIL] To: ${message.to} | Subject: ${message.subject}\n${message.text}`);
    return true;
  }
}

// --- No-op Adapter (when email is not configured) ---

class NoOpEmailService implements EmailService {
  readonly name = "none";
  get available() { return false; }
  async send(): Promise<boolean> { return false; }
}

// --- Factory ---

function createEmailService(): EmailService {
  if (env.SMTP_HOST) return new SmtpEmailService();
  if (env.NODE_ENV === "development" && env.MAIL_CONSOLE_ENABLED) return new ConsoleEmailService();
  return new NoOpEmailService();
}

let activeEmailService: EmailService = createEmailService();

export function setEmailService(service: EmailService) {
  activeEmailService = service;
}

export function getEmailService(): EmailService {
  return activeEmailService;
}

// --- Convenience methods (backward-compatible with existing mailService) ---

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "\u0026amp;")
    .replace(/</g, "\u0026lt;")
    .replace(/>/g, "\u0026gt;")
    .replace(/"/g, "\u0026quot;")
    .replace(/'/g, "\u0026#39;");
}

export const mailService = {
  get available() {
    return activeEmailService.available;
  },

  async sendPasswordReset(email: string, token: string): Promise<boolean> {
    const resetUrl = new URL("/reset-password", env.APP_URL);
    resetUrl.searchParams.set("token", token);
    return activeEmailService.send({
      to: email,
      subject: "Recuperação de password NEXORA",
      text: `Use esta ligação para definir uma nova password: ${resetUrl.toString()}`,
      html: `<p>Use a ligação abaixo para definir uma nova password.</p><p><a href="${resetUrl.toString()}">Alterar password</a></p>`
    });
  },

  async sendWelcome(email: string, name: string): Promise<boolean> {
    const safeName = escapeHtml(name);
    return activeEmailService.send({
      to: email,
      subject: "Bem-vindo à NEXORA",
      text: `Olá ${name},\n\nBem-vindo à NEXORA! A sua conta foi criada com sucesso.\n\nA equipa NEXORA`,
      html: `<p>Olá ${safeName},</p><p>Bem-vindo à NEXORA! A sua conta foi criada com sucesso.</p><p>A equipa NEXORA</p>`
    });
  },

  async sendInvitation(email: string, organizationName: string, inviterName: string, inviteUrl: string): Promise<boolean> {
    const safeOrg = escapeHtml(organizationName);
    const safeInviter = escapeHtml(inviterName);
    const safeUrl = escapeHtml(inviteUrl);
    return activeEmailService.send({
      to: email,
      subject: `${inviterName} convidou-o para ${organizationName} na NEXORA`,
      text: `Olá,\n\n${inviterName} convidou-o para colaborar na organização ${organizationName} na NEXORA.\n\nAceite o convite aqui: ${inviteUrl}\n\nA equipa NEXORA`,
      html: `<p>Olá,</p><p><strong>${safeInviter}</strong> convidou-o para colaborar na organização <strong>${safeOrg}</strong> na NEXORA.</p><p><a href="${safeUrl}">Aceitar convite</a></p><p>A equipa NEXORA</p>`
    });
  },

  async sendNotification(email: string, subject: string, body: string): Promise<boolean> {
    return activeEmailService.send({
      to: email,
      subject,
      text: body,
      html: escapeHtml(body).replace(/\n/g, "<br>")
    });
  }
};
