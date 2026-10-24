import { Controller, Get, Injectable, Logger, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { RateLimitGuard } from './rate-limit.guard';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  liveness() {
    return { status: 'ok' };
  }

  async readiness() {
    try {
      await this.prisma.user.count({ where: { id: '__readiness_probe__' } });
      return { status: 'ready', database: 'available' };
    } catch (error) {
      const details = error instanceof Error ? error : new Error(String(error));
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;
      const prismaCode = typeof code === 'string' && /^P\d{4}$/.test(code)
        ? code
        : /\bP\d{4}\b/.exec(details.message)?.[0];
      this.logger.error(`Readiness database probe failed (${details.name}${prismaCode ? `, ${prismaCode}` : ''})`);
      throw new ServiceUnavailableException({ status: 'not_ready' });
    }
  }
}

@UseGuards(RateLimitGuard)
@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('health') healthCheck() {
    return this.health.liveness();
  }

  @Get('ready') readinessCheck() {
    return this.health.readiness();
  }
}
