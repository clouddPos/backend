import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import { DatabaseService } from '../../../database/database.service';

export interface AuthenticatedRequest extends Request {
  merchant?: any;
}

@Injectable()
export class ApiKeyMiddleware implements NestMiddleware {
  constructor(
    private readonly configService: ConfigService,
    private readonly db: DatabaseService,
  ) {}

  async use(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const apiKey = req.headers['x-api-key'];
    console.log('[ApiKeyMiddleware] Request path:', req.path);
    console.log('[ApiKeyMiddleware] API key present:', !!apiKey);
    console.log('[ApiKeyMiddleware] API key value:', apiKey ? (apiKey as string).substring(0, 10) + '...' : 'none');

    if (!apiKey) {
      console.log('[ApiKeyMiddleware] Rejecting: API key missing');
      throw new UnauthorizedException('API key missing');
    }

    const validApiKey = this.configService.get<string>('pos.apiKey');
    console.log('[ApiKeyMiddleware] Config pos.apiKey:', validApiKey ? validApiKey.substring(0, 10) + '...' : 'none');

    if (!validApiKey || apiKey !== validApiKey) {
      console.log('[ApiKeyMiddleware] Rejecting: Invalid API key');
      throw new UnauthorizedException('Invalid API key');
    }

    // Get merchant from database
    const merchantId = this.configService.get<string>('pos.merchantId');
    console.log('[ApiKeyMiddleware] Config pos.merchantId:', merchantId);

    if (!merchantId) {
      console.log('[ApiKeyMiddleware] Rejecting: Merchant ID not configured');
      throw new UnauthorizedException('Merchant ID not configured');
    }

    const merchant = await this.db.merchant.findUnique({
      where: { id: merchantId },
      select: {
        id: true,
        businessName: true,
        email: true,
        transactionPinHash: true,
      },
    });

    if (!merchant) {
      console.log('[ApiKeyMiddleware] Merchant not found for ID:', merchantId);
      throw new UnauthorizedException('Merchant not found');
    }

    console.log('[ApiKeyMiddleware] Merchant found:', merchant.id);
    // Attach merchant to request
    req.merchant = merchant;

    next();
  }
}
