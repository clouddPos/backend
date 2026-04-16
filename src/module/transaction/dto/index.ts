import {
  IsString,
  IsEnum,
  IsNumber,
  IsOptional,
  Min,
  MaxLength,
  MinLength,
  Matches,
  ValidateBy,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType, CardScheme } from '@prisma/client';
import { Type } from 'class-transformer';

/**
 * Validate Stripe payment method ID format (pm_*)
 */
function isStripePaymentMethodId(value: any): boolean {
  return typeof value === 'string' && /^pm_\w+$/.test(value);
}

export function IsStripePaymentMethodId() {
  return ValidateBy({
    name: 'isStripePaymentMethodId',
    validator: {
      validate: (value: any) => isStripePaymentMethodId(value),
      defaultMessage: () =>
        'paymentMethodId must be a valid Stripe payment method ID (e.g., pm_1abc...)',
    },
  });
}

/**
 * Validate minimum amount per currency
 * Stripe minimums: https://stripe.com/docs/currencies#minimum-and-maximum-charge-amounts
 */
const MINIMUM_AMOUNTS: Record<string, number> = {
  USD: 0.5,
  EUR: 0.5,
  GBP: 0.3,
  CAD: 0.5,
  AUD: 0.5,
  JPY: 50,
  CHF: 0.5,
  SEK: 5,
  NOK: 5,
  DKK: 5,
  PLN: 5,
  CZK: 15,
  HUF: 175,
  RON: 2,
  BGN: 1,
  HRK: 4,
  ISK: 85,
  TRY: 10,
  INR: 50,
  SGD: 1,
  HKD: 4,
  KRW: 500,
  MXN: 10,
  BRL: 5,
  ZAR: 10,
  NZD: 1,
};

function isAboveMinimumAmount(value: any, ctx: any): boolean {
  const dto = ctx.object as InitiateTransactionDto;
  const currency = dto.currency?.toUpperCase() || 'USD';
  const minimum = MINIMUM_AMOUNTS[currency] || 0.5; // Default to $0.50

  if (typeof value !== 'number' || value < minimum) {
    ctx.constraints = { minimum, currency };
    return false;
  }
  return true;
}

export function IsAboveMinimumAmount() {
  return ValidateBy({
    name: 'isAboveMinimumAmount',
    constraints: [],
    validator: {
      validate: isAboveMinimumAmount,
      defaultMessage: (ctx: any) => {
        const minimum = ctx.constraints?.minimum || 0.5;
        const currency = ctx.constraints?.currency || 'USD';
        return `Amount must be at least ${minimum} ${currency} (Stripe minimum)`;
      },
    },
  });
}

export class InitiateTransactionDto {
  @ApiPropertyOptional({
    description: 'Merchant ID (optional: derived from API key)',
    deprecated: true,
  })
  @IsOptional()
  @IsString()
  merchantId?: string;

  @ApiProperty({ enum: TransactionType })
  @IsEnum(TransactionType)
  type: TransactionType;

  @ApiProperty({ example: 100.5, description: 'Transaction amount' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsAboveMinimumAmount()
  amount: number;

  @ApiProperty({ example: 'USD', maxLength: 3 })
  @IsString()
  @MaxLength(3)
  @MinLength(3)
  currency: string;

  @ApiPropertyOptional({ enum: CardScheme })
  @IsOptional()
  @IsEnum(CardScheme)
  cardScheme?: CardScheme;

  @ApiPropertyOptional({
    example: '****1234',
    description: 'Masked card number',
  })
  @IsOptional()
  @IsString()
  maskedCardNumber?: string;

  @ApiPropertyOptional({
    example: '12/27',
    description: 'Card expiry date (MM/YY)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}\/\d{2}$/, { message: 'expiryDate must be in MM/YY format' })
  expiryDate?: string;

  // Online mode fields
  @ApiPropertyOptional({
    description: 'CVV (deprecated; use paymentMethodId)',
  })
  @IsOptional()
  @IsString()
  cvv?: string;

  @ApiPropertyOptional({
    description: 'Stripe PaymentMethod ID (required for online transactions)',
    example: 'pm_1abc123xyz',
  })
  @IsOptional()
  @IsString()
  @IsStripePaymentMethodId()
  paymentMethodId?: string;

  // Offline / Pre-Auth mode fields
  @ApiPropertyOptional({
    description: '6-digit issuer authorization code (for offline/pre-auth)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'authorizationCode must be exactly 6 digits' })
  authorizationCode?: string;

  // Sale Completion mode fields
  @ApiPropertyOptional({
    description: 'Reference number 6-12 digits (for sale completion)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{6,12}$/, { message: 'referenceNumber must be 6-12 digits' })
  referenceNumber?: string;

  // Raw card number — handled securely, never persisted
  @ApiPropertyOptional({
    description: 'Full card number (deprecated; use paymentMethodId)',
  })
  @IsOptional()
  @IsString()
  cardNumber?: string;

  @ApiPropertyOptional({
    description: '6-digit transaction PIN for authorization',
    example: '123456',
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  @Matches(/^\d{6}$/, { message: 'transactionPin must be a 6-digit number' })
  transactionPin?: string;
}

export class TransactionFilterDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: TransactionType })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  merchantId?: string;

  @ApiPropertyOptional({ description: 'Start date (ISO string)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO string)' })
  @IsOptional()
  @IsString()
  endDate?: string;
}
