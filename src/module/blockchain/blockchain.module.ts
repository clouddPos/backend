import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { NowPaymentsService } from './nowpayments.service';
import { NowPaymentsCallbackController } from './nowpayments-callback.controller';
import { NowPaymentsCallbackProcessor } from './nowpayments-callback.processor';
import { BlockchainSyncService } from './blockchain-sync.service';
import { OnChainService } from './onchain/onchain.service';
import { WalletService } from './onchain/wallet.service';
import { SettlementContractService } from './onchain/settlement-contract.service';
import { TxMonitorService } from './onchain/tx-monitor.service';
import { CryptoController } from './crypto.controller';
import { TransactionModule } from '../transaction/transaction.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    HttpModule,
    AuthModule,
    forwardRef(() => TransactionModule),
  ],
  controllers: [NowPaymentsCallbackController, CryptoController],
  providers: [
    NowPaymentsService,
    NowPaymentsCallbackProcessor,
    BlockchainSyncService,
    OnChainService,
    WalletService,
    SettlementContractService,
    TxMonitorService,
  ],
  exports: [
    OnChainService,
    WalletService,
    SettlementContractService,
    NowPaymentsService,
  ],
})
export class BlockchainModule { }
