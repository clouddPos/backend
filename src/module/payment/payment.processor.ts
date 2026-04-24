import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { DatabaseService } from '../../database/database.service';
import { TransactionService } from '../transaction/transaction.service';
import { TransactionStatus, TransactionType } from '@prisma/client';

@Processor('transaction-processing')
export class PaymentProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentProcessor.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly db: DatabaseService,
    private readonly transactionService: TransactionService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing job ${job.id} of type ${job.name}`);

    switch (job.name) {
      case 'process-payment':
        return this.handleProcessPayment(job.data);
      case 'capture-payment':
        return this.handleCapturePayment(job.data);
      case 'reverse-payment':
        return this.handleReversePayment(job.data);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleProcessPayment(data: {
    transactionId: string;
    type: TransactionType;
    paymentMethodId?: string;
  }) {
    const { transactionId, type } = data;

    // Fetch up-to-date transaction record
    const transaction = await this.db.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      this.logger.error(`Transaction ${transactionId} not found`);
      return;
    }

    if (transaction.status !== TransactionStatus.INITIATED) {
      this.logger.warn(
        `Transaction ${transactionId} is already in status ${transaction.status}`,
      );
      return;
    }

    try {
      if (
        type === TransactionType.ONLINE ||
        type === TransactionType.PRE_AUTH
      ) {
        if (!data.paymentMethodId) {
          if (
            type === TransactionType.PRE_AUTH &&
            transaction.authorizationCode
          ) {
            await this.transactionService.advanceStatus(
              transactionId,
              TransactionStatus.AUTHORIZED,
              {
                gatewayReference: `OFFLINE_${transactionId}`,
                authorizationCode: transaction.authorizationCode,
              },
            );
            return;
          }

          this.logger.error(
            `Missing paymentMethodId for ${type} transaction ${transactionId}`,
          );
          await this.transactionService.updateStatus(
            transactionId,
            TransactionStatus.FAILED,
            {
              gatewayResponse: { error: 'Missing paymentMethodId' },
            },
          );
          return;
        }

        const result = await this.stripeService.chargeCard({
          transactionId,
          type,
          amount: Number(transaction.amount),
          currency: transaction.currency,
          paymentMethodId: data.paymentMethodId,
        });

        if (result.success) {
          const gatewayData = {
            gatewayReference: result.gatewayReference,
            gatewayResponse: result.rawResponse,
            authorizationCode: result.authorizationCode,
          };

          if (
            result.resultCode === 'requires_capture' ||
            type === TransactionType.PRE_AUTH
          ) {
            await this.transactionService.advanceStatus(
              transactionId,
              TransactionStatus.AUTHORIZED,
              gatewayData,
            );
          } else {
            await this.transactionService.advanceStatus(
              transactionId,
              TransactionStatus.SETTLED,
              gatewayData,
            );
          }
        } else {
          await this.transactionService.updateStatus(
            transactionId,
            TransactionStatus.FAILED,
            {
              gatewayResponse: result.rawResponse,
            },
          );
        }
      } else if (type === TransactionType.OFFLINE) {
        // Offline sync - validate authorization code before marking as settled
        if (!transaction.authorizationCode) {
          this.logger.error(
            `Offline transaction ${transactionId} missing authorization code`,
          );
          await this.transactionService.updateStatus(
            transactionId,
            TransactionStatus.FAILED,
            {
              gatewayResponse: {
                error: 'Missing authorization code for offline transaction',
              },
            },
          );
          return;
        }

        // Verify the authorization code format (6 digits)
        if (!/^\d{6}$/.test(transaction.authorizationCode)) {
          this.logger.error(
            `Offline transaction ${transactionId} has invalid authorization code format`,
          );
          await this.transactionService.updateStatus(
            transactionId,
            TransactionStatus.FAILED,
            {
              gatewayResponse: {
                error: 'Invalid authorization code format - must be 6 digits',
              },
            },
          );
          return;
        }

        // Mark as settled with the authorization code as reference
        // Note: In production, you would verify this code with the issuing bank
        await this.transactionService.advanceStatus(
          transactionId,
          TransactionStatus.SETTLED,
          {
            gatewayReference: `OFFLINE_${transaction.authorizationCode}_${transactionId}`,
            authorizationCode: transaction.authorizationCode,
          },
        );

        this.logger.log(
          `Offline transaction ${transactionId} verified and settled with auth code ${transaction.authorizationCode}`,
        );
      } else if (type === TransactionType.SALE_COMPLETION) {
        this.logger.warn(
          `Sale completion flow not implemented for ${transactionId}`,
        );
        await this.transactionService.updateStatus(
          transactionId,
          TransactionStatus.FAILED,
          {
            gatewayResponse: { error: 'Sale completion not implemented' },
          },
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to process payment for ${transactionId}: ${error.message}`,
      );
      await this.transactionService.updateStatus(
        transactionId,
        TransactionStatus.FAILED,
        {
          gatewayResponse: { error: error.message },
        },
      );
      throw error;
    }
  }

  private async handleCapturePayment(data: {
    transactionId: string;
    gatewayReference?: string;
  }) {
    this.logger.log(`Capturing payment for ${data.transactionId}`);

    const transaction = await this.db.transaction.findUnique({
      where: { id: data.transactionId },
    });

    if (!transaction) {
      this.logger.error(
        `Transaction ${data.transactionId} not found for capture`,
      );
      return;
    }

    if (!transaction.gatewayReference) {
      this.logger.error(
        `Missing gatewayReference for capture ${data.transactionId}`,
      );
      return;
    }

    if (transaction.status !== TransactionStatus.AUTHORIZED) {
      this.logger.warn(
        `Transaction ${data.transactionId} not in AUTHORIZED state`,
      );
      return;
    }

    try {
      const result = await this.stripeService.capturePaymentIntent(
        transaction.gatewayReference,
      );
      if (result.success) {
        await this.transactionService.advanceStatus(
          data.transactionId,
          TransactionStatus.SETTLED,
          {
            gatewayReference: transaction.gatewayReference,
            gatewayResponse: result.rawResponse,
            authorizationCode: result.authorizationCode,
          },
        );
      } else {
        await this.transactionService.updateStatus(
          data.transactionId,
          TransactionStatus.FAILED,
          { gatewayResponse: result.rawResponse },
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to capture payment for ${data.transactionId}: ${error.message}`,
      );
      throw error;
    }
  }

  private async handleReversePayment(data: {
    transactionId: string;
    gatewayReference?: string;
  }) {
    this.logger.log(`Reversing payment for ${data.transactionId}`);

    const transaction = await this.db.transaction.findUnique({
      where: { id: data.transactionId },
    });

    if (!transaction) {
      this.logger.error(
        `Transaction ${data.transactionId} not found for reversal`,
      );
      return;
    }

    if (!transaction.gatewayReference) {
      this.logger.error(
        `Missing gatewayReference for reversal ${data.transactionId}`,
      );
      return;
    }

    try {
      let result;
      if (transaction.status === TransactionStatus.AUTHORIZED) {
        result = await this.stripeService.cancelPaymentIntent(
          transaction.gatewayReference,
        );
      } else {
        result = await this.stripeService.refundTransaction(
          transaction.gatewayReference,
        );
      }

      if (result.success) {
        await this.transactionService.updateStatus(
          data.transactionId,
          TransactionStatus.REVERSED,
          { gatewayResponse: result.rawResponse },
        );
      } else {
        await this.transactionService.updateStatus(
          data.transactionId,
          TransactionStatus.FAILED,
          { gatewayResponse: result.rawResponse },
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to reverse payment for ${data.transactionId}: ${error.message}`,
      );
      throw error;
    }
  }
}
