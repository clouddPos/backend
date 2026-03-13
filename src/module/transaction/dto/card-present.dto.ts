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
 * DTO for Card-Present (CP) transactions
 * Supports both:
 * - Card reader tokens (modern terminals)
 * - Authorization codes (legacy terminals)
 * 
 * Note: For online card-present transactions (e.g., typed card details),
 * use the CNP endpoint instead.
 */
export class CardPresentDto {
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
    description: 'Card reader token (for modern terminals like Stripe Terminal)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^pm_\w+$/, { message: 'paymentMethodToken must be a valid Stripe payment method ID (e.g., pm_1abc...)' })
  paymentMethodToken?: string;

  @ApiPropertyOptional({
    example: '789012',
    description: '6-digit authorization code from card reader/terminal (for legacy terminals)',
    minLength: 6,
    maxLength: 6,
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'authorizationCode must be exactly 6 digits' })
  authorizationCode?: string;

  @ApiPropertyOptional({
    example: '****1234',
    description: 'Last 4 digits of card (for reference)',
  })
  @IsString()
  @IsOptional()
  last4?: string;

  @ApiPropertyOptional({
    example: 'Order #12345',
    description: 'Optional order reference or description',
    required: false,
  })
  @IsString()
  @IsOptional()
  orderDescription?: string;

  /**
   * Validate that either paymentMethodToken or authorizationCode is provided
   */
  validate() {
    if (!this.paymentMethodToken && !this.authorizationCode) {
      throw new Error('Either paymentMethodToken or authorizationCode must be provided');
    }
    if (this.paymentMethodToken && this.authorizationCode) {
      throw new Error('Cannot provide both paymentMethodToken and authorizationCode');
    }
    return true;
  }
}
