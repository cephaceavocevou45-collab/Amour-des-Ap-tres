import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { IsISO8601, IsIn, IsString, Length } from 'class-validator';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './auth.guard';
import { RateLimitGuard } from './rate-limit.guard';

class MeetingRequestDto {
  @IsISO8601({ strict: true }) preferredAt!: string;
  @IsString() @Length(3, 160) subject!: string;
  @IsString() @Length(8, 2000) message!: string;
}
class MeetingStatusDto { @IsIn(['CONFIRME', 'REFUSE']) status!: string; }

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}
  list(userId: string) { return this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 30 }); }
  async read(userId: string, id: string) {
    const result = await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
    if (!result.count) return { read: true };
    return { read: true };
  }
}

@UseGuards(JwtAuthGuard, RateLimitGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}
  @Get() list(@Req() req: any) { return this.notifications.list(req.user.sub); }
  @Patch(':id/read') read(@Req() req: any, @Param('id') id: string) { return this.notifications.read(req.user.sub, id); }
}

@UseGuards(JwtAuthGuard, RateLimitGuard)
@Controller('appointments')
export class MeetingRequestsController {
  constructor(private readonly prisma: PrismaService) {}
  @Post() async request(@Req() req: any, @Body() body: MeetingRequestDto) {
    if (req.user.role !== 'FIDELE') throw new ForbiddenException('La prise de rendez-vous est réservée aux fidèles.');
    const preferredAt = new Date(body.preferredAt);
    if (Number.isNaN(preferredAt.getTime()) || preferredAt.getTime() < Date.now() - 60_000) throw new BadRequestException('Choisissez une date de rendez-vous à venir.');
    return this.prisma.$transaction(async tx => {
      const item = await tx.meetingRequest.create({ data: { preferredAt, subject: body.subject.trim(), message: body.message.trim(), requesterId: req.user.sub } });
      const admins = await tx.user.findMany({ where: { active: true, role: { in: ['ADMIN', 'SUPER_ADMIN'] } }, select: { id: true } });
      if (admins.length) await tx.notification.createMany({ data: admins.map(user => ({ userId: user.id, title: 'Demande de rendez-vous', body: 'Un fidèle souhaite rencontrer le chargé paroissial.', href: '/admin/rendez-vous' })) });
      return { id: item.id, status: item.status };
    });
  }
  @Get() async list(@Req() req: any) {
    if (!['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) throw new ForbiddenException('Les rendez-vous sont réservés à l’administration paroissiale.');
    return this.prisma.meetingRequest.findMany({ orderBy: [{ status: 'asc' }, { preferredAt: 'asc' }], take: 200, include: { requester: { select: { id: true, fullName: true, email: true, phone: true } } } });
  }
  @Patch(':id/status') async updateStatus(@Req() req: any, @Param('id') id: string, @Body() body: MeetingStatusDto) {
    if (!['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) throw new ForbiddenException('Seule l’administration paroissiale peut traiter les rendez-vous.');
    if (!['CONFIRME', 'REFUSE'].includes(body.status ?? '')) throw new BadRequestException('Choisissez une décision valide.');
    const current = await this.prisma.meetingRequest.findUnique({ where: { id } });
    if (!current) throw new BadRequestException('Demande de rendez-vous introuvable.');
    const updated = await this.prisma.$transaction(async tx => {
      const item = await tx.meetingRequest.update({ where: { id }, data: { status: body.status!, handledById: req.user.sub } });
      await tx.notification.create({ data: { userId: item.requesterId, title: body.status === 'CONFIRME' ? 'Rendez-vous confirmé' : 'Demande de rendez-vous traitée', body: body.status === 'CONFIRME' ? 'Votre rendez-vous avec le chargé paroissial est confirmé.' : 'Votre demande de rendez-vous a été traitée. Vous pouvez écrire à l’équipe pour convenir d’un autre moment.', href: '/rendez-vous' } });
      return item;
    });
    return updated;
  }
}
