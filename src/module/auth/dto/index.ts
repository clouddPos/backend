import { IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePinDto {
  @ApiProperty({
    example: '123456',
    description: 'Current 6-digit transaction PIN',
    minLength: 6,
    maxLength: 6,
  })
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  @Matches(/^\d{6}$/, { message: 'PIN must be a 6-digit number' })
  oldPin: string;

  @ApiProperty({
    example: '987654',
    description: 'New 6-digit transaction PIN',
    minLength: 6,
    maxLength: 6,
  })
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  @Matches(/^\d{6}$/, { message: 'PIN must be a 6-digit number' })
  newPin: string;
}
