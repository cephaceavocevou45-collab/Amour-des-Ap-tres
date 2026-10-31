import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpException, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUrl, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './auth.guard';
import { RateLimitGuard } from './rate-limit.guard';

class ProgramEntryDto {
  @IsISO8601({ strict: true }) date!: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime?: string;
  @IsString() @Length(2, 80) category!: string;
  @IsString() @Length(2, 180) title!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(120, { each: true }) people?: string[];
  @IsOptional() @IsString() @MaxLength(3000) details?: string;
}
class ProgramDto {
  @IsString() @Length(3, 160) title!: string;
  @IsISO8601({ strict: true }) weekStart!: string;
  @IsISO8601({ strict: true }) weekEnd!: string;
  @IsOptional() @IsString() @MaxLength(300) theme?: string;
  @IsIn(['WEEKLY', 'CHILD_OUTING', 'MEMORIAL_VIGIL', 'PARISH_EVENT', 'COMMUNIQUE']) templateType!: string;
  @IsOptional() @IsString() @MaxLength(20000) templateData?: string;
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => ProgramEntryDto) entries!: ProgramEntryDto[];
}
class TreasuryDto {
  @IsIn(['RECETTE', 'DEPENSE']) kind!: string;
  @IsInt() @Min(1) @Max(2_000_000_000) amountXof!: number;
  @IsISO8601({ strict: true }) occurredAt!: string;
  @IsString() @Length(2, 100) category!: string;
  @IsString() @Length(3, 1000) description!: string;
  @IsOptional() @IsString() @MaxLength(160) reference?: string;
  @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) @MaxLength(1000) receiptUrl?: string;
}

const isoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime());
const startOfDate = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
const staffOrAdmin = (role: string) => ['SECRETAIRE_PROGRAMME', 'ADMIN', 'SUPER_ADMIN'].includes(role);
const treasuryOrAdmin = (role: string) => ['TRESORIER', 'ADMIN', 'SUPER_ADMIN'].includes(role);
const sevenDaysAfter = (date: Date) => new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000);
const summarize = (program: any) => {
  if (program.templateType !== 'WEEKLY') {
    const labels: Record<string, string> = { CHILD_OUTING: 'Sortie d’enfants', MEMORIAL_VIGIL: 'Veillée en mémoire', PARISH_EVENT: 'Événement paroissial', COMMUNIQUE: 'Communiqué important' };
    const fieldLabels: Record<string, string> = {
      family: 'Dans les familles', conductor: 'Conducteur', plateauCarrier: 'Porteur de plateau', childCarrier: 'Porteur d’enfant',
      prayers: 'Prière de trois personnes', exhortation: 'Exhortation', closingPrayer: 'Prière de clôture',
      requestedBy: 'Sollicitée par', singlePrayer: 'Prière d’une personne', reading: 'Lecture', reader: 'Lecteur', preacher: 'Prédicateur',
      location: 'Lieu', organizer: 'Organisé par', description: 'Informations',
    };
    const entries = (program.entries ?? []).map((entry: any) => {
      let data: Record<string, any> = {};
      try { data = JSON.parse(entry.details ?? '{}'); } catch { /* Keep legacy free-form details below. */ }
      const date = entry.date instanceof Date ? entry.date.toISOString().slice(0, 10) : String(entry.date).slice(0, 10);
      const time = entry.startTime ? ` · ${entry.startTime}${entry.endTime ? `–${entry.endTime}` : ''}` : '';
      const title = program.templateType === 'MEMORIAL_VIGIL' ? (data.memorial || entry.title) : entry.title;
      const lines = Object.entries(fieldLabels).flatMap(([key, label]) => {
        const value = data[key];
        if (Array.isArray(value) && value.length) return [`${label} : ${value.filter(Boolean).join(' · ')}`];
        if (typeof value === 'string' && value.trim()) return [`${label} : ${value.trim()}`];
        return [];
      });
      if (!Object.keys(data).length && entry.details) lines.push(entry.details);
      return [`${date}${time} — ${title}`, ...lines.map(line => `  ${line}`)].join('\n');
    });
    return [`${labels[program.templateType] ?? 'Programme paroissial'} — ${program.title}`, ...entries].join('\n\n');
  }
  const heading = `${program.title} — du ${program.weekStart.toISOString().slice(0,10)} au ${program.weekEnd.toISOString().slice(0,10)}${program.theme ? ` — Thème : ${program.theme}` : ''}`;
  const lines = program.entries.map((entry: any) => {
    if (entry.category === 'Fiche hebdomadaire') {
      try {
        const data = JSON.parse(entry.details ?? '{}');
        return `${entry.date.toISOString().slice(0,10)}${entry.startTime ? ` · ${entry.startTime}` : ''} — ${data.day ?? entry.title}\n  Conducteur : ${data.conductor || '—'} · Prières : ${(data.prayers ?? []).filter(Boolean).join(', ') || '—'}\n  Textes : ${[data.firstText,data.secondText].filter(Boolean).join(' / ') || '—'} · Lecteurs : ${data.readers || '—'} · Prédicateur : ${data.preacher || '—'}\n  Quête H/F : ${data.offering || '—'} · Prière sur quête : ${data.offeringPrayer || '—'} · Clôture : ${data.closingPrayer || '—'}`;
      } catch { /* Older free-form programme entries remain printable. */ }
    }
    const people = entry.people?.length ? ` (${entry.people.join(', ')})` : '';
    const time = entry.startTime ? ` à ${entry.startTime}${entry.endTime ? `–${entry.endTime}` : ''}` : '';
    return `• ${entry.date.toISOString().slice(0,10)}${time} — ${entry.category} : ${entry.title}${people}${entry.details ? `\n  ${entry.details}` : ''}`;
  });
  return [heading, ...lines].join('\n');
};

@UseGuards(JwtAuthGuard, RateLimitGuard)
@Controller('parish-programs')
export class ParishProgramController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('public') async publicPrograms(@Req() req: any) {
    if (req.user.role !== 'FIDELE') throw new ForbiddenException('Cette rubrique est réservée aux comptes fidèles.');
    // Keep published programs visible as an archive after their week has passed.
    const programs = await this.prisma.weekProgram.findMany({ where: { status: 'PUBLIE' }, orderBy: [{ publishedAt: 'desc' }, { weekStart: 'desc' }], take: 16, include: { entries: { orderBy: [{ date: 'asc' }, { displayOrder: 'asc' }] } } });
    return programs.map(program => ({ ...program, recap: summarize(program) }));
  }

  @Get() async list(@Req() req: any) {
    if (!staffOrAdmin(req.user.role)) throw new ForbiddenException('Accès réservé au secrétariat de la paroisse et à l’administration.');
    const where = req.user.role === 'SECRETAIRE_PROGRAMME' ? { authorId: req.user.sub } : {};
    return this.prisma.weekProgram.findMany({ where, orderBy: [{ weekStart: 'desc' }, { updatedAt: 'desc' }], take: 100, include: { author: { select: { id: true, fullName: true, email: true } }, entries: { orderBy: [{ date: 'asc' }, { displayOrder: 'asc' }] } } });
  }

  @Post() async create(@Body() body: ProgramDto, @Req() req: any) {
    if (!staffOrAdmin(req.user.role)) throw new ForbiddenException('Accès réservé au secrétariat de la paroisse et à l’administration.');
    this.validateProgram(body);
    const templateData = this.parseTemplateData(body);
    const program = await this.prisma.weekProgram.create({ data: { title: body.title.trim(), weekStart: startOfDate(body.weekStart), weekEnd: startOfDate(body.weekEnd), theme: body.theme?.trim() || null, templateType: body.templateType, templateData: templateData as any, authorId: req.user.sub, entries: { create: body.entries.map((entry, displayOrder) => this.entryData(entry, displayOrder)) } }, include: { entries: { orderBy: [{ date: 'asc' }, { displayOrder: 'asc' }] } } });
    await this.audit(req.user.sub, 'PROGRAMME_HEBDOMADAIRE_CREE', program.id, { title: program.title, weekStart: program.weekStart.toISOString().slice(0,10), weekEnd: program.weekEnd.toISOString().slice(0,10), theme: program.theme, entries: program.entries.map(entry => ({ date: entry.date.toISOString().slice(0,10), startTime: entry.startTime, endTime: entry.endTime, category: entry.category, title: entry.title, people: entry.people, details: entry.details })) }, req.ip);
    return { ...program, recap: summarize(program) };
  }

  @Patch(':id') async update(@Param('id') id: string, @Body() body: ProgramDto, @Req() req: any) {
    if (!staffOrAdmin(req.user.role)) throw new ForbiddenException('Accès réservé au secrétariat de la paroisse et à l’administration.');
    this.validateProgram(body);
    const current = await this.prisma.weekProgram.findUnique({ where: { id }, include: { entries: true } });
    if (!current || (req.user.role === 'SECRETAIRE_PROGRAMME' && current.authorId !== req.user.sub)) throw new NotFoundException('Programme introuvable.');
    if (current.status === 'ARCHIVE') throw new HttpException('Ce programme est archivé et ne peut plus être modifié.', 409);
    if (current.status === 'PUBLIE' && (!current.publishedAt || new Date() > sevenDaysAfter(current.publishedAt))) throw new HttpException('La période de modification de sept jours est terminée.', 403);
    const updated = await this.prisma.$transaction(async tx => {
      const claimed = await tx.weekProgram.updateMany({ where: { id, updatedAt: current.updatedAt }, data: { title: body.title.trim(), weekStart: startOfDate(body.weekStart), weekEnd: startOfDate(body.weekEnd), theme: body.theme?.trim() || null, templateType: body.templateType, templateData: this.parseTemplateData(body) as any } });
      if (claimed.count !== 1) throw new HttpException('Le programme vient d’être modifié par une autre session. Rechargez la page.', 409);
      await tx.weekProgramEntry.deleteMany({ where: { programId: id } });
      if (body.entries.length) await tx.weekProgramEntry.createMany({ data: body.entries.map((entry, displayOrder) => ({ ...this.entryData(entry, displayOrder), programId: id })) });
      return tx.weekProgram.findUniqueOrThrow({ where: { id }, include: { entries: { orderBy: [{ date: 'asc' }, { displayOrder: 'asc' }] } } });
    });
    await this.audit(req.user.sub, 'PROGRAMME_HEBDOMADAIRE_MODIFIE', id, { title: updated.title, weekStart: updated.weekStart.toISOString().slice(0,10), weekEnd: updated.weekEnd.toISOString().slice(0,10), theme: updated.theme, status: updated.status, entries: updated.entries.map(entry => ({ date: entry.date.toISOString().slice(0,10), startTime: entry.startTime, endTime: entry.endTime, category: entry.category, title: entry.title, people: entry.people, details: entry.details })) }, req.ip);
    return { ...updated, recap: summarize(updated) };
  }

  @Post(':id/publish') async publish(@Param('id') id: string, @Req() req: any) {
    if (!staffOrAdmin(req.user.role)) throw new ForbiddenException('Accès réservé au secrétariat de la paroisse et à l’administration.');
    const current = await this.prisma.weekProgram.findUnique({ where: { id }, include: { entries: { orderBy: [{ date: 'asc' }, { displayOrder: 'asc' }] } } });
    if (!current || (req.user.role === 'SECRETAIRE_PROGRAMME' && current.authorId !== req.user.sub)) throw new NotFoundException('Programme introuvable.');
    if (current.status !== 'BROUILLON') throw new HttpException('Seul un brouillon peut être publié.', 409);
    if (!current.entries.length) throw new BadRequestException('Ajoutez au moins une activité avant la publication.');
    const published = await this.prisma.$transaction(async tx => {
      const item = await tx.weekProgram.update({ where: { id }, data: { status: 'PUBLIE', publishedAt: new Date() }, include: { entries: { orderBy: [{ date: 'asc' }, { displayOrder: 'asc' }] } } });
      const users = await tx.user.findMany({ where: { active: true }, select: { id: true } });
      if (users.length) await tx.notification.createMany({ data: users.map(user => ({ userId: user.id, title: 'Nouveau programme paroissial', body: `Le programme « ${item.title} » est disponible dans l’espace des fidèles.`, href: '/fideles' })) });
      return item;
    });
    await this.audit(req.user.sub, 'PROGRAMME_HEBDOMADAIRE_PUBLIE', id, { title: published.title, weekStart: published.weekStart.toISOString().slice(0,10), weekEnd: published.weekEnd.toISOString().slice(0,10), theme: published.theme, entries: published.entries.map(entry => ({ date: entry.date.toISOString().slice(0,10), startTime: entry.startTime, endTime: entry.endTime, category: entry.category, title: entry.title, people: entry.people, details: entry.details })) }, req.ip);
    return { ...published, recap: summarize(published) };
  }

  private validateProgram(body: ProgramDto) {
    if (!['WEEKLY', 'CHILD_OUTING', 'MEMORIAL_VIGIL', 'PARISH_EVENT', 'COMMUNIQUE'].includes(body.templateType)) throw new BadRequestException('Choisissez un type de fiche valide.');
    if (!isoDate(body.weekStart) || !isoDate(body.weekEnd) || body.weekEnd < body.weekStart) throw new BadRequestException('Les dates de la semaine ne sont pas valides.');
    const days = (startOfDate(body.weekEnd).getTime() - startOfDate(body.weekStart).getTime()) / 86_400_000;
    if (body.templateType === 'WEEKLY' && days > 13) throw new BadRequestException('Un programme couvre au maximum quatorze jours.');
    for (const entry of body.entries) if (!isoDate(entry.date) || entry.date < body.weekStart || entry.date > body.weekEnd) throw new BadRequestException('Chaque activité doit être datée dans la période du programme.');
  }
  private parseTemplateData(body: ProgramDto): Record<string, unknown> | null {
    if (!body.templateData) return null;
    try {
      const parsed = JSON.parse(body.templateData);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
      return parsed;
    } catch { throw new BadRequestException('Les informations de la fiche sont invalides.'); }
  }
  private entryData(entry: ProgramEntryDto, displayOrder: number) { return { date: startOfDate(entry.date), startTime: entry.startTime || null, endTime: entry.endTime || null, category: entry.category.trim(), title: entry.title.trim(), people: (entry.people ?? []).map(name => name.trim()).filter(Boolean), details: entry.details?.trim() || null, displayOrder }; }
  private audit(userId: string, action: string, id: string, after: object, ip: string) { return this.prisma.auditLog.create({ data: { userId, action, entity: 'WeekProgram', entityId: id, after, ip: ip ?? 'unknown' } }); }
}

@UseGuards(JwtAuthGuard, RateLimitGuard)
@Controller('treasury')
export class TreasuryController {
  constructor(private readonly prisma: PrismaService) {}

  @Get() async list(@Req() req: any) {
    if (!treasuryOrAdmin(req.user.role)) throw new ForbiddenException('Les écritures financières sont réservées au trésorier et à l’administration.');
    const entries = await this.prisma.treasuryEntry.findMany({ orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }], take: 500, include: { author: { select: { id: true, fullName: true, email: true } } } });
    const total = entries.reduce((sum, entry) => sum + (entry.kind === 'RECETTE' ? entry.amountXof : -entry.amountXof), 0);
    return { entries, totalXof: total };
  }

  @Post() async create(@Body() body: TreasuryDto, @Req() req: any) {
    if (!treasuryOrAdmin(req.user.role)) throw new ForbiddenException('Les écritures financières sont réservées au trésorier et à l’administration.');
    if (!isoDate(body.occurredAt)) throw new BadRequestException('La date n’est pas valide.');
    const entry = await this.prisma.treasuryEntry.create({ data: { kind: body.kind as any, amountXof: body.amountXof, occurredAt: startOfDate(body.occurredAt), category: body.category.trim(), description: body.description.trim(), reference: body.reference?.trim() || null, receiptUrl: body.receiptUrl?.trim() || null, authorId: req.user.sub }, include: { author: { select: { id: true, fullName: true, email: true } } } });
    await this.prisma.auditLog.create({ data: { userId: req.user.sub, action: 'TRESORERIE_ECRITURE_CREEE', entity: 'TreasuryEntry', entityId: entry.id, after: { kind: entry.kind, amountXof: entry.amountXof, occurredAt: entry.occurredAt.toISOString().slice(0,10), category: entry.category, description: entry.description, reference: entry.reference, receiptUrl: entry.receiptUrl }, ip: req.ip ?? 'unknown' } });
    return entry;
  }

  @Patch(':id') async update(@Param('id') id: string, @Body() body: TreasuryDto, @Req() req: any) {
    if (!treasuryOrAdmin(req.user.role)) throw new ForbiddenException('Les écritures financières sont réservées au trésorier et à l’administration.');
    if (!isoDate(body.occurredAt)) throw new BadRequestException('La date n’est pas valide.');
    const current = await this.prisma.treasuryEntry.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Écriture introuvable.');
    if (Date.now() > current.createdAt.getTime() + 24 * 60 * 60 * 1000) throw new HttpException('Une recette ou une dépense ne peut plus être modifiée après 24 heures.', 403);
    const entry = await this.prisma.$transaction(async tx => {
      const updated = await tx.treasuryEntry.update({ where: { id }, data: { kind: body.kind as any, amountXof: body.amountXof, occurredAt: startOfDate(body.occurredAt), category: body.category.trim(), description: body.description.trim(), reference: body.reference?.trim() || null, receiptUrl: body.receiptUrl?.trim() || null } });
      await tx.auditLog.create({ data: { userId: req.user.sub, action: 'TRESORERIE_ECRITURE_MODIFIEE', entity: 'TreasuryEntry', entityId: id, before: { kind: current.kind, amountXof: current.amountXof, occurredAt: current.occurredAt.toISOString().slice(0,10), category: current.category, description: current.description, reference: current.reference, receiptUrl: current.receiptUrl }, after: { kind: updated.kind, amountXof: updated.amountXof, occurredAt: updated.occurredAt.toISOString().slice(0,10), category: updated.category, description: updated.description, reference: updated.reference, receiptUrl: updated.receiptUrl }, ip: req.ip ?? 'unknown' } });
      return updated;
    });
    return entry;
  }
}
