import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';

@Injectable()
export class OnChainService {
  private readonly logger = new Logger(OnChainService.name);
  private provider: ethers.JsonRpcProvider;
  private readonly chainId: number;
  private readonly blockExplorerUrl: string;

  constructor(private readonly configService: ConfigService) {
    const rpcUrl = this.configService.get<string>('blockchain.rpcUrl')!;
    this.chainId = this.configService.get<number>('blockchain.chainId')!;
    this.blockExplorerUrl = this.configService.get<string>(
      'blockchain.blockExplorerUrl',
    )!;

    this.provider = new ethers.JsonRpcProvider(rpcUrl, this.chainId);
    this.logger.log(
      `OnChain provider initialized: chainId=${this.chainId}, rpc=${rpcUrl}`,
    );
  }

  getProvider(): ethers.JsonRpcProvider {
    return this.provider;
  }

  getSigner(privateKey: string): ethers.Wallet {
    return new ethers.Wallet(privateKey, this.provider);
  }

  async getBalance(address: string): Promise<string> {
    const balance = await this.provider.getBalance(address);
    return ethers.formatEther(balance);
  }

  async getBlockNumber(): Promise<number> {
    return this.provider.getBlockNumber();
  }

  async getTransactionReceipt(
    txHash: string,
  ): Promise<ethers.TransactionReceipt | null> {
    return this.provider.getTransactionReceipt(txHash);
  }

  async waitForTransaction(
    txHash: string,
    confirmations: number,
  ): Promise<ethers.TransactionReceipt | null> {
    return this.provider.waitForTransaction(txHash, confirmations);
  }

  getExplorerTxUrl(txHash: string): string {
    return `${this.blockExplorerUrl}/tx/${txHash}`;
  }

  getExplorerAddressUrl(address: string): string {
    return `${this.blockExplorerUrl}/address/${address}`;
  }

  getChainId(): number {
    return this.chainId;
  }
}
