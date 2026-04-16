import { IsString, IsNumber, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for capturing a pre-authorization
 * Used to capture funds from a previously authorized transaction
 */
export class CaptureAuthDto {
  @ApiProperty({
    example: 85.0,
    description: 'Amount to capture (can be less than authorized amount)',
    minimum: 0.01,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsNotEmpty()
  amount: number;

  @ApiProperty({
    example: 'USD',
    description: 'Currency code (ISO 4217)',
    maxLength: 3,
  })
  @IsString()
  @IsNotEmpty()
  currency: string;
}
