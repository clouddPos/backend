import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

const REDIS_OPERATION_TIMEOUT = 5000; // 5 seconds

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: RedisClientType | null = null;
  private readonly logger = new Logger(RedisService.name);
  private isConnected = false;

  constructor(private configService: ConfigService) {
    const host = this.configService.get<string>('redis.host');
    const port = this.configService.get<number>('redis.port');

    if (!host || port === undefined) {
      this.logger.warn('Redis configuration missing, Redis will be disabled');
      return;
    }

    this.client = createClient({
      socket: {
        host,
        port,
        connectTimeout: REDIS_OPERATION_TIMEOUT,
      },
    });

    this.client.on('error', (err) => {
      this.logger.error('Redis Client Error', err);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      this.logger.log('Redis Client Connected');
      this.isConnected = true;
    });

    this.client.on('disconnect', () => {
      this.logger.warn('Redis Client Disconnected');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      this.logger.log('Redis Client Reconnecting');
    });

    this.client.on('end', () => {
      this.logger.warn('Redis Client Connection Ended');
      this.isConnected = false;
    });
  }

  async onModuleInit() {
    if (!this.client) {
      this.logger.warn('Redis client not initialized, skipping connection');
      return;
    }

    try {
      await this.client.connect();
      this.isConnected = true;
      this.logger.log('Redis module initialized successfully');
    } catch (error) {
      this.isConnected = false;
      this.logger.error(
        `Failed to connect to Redis: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      this.logger.warn(
        'Application will continue without Redis. Some features may not work.',
      );
    }
  }

  async onModuleDestroy() {
    if (this.client && this.isConnected) {
      try {
        await this.client.quit();
        this.logger.log('Redis connection closed');
      } catch (error) {
        this.logger.error(
          `Error closing Redis connection: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }
  }

  private async withTimeout<T>(
    operation: () => Promise<T>,
    errorMessage: string,
  ): Promise<T> {
    if (!this.client || !this.isConnected) {
      this.logger.warn('Redis not connected, skipping operation');
      throw new Error('Redis not connected');
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(
              `${errorMessage} - timeout after ${REDIS_OPERATION_TIMEOUT}ms`,
            ),
          ),
        REDIS_OPERATION_TIMEOUT,
      );
    });

    return Promise.race([operation(), timeoutPromise]);
  }

  getClient(): RedisClientType | null {
    return this.client;
  }

  isReady(): boolean {
    return this.client !== null && this.isConnected;
  }

  async get(key: string): Promise<string | null> {
    if (!this.client || !this.isConnected) {
      return null;
    }
    return this.withTimeout(() => this.client!.get(key), `Redis GET ${key}`);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (!this.client || !this.isConnected) {
      return;
    }
    await this.withTimeout(async () => {
      if (ttl) {
        await this.client!.setEx(key, ttl, value);
      } else {
        await this.client!.set(key, value);
      }
    }, `Redis SET ${key}`);
  }

  async del(key: string): Promise<void> {
    if (!this.client || !this.isConnected) {
      return;
    }
    await this.withTimeout(() => this.client!.del(key), `Redis DEL ${key}`);
  }

  async exists(key: string): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      return false;
    }
    return this.withTimeout(
      () => this.client!.exists(key).then((result) => result === 1),
      `Redis EXISTS ${key}`,
    );
  }

  async expire(key: string, seconds: number): Promise<void> {
    if (!this.client || !this.isConnected) {
      return;
    }
    await this.withTimeout(
      () => this.client!.expire(key, seconds),
      `Redis EXPIRE ${key}`,
    );
  }

  async ttl(key: string): Promise<number> {
    if (!this.client || !this.isConnected) {
      return -2;
    }
    return this.withTimeout(() => this.client!.ttl(key), `Redis TTL ${key}`);
  }

  async keys(pattern: string): Promise<string[]> {
    if (!this.client || !this.isConnected) {
      return [];
    }
    return this.withTimeout(
      () => this.client!.keys(pattern),
      `Redis KEYS ${pattern}`,
    );
  }

  async flushAll(): Promise<void> {
    if (!this.client || !this.isConnected) {
      return;
    }
    await this.withTimeout(() => this.client!.flushAll(), 'Redis FLUSHALL');
  }
}
