import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class EmailQuotaService {
  private readonly logger = new Logger(EmailQuotaService.name);
  constructor(private readonly prisma: PrismaService) {}

  async sendImmediate(to: string, subject: string, html: string) {
    if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) return false;
    let reserved = false;
    try { reserved = await this.reserveSlot(); }
    catch { this.logger.warn('Le compteur quotidien d’e-mails est indisponible. Aucun message n’a été envoyé.'); return false; }
    if (!reserved) return false;
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, html }),
      });
      if (!response.ok) this.logger.warn('Le fournisseur e-mail a refusé un envoi. Aucun destinataire ni contenu n’a été journalisé.');
      return response.ok;
    } catch {
      this.logger.warn('Échec réseau du fournisseur e-mail. Aucun destinataire ni contenu n’a été journalisé.');
      return false;
    }
  }

  private async reserveSlot() {
    const rawLimit = Number(process.env.RESEND_DAILY_LIMIT ?? 100);
    const limit = Number.isInteger(rawLimit) && rawLimit > 0 && rawLimit <= 100 ? rawLimit : 100;
    const day = new Date(); day.setUTCHours(0, 0, 0, 0);
    await this.prisma.emailDailyUsage.upsert({where:{day},create:{day,sentCount:0},update:{}});
    const reservation = await this.prisma.emailDailyUsage.updateMany({where:{day,sentCount:{lt:limit}},data:{sentCount:{increment:1}}});
    if (!reservation.count) return false;
    const usage = await this.prisma.emailDailyUsage.findUnique({where:{day},select:{sentCount:true}});
    if (!usage) return false;
    const rawThreshold = Number(process.env.RESEND_ALERT_AT ?? Math.ceil(limit * 0.8));
    const threshold = Number.isInteger(rawThreshold) && rawThreshold > 0 ? Math.min(limit, rawThreshold) : Math.ceil(limit * 0.8);
    if (usage.sentCount >= threshold) await this.alertAdministrators(day);
    return true;
  }

  private async alertAdministrators(day: Date) {
    const claim = await this.prisma.emailDailyUsage.updateMany({ where: { day, alertSent: false }, data: { alertSent: true } });
    if (claim.count) this.logger.warn('Le plafond quotidien d’e-mails approche. Vérifiez le quota configuré auprès du fournisseur.');
  }
}
