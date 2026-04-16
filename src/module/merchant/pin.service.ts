import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class PinService {
  private readonly logger = new Logger(PinService.name);
  private readonly salt: string;

  constructor(private readonly configService: ConfigService) {
    // Use JWT_SECRET as salt for PIN hashing (or configure separately)
    this.salt = this.configService.get<string>('jwt.secret') || 'default-salt';
  }

  /**
   * Hash a 6-digit transaction PIN using SHA-256 with salt.
   */
  hashPin(pin: string): string {
    if (!this.isValidPin(pin)) {
      throw new BadRequestException('PIN must be a 6-digit number');
    }

    return crypto.createHmac('sha256', this.salt).update(pin).digest('hex');
  }

  /**
   * Verify a PIN against a stored hash.
   */
  verifyPin(pin: string, pinHash: string): boolean {
    if (!this.isValidPin(pin)) {
      return false;
    }

    const computedHash = this.hashPin(pin);
    return computedHash === pinHash;
  }

  /**
   * Validate PIN format (6 digits).
   */
  isValidPin(pin: string): boolean {
    return /^\d{6}$/.test(pin);
  }

  /**
   * Generate a random 6-digit PIN.
   */
  generatePin(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}
