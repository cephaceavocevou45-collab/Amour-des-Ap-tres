import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, HttpException, Injectable, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsDateString, IsEnum, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { SocialEventRsvpStatus, SocialVisibility, UserRole } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './auth.guard';
import { RateLimitGuard } from './rate-limit.guard';

class CreateEventDto {
  @IsString() @Length(1, 5000) body!: string;
  @IsString() @Length(3, 160) title!: string;
  @IsDateString() startsAt!: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
}
class EventRsvpDto { @IsEnum(SocialEventRsvpStatus) status!: SocialEventRsvpStatus; }

const MEMBER_ROLES: UserRole[] = [UserRole.FIDELE, UserRole.SECRETAIRE_PRESENCE, UserRole.RESPONSABLE_SEMAINE];

@Injectable()
export class SocialEventsService {
  constructor(private readonly prisma: PrismaService) {}

  private member(user: { sub: string; role: string }) {
    if (!MEMBER_ROLES.includes(user.role as UserRole)) throw new ForbiddenException('Cette fonction est réservée aux membres de la communauté paroissiale.');
    return user.sub;
  }

  private async visiblePost(userId: string, postId: string) {
    const now = new Date();
    const post = await this.prisma.socialPost.findFirst({
      where: {
        id: postId, deletedAt: null,
        OR: [{ visibility: SocialVisibility.TOUS_LES_FIDELES }, { authorId: userId }],
        author: { role: { in: MEMBER_ROLES }, active: true, suspendedAt: null, OR: [{ moderationProfileHidden: false }, { moderationProfileHiddenUntil: { lte: now } }] },
        AND: [{ OR: [{ moderationHidden: false }, { moderationHiddenUntil: { lte: now } }] }],
        hiddenBy: { none: { userId } },
      }, select: { id: true, authorId: true },
    });
    if (!post) throw new HttpException('Événement introuvable.', 404);
    const blocked = await this.prisma.socialBlock.findFirst({ where: { OR: [{ blockerId: userId, blockedId: post.authorId }, { blockerId: post.authorId, blockedId: userId }] }, select: { id: true } });
    if (blocked) throw new HttpException('Événement introuvable.', 404);
    return post;
  }

  private async shape(eventId: string, userId: string) {
    const event = await this.prisma.socialEvent.findUnique({ where: { id: eventId }, include: { rsvps: { select: { userId: true, status: true } } } });
    if (!event) throw new HttpException('Événement introuvable.', 404);
    await this.visiblePost(userId, event.postId);
    const counts = { PARTICIPATING: 0, INTERESTED: 0, DECLINED: 0 };
    for (const response of event.rsvps) counts[response.status]++;
    return { id: event.id, title: event.title, startsAt: event.startsAt, endsAt: event.endsAt, location: event.location, counts, userRsvp: event.rsvps.find(response => response.userId === userId)?.status ?? null };
  }

  async create(user: { sub: string; role: string }, dto: CreateEventDto, key?: string) {
    const userId = this.member(user), body = dto.body.trim(), title = dto.title.trim(), idempotencyKey = (key ?? '').trim(), now = new Date();
    if (!body || !title || !/^[A-Za-z0-9_-]{8,120}$/.test(idempotencyKey)) throw new BadRequestException('Un texte, un titre et un identifiant de publication valide sont requis.');
    const startsAt = new Date(dto.startsAt), endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (startsAt.getTime() < now.getTime() + 5 * 60_000 || startsAt.getTime() > now.getTime() + 365 * 24 * 60 * 60_000) throw new BadRequestException('La date doit être prévue entre cinq minutes et un an.');
    if (endsAt && (endsAt <= startsAt || endsAt.getTime() > startsAt.getTime() + 24 * 60 * 60_000)) throw new BadRequestException('La fin doit suivre le début et rester dans les 24 heures.');
    const recent = await this.prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
    if (recent && now.getTime() - recent.createdAt.getTime() < 24 * 60 * 60_000) {
      const count = await this.prisma.socialPost.count({ where: { authorId: userId, createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) } } });
      const limit = Number(process.env.SOCIAL_NEW_ACCOUNT_POSTS_PER_DAY ?? 3);
      if (count >= (Number.isInteger(limit) && limit >= 1 && limit <= 10 ? limit : 3)) throw new HttpException('La limite quotidienne des comptes récents est atteinte. Réessayez demain.', 429);
    }
    const existing = await this.prisma.socialPost.findUnique({ where: { authorId_idempotencyKey: { authorId: userId, idempotencyKey } }, select: { id: true } });
    let postId = existing?.id;
    if (postId) {
      if (!await this.prisma.socialEvent.findUnique({ where: { postId }, select: { id: true } })) throw new HttpException('Cet identifiant a déjà servi à une autre publication.', 409);
    } else {
      const created = await this.prisma.$transaction(async tx => {
        const post = await tx.socialPost.create({ data: { authorId: userId, idempotencyKey, body, visibility: SocialVisibility.TOUS_LES_FIDELES } });
        await tx.socialEvent.create({ data: { postId: post.id, title, startsAt, endsAt, location: dto.location?.trim() || null } });
        return post;
      });
      postId = created.id;
    }
    const event = await this.prisma.socialEvent.findUniqueOrThrow({ where: { postId }, select: { id: true } });
    return { postId, event: await this.shape(event.id, userId) };
  }

  async get(user: { sub: string; role: string }, eventId: string) { return this.shape(eventId, this.member(user)); }

  async rsvp(user: { sub: string; role: string }, eventId: string, dto: EventRsvpDto) {
    const userId = this.member(user), event = await this.prisma.socialEvent.findUnique({ where: { id: eventId }, select: { id: true, postId: true, startsAt: true } });
    if (!event) throw new HttpException('Événement introuvable.', 404);
    await this.visiblePost(userId, event.postId);
    if (event.startsAt <= new Date()) throw new HttpException('Les réponses à cet événement sont clôturées.', 409);
    const key = { eventId_userId: { eventId, userId } };
    const existing = await this.prisma.socialEventRsvp.findUnique({ where: key, select: { status: true } });
    const account = await this.prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
    if (!existing && account && Date.now() - account.createdAt.getTime() < 24 * 60 * 60_000) {
      const configuredLimit = Number(process.env.SOCIAL_NEW_ACCOUNT_EVENT_RSVPS_PER_DAY ?? 5);
      const limit = Number.isInteger(configuredLimit) && configuredLimit >= 1 && configuredLimit <= 20 ? configuredLimit : 5;
      const count = await this.prisma.socialEventRsvp.count({ where: { userId, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } } });
      if (count >= limit) throw new HttpException('La limite quotidienne de réponses aux événements des nouveaux comptes est atteinte.', 429);
    }
    await this.prisma.socialEventRsvp.upsert({ where: key, update: { status: dto.status }, create: { eventId, userId, status: dto.status } });
    return this.shape(eventId, userId);
  }
}

@Controller('social/events')
@UseGuards(JwtAuthGuard, RateLimitGuard)
export class SocialEventsController {
  constructor(private readonly events: SocialEventsService) {}
  @Post() create(@Req() req: any, @Body() dto: CreateEventDto, @Headers('idempotency-key') key?: string) { return this.events.create(req.user, dto, key); }
  @Get(':id') get(@Req() req: any, @Param('id') id: string) { return this.events.get(req.user, id); }
  @Post(':id/rsvp') rsvp(@Req() req: any, @Param('id') id: string, @Body() dto: EventRsvpDto) { return this.events.rsvp(req.user, id, dto); }
}
