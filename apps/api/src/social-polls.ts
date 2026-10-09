import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, HttpException, Injectable, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsArray, IsDateString, IsOptional, IsString, Length, Matches, ArrayMaxSize, ArrayMinSize } from 'class-validator';
import { SocialVisibility, UserRole } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './auth.guard';
import { RateLimitGuard } from './rate-limit.guard';

class CreatePollDto {
  @IsString() @Length(1, 5000) body!: string;
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(6) @IsString({ each: true }) @Length(1, 120, { each: true }) options!: string[];
  @IsOptional() @IsDateString() closesAt?: string;
}
class VotePollDto { @IsString() @Matches(/^[a-zA-Z0-9_-]{1,40}$/) optionId!: string; }

const MEMBER_ROLES: UserRole[] = [UserRole.FIDELE, UserRole.SECRETAIRE_PRESENCE, UserRole.RESPONSABLE_SEMAINE];

@Injectable()
export class SocialPollsService {
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
    if (!post) throw new HttpException('Publication introuvable.', 404);
    const blocked = await this.prisma.socialBlock.findFirst({ where: { OR: [{ blockerId: userId, blockedId: post.authorId }, { blockerId: post.authorId, blockedId: userId }] }, select: { id: true } });
    if (blocked) throw new HttpException('Publication introuvable.', 404);
    return post;
  }

  async results(user: { sub: string; role: string }, pollId: string) {
    const userId = this.member(user);
    const poll = await this.prisma.socialPoll.findUnique({ where: { id: pollId }, include: { post: { select: { id: true } }, options: { orderBy: { position: 'asc' }, include: { _count: { select: { votes: true } } } }, votes: { where: { userId }, select: { optionId: true } } } });
    if (!poll) throw new HttpException('Sondage introuvable.', 404);
    await this.visiblePost(userId, poll.postId);
    const totalVotes = poll.options.reduce((sum, option) => sum + option._count.votes, 0);
    return { id: poll.id, closesAt: poll.closesAt, closed: Boolean(poll.closesAt && poll.closesAt <= new Date()), totalVotes, userVote: poll.votes[0]?.optionId ?? null, options: poll.options.map(option => ({ id: option.id, text: option.text, votes: option._count.votes, percentage: totalVotes ? Math.round(option._count.votes * 100 / totalVotes) : 0 })) };
  }

  async create(user: { sub: string; role: string }, dto: CreatePollDto, key?: string) {
    const userId = this.member(user);
    const body = dto.body.trim(), options = dto.options.map(option => option.trim()), idempotencyKey = (key ?? '').trim();
    if (!body || !/^[A-Za-z0-9_-]{8,120}$/.test(idempotencyKey)) throw new BadRequestException('Un texte et un identifiant de publication valide sont requis.');
    if (options.some(option => !option) || new Set(options.map(option => option.toLocaleLowerCase('fr-FR'))).size !== options.length) throw new BadRequestException('Les choix doivent être distincts et non vides.');
    const closesAt = dto.closesAt ? new Date(dto.closesAt) : null, now = new Date();
    if (closesAt && (closesAt.getTime() < now.getTime() + 60_000 || closesAt.getTime() > now.getTime() + 30 * 24 * 60 * 60_000)) throw new BadRequestException('La clôture doit être prévue dans la prochaine minute à 30 jours.');
    const recent = await this.prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
    if (recent && now.getTime() - recent.createdAt.getTime() < 24 * 60 * 60_000) {
      const count = await this.prisma.socialPost.count({ where: { authorId: userId, createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) } } });
      const limit = Number(process.env.SOCIAL_NEW_ACCOUNT_POSTS_PER_DAY ?? 3);
      if (count >= (Number.isInteger(limit) && limit >= 1 && limit <= 10 ? limit : 3)) throw new HttpException('La limite quotidienne des comptes récents est atteinte. Réessayez demain.', 429);
    }
    const existing = await this.prisma.socialPost.findUnique({ where: { authorId_idempotencyKey: { authorId: userId, idempotencyKey } }, select: { id: true } });
    let postId = existing?.id;
    if (postId) {
      const existingPoll = await this.prisma.socialPoll.findUnique({ where: { postId }, select: { id: true } });
      if (!existingPoll) throw new HttpException('Cet identifiant a déjà servi à une autre publication.', 409);
    } else {
      const created = await this.prisma.$transaction(async tx => {
        const post = await tx.socialPost.create({ data: { authorId: userId, idempotencyKey, body, visibility: SocialVisibility.TOUS_LES_FIDELES } });
        await tx.socialPoll.create({ data: { postId: post.id, closesAt, options: { create: options.map((text, position) => ({ text, position })) } } });
        return post;
      });
      postId = created.id;
    }
    const poll = await this.prisma.socialPoll.findUniqueOrThrow({ where: { postId } });
    return { postId, poll: await this.results(user, poll.id) };
  }

  async vote(user: { sub: string; role: string }, pollId: string, dto: VotePollDto) {
    const userId = this.member(user);
    const poll = await this.prisma.socialPoll.findUnique({ where: { id: pollId }, select: { id: true, postId: true, closesAt: true } });
    if (!poll) throw new HttpException('Sondage introuvable.', 404);
    await this.visiblePost(userId, poll.postId);
    if (poll.closesAt && poll.closesAt <= new Date()) throw new HttpException('Ce sondage est clôturé.', 409);
    const option = await this.prisma.socialPollOption.findFirst({ where: { id: dto.optionId, pollId }, select: { id: true } });
    if (!option) throw new BadRequestException('Ce choix ne fait pas partie du sondage.');
    const key = { pollId_userId: { pollId, userId } };
    const previous = await this.prisma.socialPollVote.findUnique({ where: key, select: { optionId: true } });
    const account = await this.prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
    if (!previous && account && Date.now() - account.createdAt.getTime() < 24 * 60 * 60_000) {
      const configuredLimit = Number(process.env.SOCIAL_NEW_ACCOUNT_VOTES_PER_DAY ?? 5);
      const limit = Number.isInteger(configuredLimit) && configuredLimit >= 1 && configuredLimit <= 20 ? configuredLimit : 5;
      const count = await this.prisma.socialPollVote.count({ where: { userId, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } } });
      if (count >= limit) throw new HttpException('La limite quotidienne de votes des nouveaux comptes est atteinte.', 429);
    }
    await this.prisma.socialPollVote.upsert({ where: key, update: { optionId: option.id }, create: { pollId, optionId: option.id, userId } });
    if (previous && previous.optionId !== option.id) {
      await this.prisma.auditLog.create({ data: { action: 'SONDAGE_VOTE_MODIFIE', entity: 'SocialPoll', entityId: pollId, reason: 'Choix du vote modifié' } });
    }
    return this.results(user, pollId);
  }
}

@Controller('social/polls')
@UseGuards(JwtAuthGuard, RateLimitGuard)
export class SocialPollsController {
  constructor(private readonly polls: SocialPollsService) {}
  @Post() create(@Req() req: any, @Body() dto: CreatePollDto, @Headers('idempotency-key') key?: string) { return this.polls.create(req.user, dto, key); }
  @Get(':id') results(@Req() req: any, @Param('id') id: string) { return this.polls.results(req.user, id); }
  @Post(':id/vote') vote(@Req() req: any, @Param('id') id: string, @Body() dto: VotePollDto) { return this.polls.vote(req.user, id, dto); }
}
