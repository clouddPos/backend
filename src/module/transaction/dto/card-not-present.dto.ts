import {
  IsString,
  IsNumber,
  IsNotEmpty,
  Matches,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsAboveMinimumAmount } from './index';

/**
 * DTO for Card-Not-Present (CNP) transactions
 * Used for: E-commerce, mail order, phone order, recurring billing
 *
 * Supports TWO modes:
 * 1. PaymentMethod Token (recommended - works with Stripe.js)
 * 2. Raw card details (requires Stripe raw card data API access)
 */
export class CardNotPresentDto {
  @ApiProperty({
    example: 50.0,
    description: 'Transaction amount in fiat currency',
    minimum: 0.5,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsAboveMinimumAmount()
  amount: number;

  @ApiProperty({
    example: 'USD',
    description: 'Currency code (ISO 4217)',
    maxLength: 3,
  })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiPropertyOptional({
    example: 'pm_1abc123xyz',
    description: 'Stripe PaymentMethod ID from Stripe.js (recommended)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(pm_|tok_)\w+$/, {
    message: 'paymentMethodToken must be a valid Stripe token (pm_* or tok_*)',
  })
  paymentMethodToken?: string;

  @ApiPropertyOptional({
    example: '4242424242424242',
    description:
      'Full card number (16 digits) - requires Stripe raw card data API access',
    minLength: 13,
    maxLength: 19,
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{13,19}$/, {
    message: 'cardNumber must be a valid card number (13-19 digits)',
  })
  cardNumber?: string;

  @ApiPropertyOptional({
    example: '12/25',
    description: 'Card expiry date (MM/YY)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}\/\d{2}$/, { message: 'expiryDate must be in MM/YY format' })
  expiryDate?: string;

  @ApiPropertyOptional({
    example: '123',
    description: 'Card CVV/CVC (3-4 digits)',
    minLength: 3,
    maxLength: 4,
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{3,4}$/, { message: 'cvv must be 3-4 digits' })
  cvv?: string;

  @ApiProperty({
    example: '123456',
    description: '6-digit merchant transaction PIN for authorization',
    minLength: 6,
    maxLength: 6,
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{6}$/, { message: 'transactionPin must be a 6-digit number' })
  transactionPin: string;

  @ApiPropertyOptional({
    example: 'John Doe',
    description: 'Cardholder name',
  })
  @IsString()
  @IsOptional()
  cardholderName?: string;

  @ApiPropertyOptional({
    example: 'Order #12345',
    description: 'Optional order reference or description',
    required: false,
  })
  @IsString()
  @IsOptional()
  orderDescription?: string;

  /**
   * Validate that either paymentMethodToken or raw card details are provided
   */
  validate() {
    if (!this.paymentMethodToken && !this.cardNumber) {
      throw new Error(
        'Either paymentMethodToken or cardNumber must be provided',
      );
    }
    if (this.paymentMethodToken && this.cardNumber) {
      throw new Error('Cannot provide both paymentMethodToken and cardNumber');
    }
    if (this.cardNumber && (!this.expiryDate || !this.cvv)) {
      throw new Error('cardNumber requires expiryDate and cvv');
    }
    return true;
  }
}
