import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DatabaseModule } from '../../database/database.module';
import { MerchantModule } from '../merchant/merchant.module';
import { ApiKeyMiddleware } from './middleware/api-key.middleware';
import { TransactionPinGuard } from './guards/transaction-pin.guard';

@Module({
  imports: [DatabaseModule, MerchantModule],
  controllers: [AuthController],
  providers: [AuthService, ApiKeyMiddleware, TransactionPinGuard],
  exports: [ApiKeyMiddleware, TransactionPinGuard, MerchantModule],
})
export class AuthModule {}
