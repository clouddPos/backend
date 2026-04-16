import { Injectable, BadRequestException } from '@nestjs/common';
import { generate } from 'otplib';

@Injectable()
export class OtpService {
  async generateTotp(secret: string): Promise<string> {
    if (!secret) {
      throw new BadRequestException('OTP secret is not configured');
    }

    return generate({ secret });
  }

  isValidSecret(secret: string): boolean {
    return typeof secret === 'string' && secret.trim().length > 0;
  }
}
