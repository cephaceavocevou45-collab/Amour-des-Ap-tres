import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AttendanceController } from './attendance';
import { PublicController } from './public';
import { AuthController, AuthService } from './auth';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './auth.guard';
import { RateLimitGuard } from './rate-limit.guard';
import { RetentionService } from './retention.service';
import { HealthController, HealthService } from './health';
import { EmailQuotaService } from './email-quota.service';
import { ReauthService } from './reauth';
import { LoginBackoffPolicy } from './login-backoff.policy';
import { ParishProgramController, TreasuryController } from './parish-operations';
import { MessagingController, MessagingService } from './messaging';

@Module({ imports: [ScheduleModule.forRoot()], controllers: [PublicController, AttendanceController, AuthController, HealthController, ParishProgramController, TreasuryController, MessagingController], providers: [AuthService, ReauthService, HealthService, EmailQuotaService, PrismaService, JwtAuthGuard, RateLimitGuard, RetentionService, LoginBackoffPolicy, MessagingService] })
export class AppModule {}
