import { Body, Controller, Delete, ForbiddenException, Get, Injectable, NotFoundException, Param, Patch, Post, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { ParishContentKind } from './generated/prisma';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './auth.guard';
import { RateLimitGuard } from './rate-limit.guard';

class ContentDto {
  @IsIn(['PROGRAMME', 'EVENEMENT']) kind!: ParishContentKind;
  @IsString() @Length(3, 160) title!: string;
  @IsString() @Length(1, 5000) body!: string;
  @IsOptional() @IsString() @MaxLength(240) location?: string;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsBoolean() published?: boolean;
}
class StudyThemeDto {
  @IsDateString() studyDate!: string;
  @IsString() @Length(3, 240) title!: string;
  @IsOptional() @IsString() @MaxLength(240) bibleReference?: string;
  @IsOptional() @IsString() @MaxLength(5000) summary?: string;
  @IsOptional() @IsBoolean() published?: boolean;
}
class HistoryDto {
  @IsString() @Length(3, 160) title!: string;
  @IsString() @Length(1, 10000) body!: string;
  @IsOptional() @IsBoolean() published?: boolean;
}
type Actor = { sub: string; role: string; permissions?: string[] };
const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];

@Injectable()
export class ParishContentService {
  constructor(private readonly prisma: PrismaService) {}
  private allowed(actor: Actor, permission: string) {
    if (!ADMIN_ROLES.includes(actor.role) && !actor.permissions?.includes(permission)) throw new ForbiddenException('Votre compte ne dispose pas de cette autorisation.');
  }
  private date(value?: string) { return value ? new Date(value) : undefined; }
  private async audit(actor: Actor, action: string, entity: string, entityId: string, reason?: string) {
    await this.prisma.auditLog.create({ data: { userId: actor.sub, action, entity, entityId, ...(reason ? { reason } : {}) } });
  }
  async listContent(actor: Actor, kind: ParishContentKind) {
    return this.prisma.parishContent.findMany({
      where: { kind, OR: [{ publishedAt: { not: null } }, { authorId: actor.sub }] },
      orderBy: [{ startsAt: 'asc' }, { createdAt: 'desc' }], take: 100,
      select: { id: true, kind: true, title: true, body: true, location: true, startsAt: true, endsAt: true, publishedAt: true, createdAt: true },
    });
  }
  async createContent(actor: Actor, dto: ContentDto) {
    this.allowed(actor, 'PUBLIER_PROGRAMME');
    const startsAt = this.date(dto.startsAt), endsAt = this.date(dto.endsAt);
    if (startsAt && endsAt && endsAt <= startsAt) throw new BadRequestException('La date de fin doit suivre la date de début.');
    const row = await this.prisma.parishContent.create({ data: { kind: dto.kind, title: dto.title.trim(), body: dto.body.trim(), location: dto.location?.trim() || null, startsAt, endsAt, authorId: actor.sub, publishedAt: dto.published ? new Date() : null } });
    await this.audit(actor, 'CONTENU_PAROISSIAL_CREE', 'ParishContent', row.id);
    return row;
  }
  async updateContent(actor: Actor, id: string, dto: ContentDto) {
    this.allowed(actor, 'PUBLIER_PROGRAMME');
    const old = await this.prisma.parishContent.findUnique({ where: { id } });
    if (!old) throw new NotFoundException('Publication introuvable.');
    if (old.authorId !== actor.sub && !ADMIN_ROLES.includes(actor.role)) throw new ForbiddenException('Seul l’auteur ou l’administration peut modifier cette publication.');
    const startsAt = this.date(dto.startsAt), endsAt = this.date(dto.endsAt);
    if (startsAt && endsAt && endsAt <= startsAt) throw new BadRequestException('La date de fin doit suivre la date de début.');
    const row = await this.prisma.parishContent.update({ where: { id }, data: { kind: dto.kind, title: dto.title.trim(), body: dto.body.trim(), location: dto.location?.trim() || null, startsAt, endsAt, editorId: actor.sub, ...(dto.published === undefined ? {} : { publishedAt: dto.published ? old.publishedAt ?? new Date() : null }) } });
    await this.audit(actor, 'CONTENU_PAROISSIAL_MODIFIE', 'ParishContent', id);
    return row;
  }
  async deleteContent(actor: Actor, id: string) {
    this.allowed(actor, 'PUBLIER_PROGRAMME');
    const old = await this.prisma.parishContent.findUnique({ where: { id }, select: { id: true, authorId: true } });
    if (!old) throw new NotFoundException('Publication introuvable.');
    if (old.authorId !== actor.sub && !ADMIN_ROLES.includes(actor.role)) throw new ForbiddenException('Seul l’auteur ou l’administration peut retirer cette publication.');
    await this.audit(actor, 'CONTENU_PAROISSIAL_SUPPRIME', 'ParishContent', id);
    await this.prisma.parishContent.delete({ where: { id } });
    return { deleted: true };
  }
  async studies(actor: Actor) {
    const themes = await this.prisma.bibleStudyTheme.findMany({ where: { OR: [{ publishedAt: { not: null } }, { editorId: actor.sub }] }, orderBy: { studyDate: 'desc' }, take: 100, select:{id:true,studyDate:true,title:true,bibleReference:true,summary:true,publishedAt:true} });
    return { sections: [{ key: 'interdits', label: '12 interdits', expectedItems: 12 }, { key: 'ordonnances', label: '11 ordonnances', expectedItems: 11 }, { key: 'commandements', label: '10 commandements', expectedItems: 10 }, { key: 'sacrements', label: '4 sacrements', expectedItems: 4 }], sourceDocumentAvailable: false, notice: 'Les textes doctrinaux seront ajoutés après réception et validation du document de référence.', themes };
  }
  async saveTheme(actor: Actor, dto: StudyThemeDto) {
    this.allowed(actor, 'GERER_ETUDES');
    const parsed = new Date(dto.studyDate);
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException('Date d’étude invalide.');
    const studyDate = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
    const row = await this.prisma.bibleStudyTheme.upsert({ where: { studyDate }, create: { studyDate, title: dto.title.trim(), bibleReference: dto.bibleReference?.trim() || null, summary: dto.summary?.trim() || null, editorId: actor.sub, publishedAt: dto.published ? new Date() : null }, update: { title: dto.title.trim(), bibleReference: dto.bibleReference?.trim() || null, summary: dto.summary?.trim() || null, editorId: actor.sub, ...(dto.published === undefined ? {} : { publishedAt: dto.published ? new Date() : null }) } });
    await this.audit(actor, 'ETUDE_BIBLIQUE_MODIFIEE', 'BibleStudyTheme', row.id);
    return row;
  }
  async listHistory(actor: Actor) {
    return this.prisma.parishHistoryEntry.findMany({ where: { OR: [{ publishedAt: { not: null } }, ...(actor.permissions?.includes('PUBLIER_HISTOIRE') || ADMIN_ROLES.includes(actor.role) ? [{ authorId: actor.sub }] : [])] }, orderBy: [{ createdAt: 'desc' }], take: 100, select: { id: true, title: true, body: true, publishedAt: true, createdAt: true } });
  }
  async createHistory(actor: Actor, dto: HistoryDto) {
    this.allowed(actor, 'PUBLIER_HISTOIRE');
    const row = await this.prisma.parishHistoryEntry.create({ data: { title: dto.title.trim(), body: dto.body.trim(), authorId: actor.sub, publishedAt: dto.published ? new Date() : null } });
    await this.audit(actor, 'HISTOIRE_PAROISSE_CREEE', 'ParishHistoryEntry', row.id);
    return row;
  }
  async updateHistory(actor: Actor, id: string, dto: HistoryDto) {
    this.allowed(actor, 'PUBLIER_HISTOIRE');
    const old = await this.prisma.parishHistoryEntry.findUnique({ where: { id }, select: { id: true, authorId: true, publishedAt: true } });
    if (!old) throw new NotFoundException('Entrée historique introuvable.');
    if (old.authorId !== actor.sub && !ADMIN_ROLES.includes(actor.role)) throw new ForbiddenException('Seul l’auteur ou l’administration peut modifier cette entrée.');
    const row = await this.prisma.parishHistoryEntry.update({ where: { id }, data: { title: dto.title.trim(), body: dto.body.trim(), ...(dto.published === undefined ? {} : { publishedAt: dto.published ? old.publishedAt ?? new Date() : null }) } });
    await this.audit(actor, 'HISTOIRE_PAROISSE_MODIFIEE', 'ParishHistoryEntry', id);
    return row;
  }
  async deleteHistory(actor: Actor, id: string) {
    this.allowed(actor, 'PUBLIER_HISTOIRE');
    const old = await this.prisma.parishHistoryEntry.findUnique({ where: { id }, select: { id: true, authorId: true } });
    if (!old) throw new NotFoundException('Entrée historique introuvable.');
    if (old.authorId !== actor.sub && !ADMIN_ROLES.includes(actor.role)) throw new ForbiddenException('Seul l’auteur ou l’administration peut retirer cette entrée.');
    await this.audit(actor, 'HISTOIRE_PAROISSE_SUPPRIMEE', 'ParishHistoryEntry', id);
    await this.prisma.parishHistoryEntry.delete({ where: { id } });
    return { deleted: true };
  }
}

@Controller('community/content')
@UseGuards(JwtAuthGuard, RateLimitGuard)
export class ParishContentController {
  constructor(private readonly service: ParishContentService) {}
  @Get('programmes') programmes(@Req() req: any) { return this.service.listContent(req.user, ParishContentKind.PROGRAMME); }
  @Post('programmes') createProgramme(@Req() req: any, @Body() dto: ContentDto) { return this.service.createContent(req.user, { ...dto, kind: ParishContentKind.PROGRAMME }); }
  @Get('events') events(@Req() req: any) { return this.service.listContent(req.user, ParishContentKind.EVENEMENT); }
  @Post('events') createEvent(@Req() req: any, @Body() dto: ContentDto) { return this.service.createContent(req.user, { ...dto, kind: ParishContentKind.EVENEMENT }); }
  @Patch('items/:id') updateContent(@Req() req: any, @Param('id') id: string, @Body() dto: ContentDto) { return this.service.updateContent(req.user, id, dto); }
  @Delete('items/:id') deleteContent(@Req() req: any, @Param('id') id: string) { return this.service.deleteContent(req.user, id); }
  @Get('studies') studies(@Req() req: any) { return this.service.studies(req.user); }
  @Post('studies/themes') saveTheme(@Req() req: any, @Body() dto: StudyThemeDto) { return this.service.saveTheme(req.user, dto); }
  @Get('history') history(@Req() req: any) { return this.service.listHistory(req.user); }
  @Post('history') createHistory(@Req() req: any, @Body() dto: HistoryDto) { return this.service.createHistory(req.user, dto); }
  @Patch('history/:id') updateHistory(@Req() req: any, @Param('id') id: string, @Body() dto: HistoryDto) { return this.service.updateHistory(req.user, id, dto); }
  @Delete('history/:id') deleteHistory(@Req() req: any, @Param('id') id: string) { return this.service.deleteHistory(req.user, id); }
}
