import {
  Controller,
  Get,
  Post,
  Body,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiSecurity,
} from '@nestjs/swagger';
import { MerchantService } from './merchant.service';
import { PinService } from './pin.service';
import { SetTransactionPinDto } from './dto';
import { Merchant } from '../auth/decorators/merchant.decorator';

@ApiTags('Merchant')
@ApiSecurity('apiKey')
@ApiHeader({
  name: 'x-api-key',
  description:
    'POS API key (seeded value). Fill this via Swagger Authorize before calling the endpoints.',
  required: true,
})
@Controller('merchant')
export class MerchantController {
  constructor(
    private readonly merchantService: MerchantService,
    private readonly pinService: PinService,
  ) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get merchant profile' })
  async getProfile(@Merchant('id') merchantId: string) {
    return this.merchantService.findById(merchantId);
  }

  @Post('set-pin')
  @ApiOperation({ 
    summary: 'Set transaction PIN for merchant',
    description: 'Set a 6-digit transaction PIN required for authorizing card and crypto payments.',
  })
  @ApiResponse({ status: 200, description: 'PIN set successfully' })
  @ApiResponse({ status: 400, description: 'Invalid PIN format' })
  async setTransactionPin(
    @Merchant('id') merchantId: string,
    @Body() dto: SetTransactionPinDto,
  ) {
    // Validate PIN format
    if (!this.pinService.isValidPin(dto.pin)) {
      throw new BadRequestException('PIN must be a 6-digit number');
    }

    // Hash the PIN
    const pinHash = this.pinService.hashPin(dto.pin);

    // Update merchant with hashed PIN
    await this.merchantService.update(merchantId, { transactionPinHash: pinHash });

    return { message: 'Transaction PIN set successfully' };
  }

  @Post('verify-pin')
  @ApiOperation({ summary: 'Verify transaction PIN' })
  @ApiResponse({ status: 200, description: 'PIN is valid' })
  @ApiResponse({ status: 400, description: 'Invalid PIN' })
  async verifyTransactionPin(
    @Merchant('id') merchantId: string,
    @Body() dto: SetTransactionPinDto,
  ) {
    const merchant = await this.merchantService.findById(merchantId);

    if (!merchant.transactionPinHash) {
      throw new BadRequestException('Transaction PIN not configured');
    }

    const isValid = this.pinService.verifyPin(dto.pin, merchant.transactionPinHash);

    if (!isValid) {
      throw new BadRequestException('Invalid transaction PIN');
    }

    return { valid: true, message: 'PIN verified successfully' };
  }

  @Post('generate-pin')
  @ApiOperation({ 
    summary: 'Generate random transaction PIN',
    description: 'Generates a random 6-digit PIN and sets it for the merchant.',
  })
  @ApiResponse({ status: 200, description: 'PIN generated and set' })
  async generateTransactionPin(@Merchant('id') merchantId: string) {
    const pin = this.pinService.generatePin();
    const pinHash = this.pinService.hashPin(pin);

    await this.merchantService.update(merchantId, { transactionPinHash: pinHash });

    return { 
      message: 'Transaction PIN generated successfully',
      pin: pin,
      warning: 'Store this PIN securely. It will not be shown again.',
    };
  }
}
