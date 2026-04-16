import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { QueueService } from '../../queue/queue.service';
import { InitiateTransactionDto, TransactionFilterDto } from './dto';
import { TransactionStateMachine } from './transaction-state.machine';
import { TransactionStatus, TransactionType } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { EmailService } from '../notification/email.service';
import { SocketGateway } from '../notification/socket.gateway';
import { PinService } from '../merchant/pin.service';

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly queueService: QueueService,
    private readonly emailService: EmailService,
    private readonly socketGateway: SocketGateway,
    private readonly pinService: PinService,
  ) {}

  async initiate(
    dto: InitiateTransactionDto,
    idempotencyKey?: string,
    merchantId?: string,
  ) {
    // Validate mode-specific fields
    this.validateTransactionMode(dto);

    // Use merchantId from parameter (from API key middleware) or fallback to DTO
    const effectiveMerchantId = merchantId || dto.merchantId;

    if (!effectiveMerchantId) {
      throw new BadRequestException('Merchant ID is required');
    }

    // Verify transaction PIN if provided (required for CARD and CRYPTO payments)
    if (
      dto.transactionPin &&
      (dto.type === TransactionType.ONLINE ||
        dto.type === TransactionType.CRYPTO)
    ) {
      await this.verifyMerchantPin(effectiveMerchantId, dto.transactionPin);
    }

    // Check for duplicate transaction (same merchant, amount, card within 5 minutes)
    if (dto.type === TransactionType.ONLINE && dto.paymentMethodId) {
      await this.checkForDuplicateTransaction(effectiveMerchantId, dto);
    }

    const key = idempotencyKey || uuidv4();

    // Check for existing transaction with same idempotency key
    const existing = await this.db.transaction.findUnique({
      where: { idempotencyKey: key },
    });
    if (existing) {
      this.logger.log(`Duplicate request detected for idempotency key ${key}`);
      return existing;
    }

    const transaction = await this.db.transaction.create({
      data: {
        idempotencyKey: key,
        merchantId: effectiveMerchantId,
        type: dto.type,
        amount: dto.amount,
        currency: dto.currency.toUpperCase(),
        cardScheme: dto.cardScheme,
        maskedCardNumber: dto.maskedCardNumber,
        expiryDate: dto.expiryDate,
        authorizationCode: dto.authorizationCode,
        referenceNumber: dto.referenceNumber,
        status: TransactionStatus.INITIATED,
      },
    });

    // Enqueue transaction for payment processing (skip crypto)
    if (dto.type !== TransactionType.CRYPTO) {
      await this.queueService.addJob(
        'transaction-processing',
        'process-payment',
        {
          transactionId: transaction.id,
          type: dto.type,
          paymentMethodId: dto.paymentMethodId,
        },
        {
          jobId: transaction.id,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      );
    }

    this.logger.log(
      `Transaction initiated: ${transaction.id} [${dto.type}] ${dto.amount} ${dto.currency}`,
    );
    return transaction;
  }

  async findById(id: string) {
    const transaction = await this.db.transaction.findUnique({
      where: { id },
      include: {
        blockchainTx: true,
        onChainTxs: true,
        merchant: {
          select: { id: true, businessName: true, email: true },
        },
      },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction ${id} not found`);
    }

    return transaction;
  }

  async findAll(filters: TransactionFilterDto) {
    const {
      page = 1,
      limit = 20,
      type,
      status,
      merchantId,
      startDate,
      endDate,
    } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (type) where.type = type;
    if (status) where.status = status;
    if (merchantId) where.merchantId = merchantId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [transactions, total] = await Promise.all([
      this.db.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          merchant: { select: { id: true, businessName: true } },
        },
      }),
      this.db.transaction.count({ where }),
    ]);

    return {
      data: transactions,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateStatus(
    id: string,
    newStatus: TransactionStatus,
    gatewayData?: any,
  ) {
    const transaction = await this.findById(id);
    if (transaction.status === newStatus) {
      this.logger.debug(
        `Transaction ${id} already in status ${newStatus} - skipping`,
      );
      return transaction;
    }

    if (TransactionStateMachine.isTerminal(transaction.status)) {
      this.logger.warn(
        `Transaction ${id} is terminal (${transaction.status}); ignoring update to ${newStatus}`,
      );
      return transaction;
    }
    TransactionStateMachine.transition(transaction.status, newStatus);

    const updated = await this.db.transaction.update({
      where: { id },
      data: {
        status: newStatus,
        ...(gatewayData?.gatewayReference && {
          gatewayReference: gatewayData.gatewayReference,
        }),
        ...(gatewayData?.gatewayResponse && {
          gatewayResponse: gatewayData.gatewayResponse,
        }),
        ...(gatewayData?.authorizationCode && {
          authorizationCode: gatewayData.authorizationCode,
        }),
      },
      include: {
        merchant: {
          select: { id: true, businessName: true, email: true },
        },
        blockchainTx: true,
        onChainTxs: true,
      },
    });

    this.logger.log(`Transaction ${id}: ${transaction.status} → ${newStatus} `);

    // Trigger blockchain recording on settlement
    if (newStatus === TransactionStatus.SETTLED) {
      this.logger.log(
        `Triggering notifications and blockchain sync for settled tx ${id}`,
      );

      // 1. Notify POS terminal via WebSockets
      this.socketGateway.notifyTransactionSettled(transaction.merchantId, {
        message: 'Transaction successfully settled',
        transactionId: id,
        amount: Number(transaction.amount),
        currency: transaction.currency,
        authorizationCode: updated.authorizationCode,
      });

      // 2. Send Email to merchant
      if (transaction.merchant?.email) {
        // Run asynchronously so it doesn't block the webhook response
        this.emailService
          .sendTransactionSuccessEmail(
            transaction.merchant.email,
            id,
            Number(transaction.amount),
            transaction.currency,
            transaction.type,
          )
          .catch((err) =>
            this.logger.error(`Failed to send email: ${err.message}`),
          );
      }

      // 3. Queue Blockchain Sync
      await this.queueService.addJob(
        'blockchain-sync',
        'record-settlement',
        { transactionId: id },
        {
          attempts: 5,
          backoff: { type: 'exponential', delay: 5000 },
        },
      );
    } else if (
      newStatus === TransactionStatus.CAPTURED &&
      updated.authorizationCode
    ) {
      // Notify POS terminal about the authorization code as soon as it is captured
      this.socketGateway.notifyTransactionAuthorized(transaction.merchantId, {
        message: 'Transaction authorized',
        transactionId: id,
        authorizationCode: updated.authorizationCode,
        amount: Number(transaction.amount),
        currency: transaction.currency,
      });
    }

    return updated;
  }

  /**
   * Advance a transaction to a target status, stepping through valid transitions.
   */
  async advanceStatus(
    id: string,
    targetStatus: TransactionStatus,
    gatewayData?: any,
  ) {
    const transaction = await this.findById(id);

    if (transaction.status === targetStatus) return transaction;
    if (TransactionStateMachine.isTerminal(transaction.status))
      return transaction;

    const path = TransactionStateMachine.getPath(
      transaction.status,
      targetStatus,
    );
    if (!path) {
      throw new BadRequestException(
        `No valid transition path: ${transaction.status} â†’ ${targetStatus}`,
      );
    }

    let current = transaction;
    for (const status of path) {
      current = await this.updateStatus(id, status, gatewayData);
    }
    return current;
  }

  async capture(id: string) {
    const transaction = await this.findById(id);
    TransactionStateMachine.transition(
      transaction.status,
      TransactionStatus.CAPTURED,
    );

    // Enqueue capture request to payment gateway
    await this.queueService.addJob(
      'transaction-processing',
      'capture-payment',
      { transactionId: id, gatewayReference: transaction.gatewayReference },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );

    return {
      message: 'Capture queued',
      transactionId: id,
      status: transaction.status,
    };
  }

  async reverse(id: string) {
    const transaction = await this.findById(id);
    TransactionStateMachine.transition(
      transaction.status,
      TransactionStatus.REVERSED,
    );

    // Enqueue reversal request to payment gateway
    await this.queueService.addJob(
      'transaction-processing',
      'reverse-payment',
      { transactionId: id, gatewayReference: transaction.gatewayReference },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );

    return {
      message: 'Reversal queued',
      transactionId: id,
      status: transaction.status,
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────

  private validateTransactionMode(dto: InitiateTransactionDto) {
    if (dto.cardNumber || dto.cvv) {
      throw new BadRequestException(
        'Raw card data is not accepted. Use paymentMethodId instead.',
      );
    }

    switch (dto.type) {
      case TransactionType.ONLINE:
        // CNP endpoint uses raw card details, so paymentMethodId is optional
        // Card details are validated and processed directly by CNP controller
        break;

      case TransactionType.OFFLINE:
        // CP payments require authorizationCode
        if (!dto.authorizationCode) {
          throw new BadRequestException(
            `${dto.type} transactions require authorizationCode`,
          );
        }
        break;

      case TransactionType.PRE_AUTH:
        if (!dto.paymentMethodId && !dto.authorizationCode) {
          throw new BadRequestException(
            'Pre-auth requires paymentMethodId (online) or authorizationCode (offline)',
          );
        }
        break;

      case TransactionType.SALE_COMPLETION:
        if (!dto.referenceNumber) {
          throw new BadRequestException(
            'Sale completion requires referenceNumber',
          );
        }
        break;

      case TransactionType.CRYPTO:
        // Crypto transactions do not require card details.
        // Amount and currency are validated by DTO.
        break;
    }
  }

  /**
   * Verify merchant transaction PIN.
   * Throws BadRequestException if PIN is invalid or not set.
   */
  async verifyMerchantPin(merchantId: string, pin: string) {
    const merchant = await this.db.merchant.findUnique({
      where: { id: merchantId },
      select: { transactionPinHash: true, email: true },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    if (!merchant.transactionPinHash) {
      throw new BadRequestException(
        'Transaction PIN not configured. Please set up your transaction PIN in merchant settings.',
      );
    }

    if (!this.pinService.verifyPin(pin, merchant.transactionPinHash)) {
      throw new BadRequestException('Invalid transaction PIN');
    }

    this.logger.log(`Transaction PIN verified for merchant ${merchantId}`);
  }

  /**
   * Check for duplicate transactions (same merchant, amount, payment method within 5 minutes).
   * Prevents accidental double-charging.
   */
  private async checkForDuplicateTransaction(
    merchantId: string,
    dto: InitiateTransactionDto,
  ) {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const similarTransactions = await this.db.transaction.findMany({
      where: {
        merchantId,
        type: TransactionType.ONLINE,
        amount: dto.amount,
        currency: dto.currency.toUpperCase(),
        createdAt: { gte: fiveMinutesAgo },
        status: {
          in: [
            TransactionStatus.INITIATED,
            TransactionStatus.AUTHORIZED,
            TransactionStatus.SETTLED,
          ],
        },
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
    });

    if (similarTransactions.length > 0) {
      this.logger.warn(
        `Potential duplicate transaction detected: Merchant ${merchantId}, Amount ${dto.amount} ${dto.currency}, ` +
          `PaymentMethod ${dto.paymentMethodId}. Found ${similarTransactions.length} similar transactions in last 5 minutes.`,
      );

      // Check if any have the same payment method
      const exactDuplicate = similarTransactions.find((tx) => {
        // We can't directly compare paymentMethodId since it's not stored on Transaction
        // But we can check if there's a related PaymentMethod record
        return true; // Conservative approach - flag all similar transactions
      });

      if (exactDuplicate) {
        throw new BadRequestException(
          `Duplicate transaction detected: A transaction for ${dto.amount} ${dto.currency} was already initiated within the last 5 minutes. ` +
            `Transaction IDs: ${similarTransactions.map((tx) => tx.id).join(', ')}. ` +
            `If this is intentional, please wait 5 minutes or use a different idempotency key.`,
        );
      }
    }
  }
}
