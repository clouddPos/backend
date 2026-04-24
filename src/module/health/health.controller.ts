import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DatabaseService } from '../../database/database.service';
import { RedisService } from '../../redis/redis.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  async check() {
    const checks = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {} as Record<string, { status: string; latency?: number }>,
    };

    // Database check
    const dbStart = Date.now();
    try {
      await this.db.$queryRaw`SELECT 1`;
      checks.services.database = {
        status: 'healthy',
        latency: Date.now() - dbStart,
      };
    } catch {
      checks.services.database = { status: 'unhealthy' };
      checks.status = 'degraded';
    }

    // Redis check
    const redisStart = Date.now();
    try {
      if (!this.redis.isReady()) {
        checks.services.redis = { status: 'unhealthy' };
        checks.status = 'degraded';
      } else {
        await this.redis.set('health:ping', 'pong', 10);
        const val = await this.redis.get('health:ping');
        checks.services.redis = {
          status: val === 'pong' ? 'healthy' : 'unhealthy',
          latency: Date.now() - redisStart,
        };
      }
    } catch {
      checks.services.redis = { status: 'unhealthy' };
      checks.status = 'degraded';
    }

    return checks;
  }
}
