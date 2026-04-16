import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  InjectionToken,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Observable, tap } from 'rxjs';
import { LogEntry, Logger } from 'winston';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER as InjectionToken)
    private readonly logger: Logger,
  ) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const now = Date.now();
    const req = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      tap(() => {
        const ms = Date.now() - now;
        this.logger.log(
          `${req.method} ${req.url} ${ms}ms` as unknown as LogEntry,
        );
      }),
    );
  }
}
