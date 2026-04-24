import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
import { PinService } from '../merchant/pin.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
    private readonly pinService: PinService,
  ) {}

  /**
   * Change merchant transaction PIN.
   */
  async changePin(merchantId: string, oldPin: string, newPin: string) {
    const merchant = await this.db.merchant.findUnique({
      where: { id: merchantId },
      select: { transactionPinHash: true },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    if (!merchant.transactionPinHash) {
      throw new BadRequestException('Transaction PIN not configured');
    }

    // Verify old PIN
    if (!this.pinService.verifyPin(oldPin, merchant.transactionPinHash)) {
      throw new BadRequestException('Invalid current PIN');
    }

    // Validate new PIN format
    if (!this.pinService.isValidPin(newPin)) {
      throw new BadRequestException('New PIN must be a 6-digit number');
    }

    // Hash and update new PIN
    const newPinHash = this.pinService.hashPin(newPin);

    await this.db.merchant.update({
      where: { id: merchantId },
      data: { transactionPinHash: newPinHash },
    });

    this.logger.log(`Transaction PIN changed for merchant ${merchantId}`);
    return { message: 'PIN changed successfully' };
  }

  /**
   * Verify transaction PIN (used by transaction service).
   */
  async verifyPin(merchantId: string, pin: string): Promise<boolean> {
    const merchant = await this.db.merchant.findUnique({
      where: { id: merchantId },
      select: { transactionPinHash: true },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    if (!merchant.transactionPinHash) {
      throw new BadRequestException('Transaction PIN not configured');
    }

    return this.pinService.verifyPin(pin, merchant.transactionPinHash);
  }
}
