import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PayoutStatus, TransactionStatus } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { NowPaymentsService } from './nowpayments.service';
import { OtpService } from './otp.service';
import { ConvertToCryptoDto } from './dto/convert-to-crypto.dto';

@Injectable()
export class CryptoConversionService {
  private readonly logger = new Logger(CryptoConversionService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly nowPaymentsService: NowPaymentsService,
    private readonly otpService: OtpService,
    private readonly configService: ConfigService,
  ) {}

  async convertTransactionToCrypto(
    merchantId: string,
    dto: ConvertToCryptoDto,
  ) {
    const transaction = await this.db.transaction.findFirst({
      where: {
        id: dto.transactionId,
        merchantId,
      },
      include: {
        merchant: {
          select: {
            id: true,
            businessName: true,
            email: true,
          },
        },
      },
    });

    if (!transaction) {
      throw new NotFoundException(
        `Transaction ${dto.transactionId} not found for this merchant`,
      );
    }

    if (
      transaction.status !== TransactionStatus.CAPTURED &&
      transaction.status !== TransactionStatus.SETTLED
    ) {
      throw new BadRequestException(
        `Only CAPTURED or SETTLED transactions can be converted to crypto. Current status: ${transaction.status}`,
      );
    }

    if (transaction.payoutStatus) {
      throw new ConflictException(
        `Crypto conversion already exists for transaction ${transaction.id} with status ${transaction.payoutStatus}`,
      );
    }

    const targetCurrency = dto.currency.trim().toLowerCase();
    const sourceAmount = dto.amount ?? Number(transaction.amount);

    if (sourceAmount <= 0) {
      throw new BadRequestException(
        'Conversion amount must be greater than zero',
      );
    }

    const estimate = await this.nowPaymentsService.getEstimatedPrice(
      sourceAmount,
      transaction.currency,
      targetCurrency,
    );

    if (!estimate) {
      throw new ServiceUnavailableException(
        'Unable to estimate crypto amount from NowPayments',
      );
    }

    const estimatedAmount =
      Number(
        estimate.estimated_amount ??
          estimate.estimated_price ??
          estimate.amount_to ??
          estimate.pay_amount ??
          estimate.price_amount ??
          sourceAmount,
      ) || sourceAmount;

    const acquisition = await this.db.transaction.updateMany({
      where: {
        id: transaction.id,
        merchantId,
        payoutStatus: null,
      },
      data: {
        payoutStatus: PayoutStatus.PROCESSING,
        payoutAddress: dto.walletAddress,
        payoutCurrency: targetCurrency,
        payoutAmount: estimatedAmount,
      },
    });

    if (acquisition.count === 0) {
      throw new ConflictException(
        `Crypto conversion already in progress or completed for transaction ${transaction.id}`,
      );
    }

    const payout2faSecret = this.configService.get<string>(
      'nowpayments.payout2faSecret',
    );

    if (!this.otpService.isValidSecret(payout2faSecret || '')) {
      await this.db.transaction.update({
        where: { id: transaction.id },
        data: { payoutStatus: PayoutStatus.FAILED },
      });
      throw new ServiceUnavailableException(
        'NOWPayments payout 2FA secret is not configured',
      );
    }

    try {
      const payout = await this.nowPaymentsService.createPayout(
        dto.walletAddress,
        estimatedAmount,
        targetCurrency,
      );

      const payoutId =
        payout?.id ?? payout?.payout_id ?? payout?.payoutId ?? null;
      const payoutStatus =
        payout?.status ??
        payout?.payout_status ??
        payout?.payment_status ??
        null;

      const verificationCode = await this.otpService.generateTotp(
        payout2faSecret!,
      );
      let verifiedPayout = payout;

      if (payoutId) {
        await this.db.transaction.update({
          where: { id: transaction.id },
          data: {
            payoutId: String(payoutId),
            payoutStatus: PayoutStatus.PROCESSING,
          },
        });
      }

      if (payoutId) {
        verifiedPayout = await this.nowPaymentsService.verifyPayout(
          String(payoutId),
          verificationCode,
        );
      }

      await this.db.transaction.update({
        where: { id: transaction.id },
        data: {
          payoutId: payoutId ? String(payoutId) : transaction.payoutId,
          payoutStatus: PayoutStatus.COMPLETED,
          payoutTxHash:
            verifiedPayout?.tx_hash ??
            verifiedPayout?.txHash ??
            verifiedPayout?.hash ??
            transaction.payoutTxHash,
        },
      });

      this.logger.log(
        `Crypto conversion completed for transaction ${transaction.id}: ${estimatedAmount} ${targetCurrency} to ${dto.walletAddress}`,
      );

      return {
        transactionId: transaction.id,
        sourceAmount,
        sourceCurrency: transaction.currency,
        targetCurrency,
        estimatedAmount,
        payoutId: payoutId ? String(payoutId) : null,
        payoutStatus: payoutStatus ?? 'processing',
        walletAddress: dto.walletAddress,
        conversionStatus: 'COMPLETED',
      };
    } catch (error: any) {
      await this.db.transaction.update({
        where: { id: transaction.id },
        data: { payoutStatus: PayoutStatus.FAILED },
      });

      this.logger.error(
        `Crypto conversion failed for transaction ${transaction.id}: ${error.message}`,
      );
      throw error;
    }
  }
}
