import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { ChangePinDto } from './dto';
import { Merchant } from './decorators/merchant.decorator';

@ApiTags('Merchant')
@ApiSecurity('apiKey')
@Controller('merchant')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('change-pin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change transaction PIN' })
  @ApiResponse({ status: 200, description: 'PIN changed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid PIN' })
  async changePin(
    @Merchant('id') merchantId: string,
    @Body() dto: ChangePinDto,
  ) {
    return this.authService.changePin(merchantId, dto.oldPin, dto.newPin);
  }
}
