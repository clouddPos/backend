import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnChainService } from './onchain.service';
import { DatabaseService } from '../../../database/database.service';
import { OnChainTxStatus } from '@prisma/client';

@Injectable()
export class TxMonitorService implements OnModuleInit {
  private readonly logger = new Logger(TxMonitorService.name);
  private readonly confirmationsRequired: number;
  private monitorInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly onChainService: OnChainService,
    private readonly db: DatabaseService,
  ) {
    this.confirmationsRequired = this.configService.get<number>(
      'blockchain.confirmationsRequired',
    )!;
  }

  onModuleInit() {
    // Poll every 30 seconds for pending on-chain transactions
    this.monitorInterval = setInterval(() => {
      this.checkPendingTransactions().catch((err) =>
        this.logger.error(`Monitor cycle failed: ${err.message}`),
      );
    }, 30_000);

    this.logger.log(
      `Tx monitor started: checking every 30s, ${this.confirmationsRequired} confirmations required`,
    );
  }

  onModuleDestroy() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
  }

  async checkPendingTransactions() {
    const pendingTxs = await this.db.onChainTransaction.findMany({
      where: {
        status: OnChainTxStatus.SUBMITTED,
        txHash: { not: null },
      },
      take: 50,
    });

    if (pendingTxs.length === 0) return;

    const currentBlock = await this.onChainService.getBlockNumber();

    for (const tx of pendingTxs) {
      try {
        const receipt = await this.onChainService.getTransactionReceipt(
          tx.txHash!,
        );

        if (!receipt) {
          // Transaction not mined yet — check if it's been too long
          continue;
        }

        if (receipt.status === 0) {
          // Transaction reverted
          await this.db.onChainTransaction.update({
            where: { id: tx.id },
            data: {
              status: OnChainTxStatus.FAILED,
              blockNumber: receipt.blockNumber,
              lastError: 'Transaction reverted on-chain',
            },
          });
          this.logger.warn(`On-chain tx ${tx.txHash} reverted`);
          continue;
        }

        const confirmations = currentBlock - receipt.blockNumber;
        if (confirmations >= this.confirmationsRequired) {
          // Transaction confirmed
          await this.db.onChainTransaction.update({
            where: { id: tx.id },
            data: {
              status: OnChainTxStatus.CONFIRMED,
              blockNumber: receipt.blockNumber,
              blockTimestamp: new Date(),
              gasUsed: receipt.gasUsed.toString(),
              gasFee: (receipt.gasUsed * receipt.gasPrice).toString(),
            },
          });

          this.logger.log(
            `On-chain tx ${tx.txHash} confirmed at block ${receipt.blockNumber} (${confirmations} confirmations)`,
          );
        }
      } catch (error: any) {
        this.logger.error(`Error checking tx ${tx.txHash}: ${error.message}`);
      }
    }
  }
}
