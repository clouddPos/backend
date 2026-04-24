import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Observable, of, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { RedisService } from '../../../redis/redis.service';
import { Response } from 'express';

const IDEMPOTENCY_TTL = 86400; // 24 hours

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly redis: RedisService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse<Response>();
    const idempotencyKey = request.headers['idempotency-key'];

    // If no idempotency key, proceed normally
    if (!idempotencyKey) {
      return next.handle();
    }

    // If Redis is not available, skip idempotency check and proceed
    if (!this.redis.isReady()) {
      this.logger.warn('Redis not available, skipping idempotency check');
      return next.handle();
    }

    const cacheKey = `idempotency:${idempotencyKey}`;

    try {
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        const cachedResponse = JSON.parse(cached);
        response.status(cachedResponse.statusCode || HttpStatus.OK);
        return of(cachedResponse.body);
      }
    } catch (error) {
      this.logger.error(
        `Failed to check idempotency cache: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      // Continue with request even if cache check fails
    }

    return next.handle().pipe(
      tap(async (responseBody) => {
        try {
          const statusCode = response.statusCode;
          await this.redis.set(
            cacheKey,
            JSON.stringify({ statusCode, body: responseBody }),
            IDEMPOTENCY_TTL,
          );
        } catch (error) {
          this.logger.error(
            `Failed to cache idempotency response: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
          // Don't fail the request if caching fails
        }
      }),
      catchError((error) => {
        // Pass errors through without caching
        return throwError(() => error);
      }),
    );
  }
}
