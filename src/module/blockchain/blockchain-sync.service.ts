import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { QueueService } from '../../queue/queue.service';
import { DatabaseService } from '../../database/database.service';
import { NowPaymentsService } from './nowpayments.service';
import { SettlementContractService } from './onchain/settlement-contract.service';
import { Job } from 'bullmq';
import { ethers } from 'ethers';

@Injectable()
export class BlockchainSyncService implements OnModuleInit {
  private readonly logger = new Logger(BlockchainSyncService.name);

  constructor(
    private readonly queueService: QueueService,
    private readonly db: DatabaseService,
    private readonly nowPaymentsService: NowPaymentsService,
    private readonly settlementContract: SettlementContractService,
  ) { }

  onModuleInit() {
    this.queueService.registerWorker(
      'blockchain-sync',
      async (job: Job) => {
        if (job.name === 'record-settlement') {
          await this.handleSettlementRecording(job.data);
        }
      },
      { concurrency: 3 },
    );

    this.logger.log('Blockchain sync worker registered');
  }

  private async handleSettlementRecording(data: { transactionId: string }) {
    const transaction = await this.db.transaction.findUnique({
      where: { id: data.transactionId },
      include: {
        merchant: {
          include: { walletKeys: { where: { isActive: true }, take: 1 } },
        },
      },
    });

    if (!transaction) {
      this.logger.warn(
        `Transaction ${data.transactionId} not found for settlement recording`,
      );
      return;
    }

    // Record on-chain settlement
    const merchantAddress =
      transaction.merchant?.walletKeys?.[0]?.address || ethers.ZeroAddress;

    try {
      await this.settlementContract.recordSettlement({
        transactionId: transaction.id,
        amount: Number(transaction.amount),
        currency: transaction.currency,
        merchantAddress,
      });

      this.logger.log(`Settlement recorded on-chain for tx ${transaction.id}`);
    } catch (error: any) {
      this.logger.error(
        `On-chain settlement failed for tx ${transaction.id}: ${error.message}`,
      );
      throw error; // retry via BullMQ
    }
  }
}
