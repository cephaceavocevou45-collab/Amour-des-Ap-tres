import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AttendanceController } from './attendance';
import { PublicController } from './public';
import { AuthController, AuthService } from './auth';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './auth.guard';
import { RateLimitGuard } from './rate-limit.guard';
import { RetentionService } from './retention.service';
import { SocialAccountsController, SocialAccountsService } from './social-accounts';
import { CommunityMessagingController, CommunityMessagingService } from './community-messaging';
import { ParishContentController, ParishContentService } from './parish-content';
import { HealthController, HealthService } from './health';
import { EmailQuotaService } from './email-quota.service';

@Module({ imports: [ScheduleModule.forRoot()], controllers: [PublicController, AttendanceController, AuthController, SocialAccountsController, CommunityMessagingController, ParishContentController, HealthController], providers: [AuthService, SocialAccountsService, CommunityMessagingService, ParishContentService, HealthService, EmailQuotaService, PrismaService, JwtAuthGuard, RateLimitGuard, RetentionService] })
export class AppModule {}
