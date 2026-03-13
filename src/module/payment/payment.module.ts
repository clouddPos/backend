import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { StripeService } from './stripe.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { CurrencyController } from './currency.controller';
import { StripeWebhookProcessor } from './stripe-webhook.processor';
import { PaymentProcessor } from './payment.processor';
import { BullModule } from '@nestjs/bullmq';
import { TransactionModule } from '../transaction/transaction.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    HttpModule,
    forwardRef(() => TransactionModule), // Avoid circular dependency
    NotificationModule, // For SocketGateway
    BullModule.registerQueue(
      { name: 'transaction-processing' },
    ),
  ],
  controllers: [StripeWebhookController, CurrencyController],
  providers: [StripeService, StripeWebhookProcessor, PaymentProcessor],
  exports: [StripeService],
})
export class PaymentModule {}
