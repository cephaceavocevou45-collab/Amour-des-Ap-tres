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
import { SocialGroupsController, SocialGroupsService } from './social-groups';
import { SocialPollsController, SocialPollsService } from './social-polls';
import { SocialEventsController, SocialEventsService } from './social-events';

@Module({ imports: [ScheduleModule.forRoot()], controllers: [PublicController, AttendanceController, AuthController, SocialAccountsController, SocialFeedController, SocialMediaController, SocialModerationController, SocialGroupsController, SocialPollsController, SocialEventsController], providers: [AuthService, SocialAccountsService, SocialFeedService, SocialMediaService, SocialModerationService, SocialGroupsService, SocialPollsService, SocialEventsService, PrismaService, JwtAuthGuard, RateLimitGuard, RetentionService] })
export class AppModule {}
