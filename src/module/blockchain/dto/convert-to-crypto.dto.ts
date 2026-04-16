import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class ConvertToCryptoDto {
  @ApiProperty({
    description: 'Settled or captured transaction ID to convert',
    example: '688b0c28-6258-487c-9de5-756b2ee8faf0',
  })
  @IsString()
  transactionId: string;

  @ApiProperty({
    description: 'Destination wallet address for the crypto payout',
    example: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  })
  @IsString()
  @MinLength(10)
  walletAddress: string;

  @ApiProperty({
    description: 'Target crypto currency ticker',
    example: 'usdt',
  })
  @IsString()
  @MinLength(2)
  currency: string;

  @ApiPropertyOptional({
    description:
      'Optional amount to convert. If omitted, the full transaction amount is used.',
    example: 50,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 8 })
  @Min(0.00000001)
  amount?: number;

  @ApiPropertyOptional({
    description: 'Optional payout description for internal tracking',
    example: 'Conversion for settled card transaction',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
