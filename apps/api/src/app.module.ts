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
import { SocialFeedController, SocialFeedService } from './social-feed';
import { SocialMediaController, SocialMediaService } from './social-media';
import { SocialModerationController, SocialModerationService } from './social-moderation';

@Module({ imports: [ScheduleModule.forRoot()], controllers: [PublicController, AttendanceController, AuthController, SocialAccountsController, SocialFeedController, SocialMediaController, SocialModerationController], providers: [AuthService, SocialAccountsService, SocialFeedService, SocialMediaService, SocialModerationService, PrismaService, JwtAuthGuard, RateLimitGuard, RetentionService] })
export class AppModule {}
