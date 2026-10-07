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

@Module({ imports: [ScheduleModule.forRoot()], controllers: [PublicController, AttendanceController, AuthController, SocialAccountsController, SocialFeedController], providers: [AuthService, SocialAccountsService, SocialFeedService, PrismaService, JwtAuthGuard, RateLimitGuard, RetentionService] })
export class AppModule {}
