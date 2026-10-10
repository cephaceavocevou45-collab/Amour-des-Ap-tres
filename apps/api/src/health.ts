import { Controller, Get, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  liveness() {
    return { status: 'ok' };
  }

  async readiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', database: 'available' };
    } catch {
      throw new ServiceUnavailableException({ status: 'not_ready' });
    }
  }
}

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
