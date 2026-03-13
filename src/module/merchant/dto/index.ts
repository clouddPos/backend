import { IsString, IsEmail, IsOptional, IsEnum, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MerchantStatus } from '@prisma/client';

export class CreateMerchantDto {
  @ApiProperty({ example: 'Acme Payments Ltd' })
  @IsString()
  businessName: string;

  @ApiProperty({ example: 'contact@acme.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Stripe Account ID for connected accounts' })
  @IsOptional()
  @IsString()
  stripeAccountId?: string;

  @ApiPropertyOptional({ description: 'NowPayments API Token' })
  @IsOptional()
  @IsString()
  nowpaymentsApiToken?: string;
}

export class UpdateMerchantDto {
  @ApiPropertyOptional({ example: 'Acme Payments Ltd' })
  @IsOptional()
  @IsString()
  businessName?: string;

  @ApiPropertyOptional({ example: 'contact@acme.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ enum: MerchantStatus })
  @IsOptional()
  @IsEnum(MerchantStatus)
  status?: MerchantStatus;

  @ApiPropertyOptional({ description: 'Stripe Account ID' })
  @IsOptional()
  @IsString()
  stripeAccountId?: string;

  @ApiPropertyOptional({ description: 'NowPayments API Token' })
  @IsOptional()
  @IsString()
  nowpaymentsApiToken?: string;

  @ApiPropertyOptional({ description: 'Hashed transaction PIN' })
  @IsOptional()
  @IsString()
  transactionPinHash?: string;
}

export class SetTransactionPinDto {
  @ApiProperty({ 
    example: '123456', 
    description: '6-digit transaction PIN for authorizing card and crypto payments',
    minLength: 6,
    maxLength: 6,
  })
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  @Matches(/^\d{6}$/, { message: 'PIN must be a 6-digit number' })
  pin: string;
}
