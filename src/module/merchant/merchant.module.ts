import { Module } from '@nestjs/common';
import { MerchantController } from './merchant.controller';
import { MerchantService } from './merchant.service';
import { PinService } from './pin.service';

@Module({
  controllers: [MerchantController],
  providers: [MerchantService, PinService],
  exports: [MerchantService, PinService],
})
export class MerchantModule {}
