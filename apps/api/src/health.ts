import { Controller, Get, Injectable, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { RateLimitGuard } from './rate-limit.guard';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  liveness() {
    return { status: 'ok' };
  }

  async readiness() {
    try {
      await this.prisma.user.count({ where: { id: '__readiness_probe__' } });
      return { status: 'ready', database: 'available' };
    } catch {
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
