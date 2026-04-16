import {
  IsString,
  IsNumber,
  Min,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitiateCryptoPaymentDto {
  @ApiPropertyOptional({
    description: 'Merchant ID (deprecated: derived from API key)',
    deprecated: true,
  })
  @IsOptional()
  @IsString()
  merchantId?: string;

  @ApiProperty({ example: 50.0, description: 'Amount in Fiat to be paid' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @ApiProperty({ example: 'USD', description: 'Currency of the fiat amount' })
  @IsString()
  currency: string;

  @ApiPropertyOptional({
    description: 'Crypto currency to pay with (e.g., btc, eth, usdt)',
    example: 'btc',
  })
  @IsOptional()
  @IsString()
  payCurrency?: string;

  @ApiPropertyOptional({
    description: 'Title of the order to display to the customer',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({
    description: '6-digit transaction PIN for authorization (required)',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(6)
  @Matches(/^\d{6}$/, { message: 'transactionPin must be a 6-digit number' })
  transactionPin: string;
}
