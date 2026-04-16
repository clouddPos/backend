import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export const Merchant = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();

    // Merchant info is attached to request by ApiKeyMiddleware
    const merchant = (request as any).merchant;

    if (!merchant) {
      return null;
    }

    return data ? merchant[data] : merchant;
  },
);
