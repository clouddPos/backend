import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateStripeOnrampDto {
  @ApiProperty({
    description: 'Fiat amount to use for the crypto purchase',
    example: 100,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  sourceAmount!: number;

  @ApiProperty({
    description: 'Fiat currency for the purchase',
    example: 'USD',
  })
  @IsString()
  @MinLength(3)
  sourceCurrency!: string;

  @ApiProperty({
    description: 'Crypto currency to buy',
    example: 'usdc',
  })
  @IsString()
  @MinLength(2)
  destinationCurrency!: string;

  @ApiProperty({
    description: 'Crypto network for delivery',
    example: 'ethereum',
  })
  @IsString()
  @MinLength(2)
  destinationNetwork!: string;

  @ApiProperty({
    description: 'Wallet address that should receive the crypto',
    example: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  })
  @IsString()
  @MinLength(10)
  walletAddress!: string;

  @ApiPropertyOptional({
    description:
      'Optional destination crypto amount. Use this instead of sourceAmount if you want to fix the crypto amount.',
    example: 0.025,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0.00000001)
  destinationAmount?: number;

  @ApiPropertyOptional({
    description:
      'Optional customer IP address. If omitted, the backend will use the request IP.',
    example: '203.0.113.10',
  })
  @IsOptional()
  @IsString()
  customerIpAddress?: string;

  @ApiPropertyOptional({
    description: 'Lock the wallet address in the onramp UI',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  lockWalletAddress?: boolean;

  @ApiPropertyOptional({
    description:
      'Settlement speed: "instant" for immediate delivery, "standard" for settled delivery',
    example: 'instant',
    enum: ['instant', 'standard'],
    default: 'instant',
  })
  @IsOptional()
  @IsEnum(['instant', 'standard'])
  settlementSpeed?: 'instant' | 'standard';

  @ApiPropertyOptional({
    description:
      'External transaction ID for tracking (stored in Stripe metadata)',
    example: 'txn_abc123',
  })
  @IsOptional()
  @IsString()
  externalTransactionId?: string;
}
