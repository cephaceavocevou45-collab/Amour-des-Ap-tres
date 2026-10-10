import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from './prisma.service';

type MailTemplate = 'RESPONSIBILITY_RECEIVED' | 'RESPONSIBILITY_UPDATE' | 'INACTIVITY_REMINDER';
type QuotaRow = { sentCount: number; alertSent: boolean };

@Injectable()
export class EmailQuotaService {
  private readonly logger = new Logger(EmailQuotaService.name);

  constructor(private readonly prisma: PrismaService) {}

  async enqueue(userId: string, template: MailTemplate) {
    if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) return false;
    try {
      if (template === 'INACTIVITY_REMINDER') {
        const existing = await this.prisma.emailOutbox.findFirst({
          where: { userId, template, sentAt: null, createdAt: { gt: new Date(Date.now() - 30 * 86400_000) } },
          select: { id: true },
        });
        if (existing) return true;
      }
      await this.prisma.emailOutbox.create({ data: { userId, template } });
      return true;
    } catch {
      this.logger.warn('La file e-mail est indisponible; aucun destinataire ni contenu n’a été journalisé.');
      return false;
    }
  }

  async sendImmediate(to: string, subject: string, html: string) {
    if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) return false;
    let reserved = false;
    try { reserved = await this.reserveSlot(); }
    catch {
      this.logger.warn('Le compteur e-mail est indisponible; aucun message n’a été envoyé.');
      return false;
    }
    if (!reserved) return false;
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, html }),
      });
      if (!response.ok) this.logger.warn('Le fournisseur e-mail a refusé un envoi; aucun contenu ni destinataire n’a été journalisé.');
      return response.ok;
    } catch {
      this.logger.warn('Échec réseau du fournisseur e-mail; aucun contenu ni destinataire n’a été journalisé.');
      return false;
    }
  }

  @Cron('*/1 * * * *', { timeZone: 'UTC' })
  async deliverDeferred() {
    if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) return;
    try {
      for (let count = 0; count < 15; count++) {
      const now = new Date();
      const item = await this.prisma.emailOutbox.findFirst({
        where: { sentAt: null, nextAttemptAt: { lte: now }, user: { active: true, suspendedAt: null } },
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { email: true, fullName: true } } },
      });
      if (!item) return;
      const claimed = await this.prisma.emailOutbox.updateMany({
        where: { id: item.id, sentAt: null, nextAttemptAt: { lte: now } },
        data: { attempts: { increment: 1 }, nextAttemptAt: new Date(now.getTime() + 10 * 60_000) },
      });
      if (!claimed.count) continue;
      const reserved = await this.reserveSlot();
      if (!reserved) {
        await this.prisma.emailOutbox.updateMany({ where: { id: item.id, sentAt: null }, data: { nextAttemptAt: this.nextUtcDay() } });
        return;
      }
      const email = this.render(item.template, item.user.fullName);
      let sent = false;
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: process.env.MAIL_FROM, to: [item.user.email], subject: email.subject, html: email.html }),
        });
        sent = response.ok;
      } catch {
        sent = false;
      }
      if (sent) {
        await this.prisma.emailOutbox.updateMany({ where: { id: item.id, sentAt: null }, data: { sentAt: new Date() } });
      } else {
        const backoffMinutes = Math.min(24 * 60, 5 * 2 ** Math.min(item.attempts, 8));
        await this.prisma.emailOutbox.updateMany({ where: { id: item.id, sentAt: null }, data: { nextAttemptAt: new Date(Date.now() + backoffMinutes * 60_000) } });
        this.logger.warn('Un courriel différé sera retenté plus tard; aucun contenu ni destinataire n’a été journalisé.');
      }
      }
    } catch {
      this.logger.warn('Le traitement de la file e-mail est momentanément indisponible; aucun contenu ni destinataire n’a été journalisé.');
    }
  }

  private async reserveSlot() {
    const rawLimit = Number(process.env.RESEND_DAILY_LIMIT ?? 100);
    const limit = Number.isInteger(rawLimit) && rawLimit > 0 && rawLimit <= 100 ? rawLimit : 100;
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    const rows = await this.prisma.$queryRaw<QuotaRow[]>`
      INSERT INTO "EmailDailyUsage" ("day", "sentCount", "alertSent", "updatedAt")
      VALUES (${day}, 1, false, CURRENT_TIMESTAMP)
      ON CONFLICT ("day") DO UPDATE SET
        "sentCount" = "EmailDailyUsage"."sentCount" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "EmailDailyUsage"."sentCount" < ${limit}
      RETURNING "sentCount", "alertSent"
    `;
    if (!rows.length) return false;
    const rawThreshold = Number(process.env.RESEND_ALERT_AT ?? Math.ceil(limit * 0.8));
    const threshold = Number.isInteger(rawThreshold) && rawThreshold > 0 ? Math.min(limit, rawThreshold) : Math.ceil(limit * 0.8);
    if (rows[0].sentCount >= threshold) await this.alertAdministrators(day);
    return true;
  }

  private async alertAdministrators(day: Date) {
    const administrators = await this.prisma.user.findMany({
      where: { active: true, role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
      select: { id: true },
    });
    if (!administrators.length) return;
    const claim = await this.prisma.emailDailyUsage.updateMany({ where: { day, alertSent: false }, data: { alertSent: true } });
    if (!claim.count) return;
    await this.prisma.userNotification.createMany({
      data: administrators.map(({ id }) => ({ userId: id, message: 'Le nombre d’e-mails quotidiens approche du plafond configuré. Vérifiez la file d’envoi et le quota du fournisseur.' })),
    });
  }

  private render(template: string, fullName: string | null) {
    const name = this.escapeHtml(fullName || 'fidèle');
    if (template === 'RESPONSIBILITY_RECEIVED') return {
      subject: 'Bienvenue à Amour des Apôtres',
      html: `<p>Bonjour ${name},</p><p>Bienvenue dans l’espace de la paroisse Amour des Apôtres. Votre demande de responsabilité a bien été enregistrée. Le chargé paroissial vous répondra dans un délai de 48 heures.</p><p>« Que tout ce que vous faites se fasse avec amour. » — 1 Corinthiens 16:14</p><p>Paroisse Amour des Apôtres · Sainte-Cécile, Cotonou</p>`,
    };
    if (template === 'INACTIVITY_REMINDER') return {
      subject: 'Vous nous manquez · Amour des Apôtres',
      html: `<p>Bonjour ${name},</p><p>La communauté de la paroisse Amour des Apôtres serait heureuse de vous retrouver dans votre espace fidèle.</p><p>Connectez-vous pour découvrir les actualités et rester en lien avec la paroisse.</p><p>Paroisse Amour des Apôtres · Sainte-Cécile, Cotonou</p>`,
    };
    return {
      subject: 'Mise à jour de votre demande · Amour des Apôtres',
      html: `<p>Bonjour ${name},</p><p>Une mise à jour concerne votre demande de responsabilité paroissiale. Connectez-vous à votre espace pour consulter vos notifications.</p><p>Paroisse Amour des Apôtres · Sainte-Cécile, Cotonou</p>`,
    };
  }

  private escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
  }

  private nextUtcDay() {
    const next = new Date();
    next.setUTCHours(24, 0, 0, 0);
    return next;
  }
}
