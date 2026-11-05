import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './auth.guard';
import { RateLimitGuard } from './rate-limit.guard';

class CreateFaithfulRegisterEntryDto {
  @IsString() @Length(3, 240) fullName!: string;
}

@UseGuards(JwtAuthGuard, RateLimitGuard)
@Controller('faithful-register')
export class FaithfulRegisterController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Req() req: any) {
    this.requireAccess(req.user.role);
    const entries = await this.prisma.faithfulRegisterEntry.findMany({
      orderBy: { number: 'asc' },
      select: { number: true, fullName: true, createdAt: true }
    });
    return { entries, total: entries.length, nextNumber: (entries.at(-1)?.number ?? 0) + 1 };
  }

  @Post()
  async add(@Body() body: CreateFaithfulRegisterEntryDto, @Req() req: any) {
    this.requireAccess(req.user.role);
    const fullName = body.fullName.trim().replace(/\s+/g, ' ');
    if (fullName.length < 3) throw new BadRequestException('Saisissez le nom complet du fidèle.');

    return this.prisma.$transaction(async tx => {
      const entry = await tx.faithfulRegisterEntry.create({
        data: { fullName, createdById: req.user.sub },
        select: { number: true, fullName: true, createdAt: true }
      });
      await tx.auditLog.create({
        data: {
          userId: req.user.sub,
          action: 'REGISTRE_FIDELE_AJOUTE',
          entity: 'FaithfulRegisterEntry',
          entityId: String(entry.number),
          after: { number: entry.number, fullName: entry.fullName }
        }
      });
      return entry;
    });
  }

  private requireAccess(role: string) {
    if (!['ADMIN', 'SUPER_ADMIN', 'SECRETAIRE_PRESENCE'].includes(role)) {
      throw new ForbiddenException('Le registre est réservé aux secrétaires de présence et à l’administration.');
    }
  }
}
