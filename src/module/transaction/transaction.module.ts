import { Module, forwardRef } from '@nestjs/common';
import { TransactionController } from './transaction.controller';
import { CnpPaymentController } from './cnp-payment.controller';
import { CpPaymentController } from './cp-payment.controller';
import { PreAuthPaymentController } from './pre-auth-payment.controller';
import { TransactionService } from './transaction.service';
import { IdempotencyInterceptor } from './interceptors/idempotency.interceptor';
import { DatabaseModule } from '../../database/database.module';
import { QueueModule } from '../../queue/queue.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { NotificationModule } from '../notification/notification.module';
import { MerchantModule } from '../merchant/merchant.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [
    DatabaseModule,
    QueueModule,
    forwardRef(() => BlockchainModule),
    NotificationModule,
    MerchantModule,
    forwardRef(() => PaymentModule), // For StripeService - use forwardRef to avoid circular dependency
  ],
  controllers: [
    TransactionController, // Generic endpoint (legacy)
    CnpPaymentController, // POST /api/v1/cnp-payments - Card-Not-Present
    CpPaymentController, // POST /api/v1/cp-payments - Card-Present
    PreAuthPaymentController, // POST /api/v1/pre-auth - Pre-Authorization
  ],
  providers: [TransactionService, IdempotencyInterceptor],
  exports: [TransactionService],
})
export class TransactionModule {}
