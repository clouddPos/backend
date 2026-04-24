import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { OnChainService } from './onchain.service';
import { WalletService } from './wallet.service';
import { DatabaseService } from '../../../database/database.service';
import { OnChainTxStatus } from '@prisma/client';

// Settlement contract ABI (minimal interface)
const SETTLEMENT_ABI = [
  'function recordSettlement(string txId, uint256 amount, address merchant, string currency) external returns (uint256 settlementId)',
  'function getSettlement(uint256 settlementId) external view returns (tuple(string txId, uint256 amount, address merchant, string currency, uint256 timestamp, bool finalized))',
  'function finalizeSettlement(uint256 settlementId) external',
  'event SettlementRecorded(uint256 indexed settlementId, string txId, uint256 amount, address merchant)',
  'event SettlementFinalized(uint256 indexed settlementId)',
];

@Injectable()
export class SettlementContractService {
  private readonly logger = new Logger(SettlementContractService.name);
  private readonly contractAddress: string;
  private readonly confirmationsRequired: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly onChainService: OnChainService,
    private readonly walletService: WalletService,
    private readonly db: DatabaseService,
  ) {
    this.contractAddress =
      this.configService.get<string>('blockchain.settlementContractAddress') ||
      '';
    this.confirmationsRequired = this.configService.get<number>(
      'blockchain.confirmationsRequired',
    )!;
  }

  /**
   * Record a settlement on-chain.
   */
  async recordSettlement(params: {
    transactionId: string;
    amount: number;
    currency: string;
    merchantAddress: string;
  }): Promise<string> {
    if (!this.contractAddress) {
      this.logger.warn(
        'Settlement contract address not configured — skipping on-chain recording',
      );
      return '';
    }

    try {
      // Get system wallet signer
      const systemWallet = await this.walletService.getSystemWallet();
      const signer = this.onChainService.getSigner(systemWallet.privateKey);

      // Create contract instance
      const contract = new ethers.Contract(
        this.contractAddress,
        SETTLEMENT_ABI,
        signer,
      );

      // Create on-chain transaction record (PENDING)
      const onChainTx = await this.db.onChainTransaction.create({
        data: {
          transactionId: params.transactionId,
          chainId: this.onChainService.getChainId(),
          contractAddress: this.contractAddress,
          status: OnChainTxStatus.PENDING,
          settlementData: {
            txId: params.transactionId,
            amount: params.amount,
            currency: params.currency,
            merchantAddress: params.merchantAddress,
          },
        },
      });

      // Send transaction
      const amountWei = ethers.parseUnits(params.amount.toString(), 18);
      const tx = await contract.recordSettlement(
        params.transactionId,
        amountWei,
        params.merchantAddress,
        params.currency,
      );

      // Update with tx hash (SUBMITTED)
      await this.db.onChainTransaction.update({
        where: { id: onChainTx.id },
        data: {
          txHash: tx.hash,
          status: OnChainTxStatus.SUBMITTED,
        },
      });

      this.logger.log(
        `Settlement submitted on-chain: txHash=${tx.hash} for transaction=${params.transactionId}`,
      );

      return tx.hash;
    } catch (error: any) {
      this.logger.error(
        `recordSettlement failed for ${params.transactionId}: ${error.message}`,
      );

      // Record failure
      await this.db.onChainTransaction.updateMany({
        where: {
          transactionId: params.transactionId,
          status: OnChainTxStatus.PENDING,
        },
        data: {
          status: OnChainTxStatus.FAILED,
          lastError: error.message,
          retryCount: { increment: 1 },
        },
      });

      throw error;
    }
  }

  /**
   * Get settlement status from the smart contract.
   */
  async getSettlementStatus(settlementId: number) {
    if (!this.contractAddress) return null;

    const contract = new ethers.Contract(
      this.contractAddress,
      SETTLEMENT_ABI,
      this.onChainService.getProvider(),
    );

    return contract.getSettlement(settlementId);
  }
}
