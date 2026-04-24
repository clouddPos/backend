import {
  IsString,
  IsNumber,
  IsNotEmpty,
  Matches,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsAboveMinimumAmount, IsStripePaymentMethodId } from './index';

/**
 * DTO for Pre-Authorization transactions
 * Used for: Hotels, car rentals, restaurants (authorize now, capture later)
 */
export class PreAuthDto {
  @ApiProperty({
    example: 100.0,
    description: 'Amount to authorize (hold on card)',
    minimum: 0.5,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsAboveMinimumAmount()
  amount!: number;

  @ApiProperty({
    example: 'USD',
    description: 'Currency code (ISO 4217)',
    maxLength: 3,
  })
  @IsString()
  @IsNotEmpty()
  currency!: string;

  @ApiPropertyOptional({
    example: 'pm_1abc123xyz',
    description: 'Stripe PaymentMethod ID (for online pre-auth)',
  })
  @IsString()
  @IsOptional()
  @IsStripePaymentMethodId()
  paymentMethodId?: string;

  @ApiPropertyOptional({
    example: '789012',
    description: '6-digit authorization code (for offline pre-auth)',
    minLength: 6,
    maxLength: 6,
  })
  @IsString()
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'authorizationCode must be exactly 6 digits' })
  authorizationCode?: string;

  @ApiProperty({
    example: '123456',
    description: '6-digit merchant transaction PIN for authorization',
    minLength: 6,
    maxLength: 6,
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{6}$/, { message: 'transactionPin must be a 6-digit number' })
  transactionPin!: string;

  @ApiPropertyOptional({
    example: 'Hotel reservation #12345',
    description: 'Optional order reference or description',
    required: false,
  })
  @IsString()
  @IsOptional()
  orderDescription?: string;
}
