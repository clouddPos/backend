import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../../database/database.service';
import * as crypto from 'crypto';

/**
 * WalletService handles the cryptographic operations for blockchain wallets.
 *
 * Role in System:
 * 1. **Encryption/Decryption**: Securely manages private keys using AES-250-CBC.
 * 2. **Merchant Wallets**: Stores and retrieves encrypted keys used to sign on-chain settlement transactions.
 * 3. **System Wallet**: Manages the master wallet used to pay for gas fees during automated recording.
 *
 * Security Note:
 * Merchant private keys are never stored in plaintext. They are decrypted just-in-time
 * using the application's master secret (WALLET_ENCRYPTION_KEY).
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  private readonly encryptionKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly db: DatabaseService,
  ) {
    this.encryptionKey =
      this.configService.get<string>('security.walletEncryptionKey') || '';
  }

  /**
   * Encrypt a private key for storage.
   */
  encrypt(plaintext: string): string {
    if (!this.encryptionKey) {
      throw new Error('WALLET_ENCRYPTION_KEY not configured');
    }
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt a stored private key.
   */
  decrypt(encryptedText: string): string {
    if (!this.encryptionKey) {
      throw new Error('WALLET_ENCRYPTION_KEY not configured');
    }
    const [ivHex, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Store a wallet key in the database (encrypted).
   */
  async storeWalletKey(params: {
    merchantId?: string;
    address: string;
    privateKey: string;
    hdPath?: string;
    keyType: 'MERCHANT' | 'SYSTEM';
  }) {
    const encrypted = this.encrypt(params.privateKey);

    return this.db.walletKey.create({
      data: {
        merchantId: params.merchantId,
        address: params.address,
        encryptedPrivateKey: encrypted,
        hdPath: params.hdPath,
        keyType: params.keyType,
      },
    });
  }

  /**
   * Retrieve and decrypt a wallet key.
   */
  async getDecryptedKey(address: string): Promise<string> {
    const wallet = await this.db.walletKey.findUnique({
      where: { address },
    });

    if (!wallet || !wallet.isActive) {
      throw new Error(`Wallet ${address} not found or inactive`);
    }

    return this.decrypt(wallet.encryptedPrivateKey);
  }

  /**
   * Get the system wallet for on-chain operations.
   */
  async getSystemWallet(): Promise<{ address: string; privateKey: string }> {
    const systemWallet = await this.db.walletKey.findFirst({
      where: { keyType: 'SYSTEM', isActive: true },
    });

    if (!systemWallet) {
      throw new Error('No active system wallet configured');
    }

    return {
      address: systemWallet.address,
      privateKey: this.decrypt(systemWallet.encryptedPrivateKey),
    };
  }
}
