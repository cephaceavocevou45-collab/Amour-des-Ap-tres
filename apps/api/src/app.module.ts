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

@Module({ imports: [ScheduleModule.forRoot()], controllers: [PublicController, AttendanceController, AuthController, SocialAccountsController, CommunityMessagingController], providers: [AuthService, SocialAccountsService, CommunityMessagingService, PrismaService, JwtAuthGuard, RateLimitGuard, RetentionService] })
export class AppModule {}
