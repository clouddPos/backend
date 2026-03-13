import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { QueueModule } from './queue/queue.module';
import { LoggerModule } from './logger/logger.module';
import { AuthModule } from './module/auth/auth.module';
import { MerchantModule } from './module/merchant/merchant.module';
import { TransactionModule } from './module/transaction/transaction.module';
import { PaymentModule } from './module/payment/payment.module';
import { BlockchainModule } from './module/blockchain/blockchain.module';
import { HealthModule } from './module/health/health.module';
import { AdminModule } from './module/admin/admin.module';
import { NotificationModule } from './module/notification/notification.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
        },
      }),
    }),
    LoggerModule,
    DatabaseModule,
    RedisModule,
    QueueModule,
    AuthModule,
    MerchantModule,
    TransactionModule,
    PaymentModule,
    BlockchainModule,
    HealthModule,
    AdminModule,
    NotificationModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }
