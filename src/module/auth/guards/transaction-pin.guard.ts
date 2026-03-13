import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { DatabaseService } from '../../../database/database.service';
import { PinService } from '../../merchant/pin.service';

@Injectable()
export class TransactionPinGuard implements CanActivate {
  private readonly maxAttempts = 5;
  private readonly lockoutDuration = 15 * 60 * 1000; // 15 minutes

  constructor(
    private readonly configService: ConfigService,
    private readonly db: DatabaseService,
    private readonly pinService: PinService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const transactionPin = request.headers['x-transaction-pin'] as string;

    // Get merchant from request (set by API key middleware)
    const merchant = (request as any).merchant;

    if (!merchant) {
      throw new UnauthorizedException('Merchant not authenticated');
    }

    // Check if PIN is required for this endpoint
    if (!transactionPin) {
      throw new UnauthorizedException('Transaction PIN required');
    }

    // Validate PIN format (6 digits)
    if (!/^\d{6}$/.test(transactionPin)) {
      throw new UnauthorizedException('PIN must be 6 digits');
    }

    // Check if merchant has PIN configured
    if (!merchant.transactionPinHash) {
      throw new UnauthorizedException(
        'Transaction PIN not configured. Please set up your PIN in merchant settings.',
      );
    }

    // Check if merchant is locked out
    if (merchant.pinLockedUntil) {
      const lockoutExpiry = new Date(merchant.pinLockedUntil);
      if (lockoutExpiry > new Date()) {
        const minutesLeft = Math.ceil(
          (lockoutExpiry.getTime() - Date.now()) / 60000,
        );
        throw new ForbiddenException(
          `Account locked due to too many failed attempts. Try again in ${minutesLeft} minutes.`,
        );
      } else {
        // Lockout expired, reset attempts
        await this.db.merchant.update({
          where: { id: merchant.id },
          data: {
            pinFailedAttempts: 0,
            pinLockedUntil: null,
          },
        });
      }
    }

    // Verify PIN
    const isValid = this.pinService.verifyPin(
      transactionPin,
      merchant.transactionPinHash,
    );

    if (!isValid) {
      // Increment failed attempts
      const newAttempts = (merchant.pinFailedAttempts || 0) + 1;

      if (newAttempts >= this.maxAttempts) {
        // Lock account
        const lockedUntil = new Date(Date.now() + this.lockoutDuration);
        await this.db.merchant.update({
          where: { id: merchant.id },
          data: {
            pinFailedAttempts: newAttempts,
            pinLockedUntil: lockedUntil,
          },
        });

        throw new ForbiddenException(
          `Too many failed attempts. Account locked for 15 minutes.`,
        );
      } else {
        // Update failed attempts
        await this.db.merchant.update({
          where: { id: merchant.id },
          data: {
            pinFailedAttempts: newAttempts,
          },
        });

        const remaining = this.maxAttempts - newAttempts;
        throw new UnauthorizedException(
          `Invalid PIN. ${remaining} attempt${remaining > 1 ? 's' : ''} remaining.`,
        );
      }
    }

    // PIN is valid - reset failed attempts
    if (merchant.pinFailedAttempts > 0) {
      await this.db.merchant.update({
        where: { id: merchant.id },
        data: {
          pinFailedAttempts: 0,
          pinLockedUntil: null,
        },
      });
    }

    return true;
  }
}
