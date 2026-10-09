import { Body, Controller, Delete, ForbiddenException, Get, Headers, HttpException, Injectable, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsEnum, IsString, Length } from 'class-validator';
import { SocialGroupMemberStatus, SocialGroupVisibility, UserRole } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './auth.guard';
import { RateLimitGuard } from './rate-limit.guard';

class CreateSocialGroupDto {
  @IsString() @Length(3, 100) name!: string;
  @IsString() @Length(3, 500) description!: string;
  @IsEnum(SocialGroupVisibility) visibility!: SocialGroupVisibility;
}
class GroupTextDto { @IsString() @Length(1, 5000) body!: string; }
class GroupCommentDto { @IsString() @Length(1, 2000) body!: string; }

const MEMBER_ROLES: UserRole[] = [UserRole.FIDELE, UserRole.SECRETAIRE_PRESENCE, UserRole.RESPONSABLE_SEMAINE];

@Injectable()
export class SocialGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  private member(user: { sub: string; role: string }) {
    if (!MEMBER_ROLES.includes(user.role as UserRole)) throw new ForbiddenException('Cette fonction est réservée aux membres de la communauté paroissiale.');
    return user.sub;
  }

  async list(user: { sub: string; role: string }) {
    const userId = this.member(user);
    const rows = await this.prisma.socialGroup.findMany({
      where: { OR: [{ visibility: SocialGroupVisibility.PUBLIC }, { memberships: { some: { userId } } }] },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }], take: 50,
      include: { createdBy: { select: { id: true, fullName: true, dateOfBirth: true } }, memberships: { where: { OR: [{ userId }, { status: SocialGroupMemberStatus.PENDING }] }, include: { user: { select: { id: true, fullName: true, dateOfBirth: true } } } }, _count: { select: { memberships: { where: { status: SocialGroupMemberStatus.MEMBER } } } } },
    });
    const ownedPrivateIds = rows.filter(row => row.createdById === userId).map(row => row.id);
    const pendingCounts = ownedPrivateIds.length ? await this.prisma.socialGroupMembership.groupBy({ by: ['groupId'], where: { groupId: { in: ownedPrivateIds }, status: SocialGroupMemberStatus.PENDING }, _count: { _all: true } }) : [];
    const pending = new Map(pendingCounts.map(row => [row.groupId, row._count._all]));
    return rows.map(row => { const own = row.memberships.find(membership => membership.userId === userId); return { id: row.id, name: row.name, description: row.description, visibility: row.visibility, createdAt: row.createdAt, owner: { id: row.createdBy.id, displayName: this.displayName(row.createdBy) }, memberCount: row._count.memberships, myRole: own?.role ?? null, myStatus: own?.status ?? null, pendingCount: row.createdById === userId ? pending.get(row.id) ?? 0 : 0, pendingRequests: row.createdById === userId ? row.memberships.filter(membership => membership.status === SocialGroupMemberStatus.PENDING).map(membership => ({ id: membership.user.id, displayName: this.displayName(membership.user) })) : [] }; });
  }

  async create(user: { sub: string; role: string }, dto: CreateSocialGroupDto) {
    const userId = this.member(user);
    const name = dto.name.trim(); const description = dto.description.trim();
    if (name.length < 3 || description.length < 3) throw new HttpException('Le nom et la présentation du groupe sont obligatoires.', 400);
    const group = await this.prisma.$transaction(async tx => {
      const created = await tx.socialGroup.create({ data: { name, description, visibility: dto.visibility, createdById: userId } });
      await tx.socialGroupMembership.create({ data: { groupId: created.id, userId, role: 'OWNER', status: 'MEMBER' } });
      await tx.auditLog.create({ data: { userId, action: 'GROUPE_CREE', entity: 'SocialGroup', entityId: created.id } });
      return created;
    });
    return { id: group.id, name: group.name, description: group.description, visibility: group.visibility, createdAt: group.createdAt, owner: { id: userId, displayName: await this.memberDisplayName(userId) }, memberCount: 1, myRole: 'OWNER', myStatus: 'MEMBER', pendingCount: 0 };
  }

  async join(user: { sub: string; role: string }, groupId: string) {
    const userId = this.member(user);
    const group = await this.prisma.socialGroup.findUnique({ where: { id: groupId }, select: { id: true, visibility: true, createdById: true } });
    if (!group) throw new NotFoundException('Groupe introuvable.');
    const existing = await this.prisma.socialGroupMembership.findUnique({ where: { groupId_userId: { groupId, userId } }, select: { status: true } });
    if (existing) return { status: existing.status, message: existing.status === SocialGroupMemberStatus.MEMBER ? 'Vous faites déjà partie de ce groupe.' : 'Votre demande est déjà en attente.' };
    const status = group.visibility === SocialGroupVisibility.PUBLIC ? SocialGroupMemberStatus.MEMBER : SocialGroupMemberStatus.PENDING;
    const membership = await this.prisma.socialGroupMembership.upsert({ where: { groupId_userId: { groupId, userId } }, update: {}, create: { groupId, userId, status } });
    if (membership.status === SocialGroupMemberStatus.PENDING) await this.prisma.userNotification.create({ data: { userId: group.createdById, message: 'Une demande attend votre validation dans un groupe paroissial.' } });
    return { status: membership.status, message: membership.status === SocialGroupMemberStatus.MEMBER ? 'Vous avez rejoint le groupe.' : 'Votre demande a été transmise au responsable du groupe.' };
  }

  async decideJoin(user: { sub: string; role: string }, groupId: string, memberId: string) {
    const userId = this.member(user);
    const request = await this.prisma.socialGroupMembership.findFirst({ where: { groupId, userId: memberId, status: SocialGroupMemberStatus.PENDING, group: { createdById: userId, visibility: SocialGroupVisibility.PRIVATE } }, select: { id: true } });
    if (!request) throw new NotFoundException('Demande introuvable.');
    await this.prisma.$transaction(async tx => {
      await tx.socialGroupMembership.update({ where: { id: request.id }, data: { status: SocialGroupMemberStatus.MEMBER } });
      await tx.auditLog.create({ data: { userId, action: 'DEMANDE_GROUPE_ACCEPTEE', entity: 'SocialGroup', entityId: groupId } });
      await tx.userNotification.create({ data: { userId: memberId, message: 'Votre demande pour rejoindre un groupe paroissial a été acceptée.' } });
    });
    return { accepted: true };
  }

  async leave(user: { sub: string; role: string }, groupId: string) {
    const userId = this.member(user);
    const membership = await this.prisma.socialGroupMembership.findUnique({ where: { groupId_userId: { groupId, userId } }, select: { id: true, role: true } });
    if (!membership) throw new NotFoundException('Vous ne faites pas partie de ce groupe.');
    if (membership.role === 'OWNER') throw new HttpException('Le responsable ne peut pas quitter son groupe. Supprimez-le si sa fermeture est voulue.', 409);
    await this.prisma.socialGroupMembership.delete({ where: { id: membership.id } });
    return { left: true };
  }

  async remove(user: { sub: string; role: string }, groupId: string) {
    const userId = this.member(user);
    const group = await this.prisma.socialGroup.findUnique({ where: { id: groupId }, select: { id: true, createdById: true } });
    if (!group) throw new NotFoundException('Groupe introuvable.');
    if (group.createdById !== userId) throw new ForbiddenException('Seul le responsable du groupe peut le supprimer.');
    await this.prisma.$transaction(async tx => {
      await tx.auditLog.create({ data: { userId, action: 'GROUPE_SUPPRIME', entity: 'SocialGroup', entityId: groupId } });
      await tx.socialGroup.delete({ where: { id: groupId } });
    });
    return { deleted: true };
  }

  private async requireGroupMember(userId: string, groupId: string) {
    const group = await this.prisma.socialGroup.findFirst({ where: { id: groupId, OR: [{ createdById: userId }, { memberships: { some: { userId, status: SocialGroupMemberStatus.MEMBER } } }] }, select: { id: true } });
    if (!group) throw new NotFoundException('Groupe introuvable.');
    return group;
  }

  private async blockedIds(userId: string) {
    const rows = await this.prisma.socialBlock.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] }, select: { blockerId: true, blockedId: true } });
    return [...new Set(rows.map(row => row.blockerId === userId ? row.blockedId : row.blockerId))];
  }

  async posts(user: { sub: string; role: string }, groupId: string) {
    const userId = this.member(user);
    await this.requireGroupMember(userId, groupId);
    const blocked = await this.blockedIds(userId);
    const rows = await this.prisma.socialGroupPost.findMany({ where: { groupId, deletedAt: null, authorId: { notIn: blocked } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50, include: { author: { select: { id: true, fullName: true, dateOfBirth: true } }, _count: { select: { comments: { where: { deletedAt: null } } } } } });
    return rows.map(row => ({ id: row.id, body: row.body, createdAt: row.createdAt, author: { id: row.author.id, displayName: this.displayName(row.author) }, commentCount: row._count.comments, canDelete: row.authorId === userId }));
  }

  async createPost(user: { sub: string; role: string }, groupId: string, dto: GroupTextDto, key?: string) {
    const userId = this.member(user);
    await this.requireGroupMember(userId, groupId);
    const body = dto.body.trim(); const idempotencyKey = (key ?? '').trim();
    if (!body || body.length > 5000 || !/^[A-Za-z0-9_-]{8,120}$/.test(idempotencyKey)) throw new HttpException('Texte invalide ou identifiant de publication manquant.', 400);
    const post = await this.prisma.socialGroupPost.upsert({ where: { groupId_authorId_idempotencyKey: { groupId, authorId: userId, idempotencyKey } }, update: {}, create: { groupId, authorId: userId, idempotencyKey, body }, include: { author: { select: { id: true, fullName: true, dateOfBirth: true } }, _count: { select: { comments: true } } } });
    return { id: post.id, body: post.body, createdAt: post.createdAt, author: { id: post.author.id, displayName: this.displayName(post.author) }, commentCount: post._count.comments, canDelete: true };
  }

  async comments(user: { sub: string; role: string }, postId: string) {
    const userId = this.member(user);
    const post = await this.prisma.socialGroupPost.findFirst({ where: { id: postId, deletedAt: null }, select: { id: true, groupId: true, authorId: true } });
    if (!post) throw new NotFoundException('Discussion introuvable.');
    await this.requireGroupMember(userId, post.groupId);
    if (await this.isBlocked(userId, post.authorId)) throw new NotFoundException('Discussion introuvable.');
    const blocked = await this.blockedIds(userId);
    const rows = await this.prisma.socialGroupComment.findMany({ where: { postId, deletedAt: null, authorId: { notIn: blocked } }, orderBy: { createdAt: 'asc' }, take: 100, include: { author: { select: { id: true, fullName: true, dateOfBirth: true } } } });
    return rows.map(row => ({ id: row.id, body: row.body, createdAt: row.createdAt, author: { id: row.author.id, displayName: this.displayName(row.author) }, canDelete: row.authorId === userId }));
  }

  async comment(user: { sub: string; role: string }, postId: string, dto: GroupCommentDto) {
    const userId = this.member(user); const body = dto.body.trim();
    if (!body || body.length > 2000) throw new HttpException('Le commentaire est limité à 2 000 caractères.', 400);
    const post = await this.prisma.socialGroupPost.findFirst({ where: { id: postId, deletedAt: null }, select: { id: true, groupId: true, authorId: true } });
    if (!post) throw new NotFoundException('Discussion introuvable.');
    await this.requireGroupMember(userId, post.groupId);
    if (await this.isBlocked(userId, post.authorId)) throw new NotFoundException('Discussion introuvable.');
    const row = await this.prisma.socialGroupComment.create({ data: { postId, authorId: userId, body }, include: { author: { select: { id: true, fullName: true, dateOfBirth: true } } } });
    return { id: row.id, body: row.body, createdAt: row.createdAt, author: { id: row.author.id, displayName: this.displayName(row.author) }, canDelete: true };
  }

  async deletePost(user: { sub: string; role: string }, postId: string) {
    const userId = this.member(user);
    const post = await this.prisma.socialGroupPost.findFirst({ where: { id: postId, deletedAt: null }, include: { group: { select: { createdById: true } } } });
    if (!post) throw new NotFoundException('Discussion introuvable.');
    await this.requireGroupMember(userId, post.groupId);
    if (post.authorId !== userId && post.group.createdById !== userId) throw new NotFoundException('Discussion introuvable.');
    await this.prisma.socialGroupPost.update({ where: { id: postId }, data: { deletedAt: new Date(), body: 'Publication supprimée' } });
    return { deleted: true };
  }

  private async isBlocked(userId: string, otherId: string) { return Boolean(await this.prisma.socialBlock.findFirst({ where: { OR: [{ blockerId: userId, blockedId: otherId }, { blockerId: otherId, blockedId: userId }] }, select: { id: true } })); }

  private displayName(user: { fullName: string | null; dateOfBirth: Date | null }) {
    if (!user.dateOfBirth) return 'Membre fidèle';
    let age = new Date().getUTCFullYear() - user.dateOfBirth.getUTCFullYear();
    if (new Date().getUTCMonth() < user.dateOfBirth.getUTCMonth() || new Date().getUTCMonth() === user.dateOfBirth.getUTCMonth() && new Date().getUTCDate() < user.dateOfBirth.getUTCDate()) age--;
    return age < 18 ? 'Membre fidèle' : user.fullName ?? 'Membre fidèle';
  }
  private async memberDisplayName(userId: string) { const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, dateOfBirth: true } }); return user ? this.displayName(user) : 'Membre fidèle'; }
}

@Controller('social/groups')
@UseGuards(JwtAuthGuard, RateLimitGuard)
export class SocialGroupsController {
  constructor(private readonly groups: SocialGroupsService) {}
  @Get() list(@Req() req: any) { return this.groups.list(req.user); }
  @Post() create(@Req() req: any, @Body() dto: CreateSocialGroupDto) { return this.groups.create(req.user, dto); }
  @Post(':id/join') join(@Req() req: any, @Param('id') id: string) { return this.groups.join(req.user, id); }
  @Post(':id/requests/:memberId/accept') accept(@Req() req: any, @Param('id') id: string, @Param('memberId') memberId: string) { return this.groups.decideJoin(req.user, id, memberId); }
  @Get(':id/posts') posts(@Req() req: any, @Param('id') id: string) { return this.groups.posts(req.user, id); }
  @Post(':id/posts') createPost(@Req() req: any, @Param('id') id: string, @Body() dto: GroupTextDto, @Headers('idempotency-key') key?: string) { return this.groups.createPost(req.user, id, dto, key); }
  @Get('posts/:postId/comments') comments(@Req() req: any, @Param('postId') postId: string) { return this.groups.comments(req.user, postId); }
  @Post('posts/:postId/comments') comment(@Req() req: any, @Param('postId') postId: string, @Body() dto: GroupCommentDto) { return this.groups.comment(req.user, postId, dto); }
  @Delete('posts/:postId') deletePost(@Req() req: any, @Param('postId') postId: string) { return this.groups.deletePost(req.user, postId); }
  @Delete(':id/membership') leave(@Req() req: any, @Param('id') id: string) { return this.groups.leave(req.user, id); }
  @Delete(':id') remove(@Req() req: any, @Param('id') id: string) { return this.groups.remove(req.user, id); }
}
