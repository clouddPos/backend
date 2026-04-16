import {
  Controller,
  Post,
  Body,
  Param,
  Get,
  Query,
  Headers,
  UseFilters,
  UseInterceptors,
  HttpException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiHeader,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { TransactionService } from './transaction.service';
import { CardNotPresentDto } from './dto/card-not-present.dto';
import { IdempotencyInterceptor } from './interceptors/idempotency.interceptor';
import { Merchant } from '../auth/decorators/merchant.decorator';
import { TransactionType, TransactionStatus } from '@prisma/client';
import { StripeService } from '../payment/stripe.service';
import { SocketGateway } from '../notification/socket.gateway';

/**
 * Error filter for CNP transactions
 */
const CnpErrorFilter = UseFilters({
  catch: async (exception: any, host: any) => {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      response.status(status).json({
        statusCode: status,
        message:
          typeof exceptionResponse === 'string'
            ? exceptionResponse
            : (exceptionResponse as any).message,
        error: (exceptionResponse as any)?.error || exception.name,
        details: (exceptionResponse as any)?.details || null,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Card-not-present transaction failed',
      error: 'Internal Server Error',
      details: exception?.message || null,
      timestamp: new Date().toISOString(),
    });
  },
});

@ApiTags('Card-Not-Present Payments')
@Controller('cnp-payments')
export class CnpPaymentController {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly stripeService: StripeService,
    private readonly socketGateway: SocketGateway,
  ) {}

  @Post()
  @CnpErrorFilter
  @UseInterceptors(IdempotencyInterceptor)
  @ApiBody({
    type: CardNotPresentDto,
    examples: {
      payment_method_token: {
        summary: 'PaymentMethod Token (Recommended)',
        value: {
          amount: 50.0,
          currency: 'USD',
          paymentMethodToken: 'pm_1abc123xyz', // From Stripe.js
          transactionPin: '123456',
          cardholderName: 'John Doe',
          // orderDescription: 'Order #12345',
        },
      },
      raw_card_visa: {
        summary: 'Raw Card Details - Visa (Requires API Access)',
        value: {
          amount: 50.0,
          currency: 'USD',
          cardNumber: '4242424242424242',
          expiryDate: '12/25',
          cvv: '123',
          transactionPin: '123456',
          cardholderName: 'John Doe',
          // orderDescription: 'Order #12345',
        },
      },
      raw_card_mastercard: {
        summary: 'Raw Card Details - Mastercard (Requires API Access)',
        value: {
          amount: 75.5,
          currency: 'USD',
          cardNumber: '5555555555554444',
          expiryDate: '12/26',
          cvv: '999',
          transactionPin: '123456',
          // orderDescription: 'Order #67890',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Process a card-not-present payment',
    description: `
Process an e-commerce, mail order, or phone order payment using raw card details.

**Flow:**
1. Validate card details (number, expiry, CVV)
2. Validate merchant PIN
3. Check for duplicates (5 min window)
4. Create transaction record (INITIATED)
5. Send card to Stripe for processing
6. Receive authorization code from bank
7. Mark transaction as SETTLED
8. Return authorization code to frontend

**Security:**
- Card details are sent directly to Stripe (PCI compliant)
- Raw card numbers are NEVER stored in database
- Authorization code returned for your records
`,
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Prevent duplicate requests (UUID recommended)',
  })
  @ApiResponse({
    status: 201,
    description: 'Payment processed successfully',
    schema: {
      example: {
        id: 'txn_abc123',
        merchantId: 'merchant_xyz',
        type: 'ONLINE',
        amount: 50.0,
        currency: 'USD',
        status: 'SETTLED',
        gatewayReference: 'pi_3abc123',
        authorizationCode: 'H12345',
        last4: '4242',
        cardScheme: 'VISA',
        createdAt: '2026-03-13T00:00:00.000Z',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
    schema: {
      examples: {
        invalid_card: {
          summary: 'Invalid Card Number',
          value: {
            statusCode: 400,
            message: 'cardNumber must be a valid card number (13-19 digits)',
            error: 'Bad Request',
          },
        },
        invalid_cvv: {
          summary: 'Invalid CVV',
          value: {
            statusCode: 400,
            message: 'cvv must be 3-4 digits',
            error: 'Bad Request',
          },
        },
        card_declined: {
          summary: 'Card Declined',
          value: {
            statusCode: 400,
            message: 'Card was declined: insufficient_funds',
            error: 'Bad Request',
            details: {
              code: 'card_declined',
              declineCode: 'insufficient_funds',
            },
          },
        },
        duplicate_transaction: {
          summary: 'Duplicate Transaction',
          value: {
            statusCode: 400,
            message:
              'Duplicate transaction detected: A transaction for 50 USD was already initiated within the last 5 minutes.',
            error: 'Bad Request',
            details: 'Transaction IDs: txn_abc, txn_def',
          },
        },
        invalid_pin: {
          summary: 'Invalid PIN',
          value: {
            statusCode: 400,
            message: 'Invalid transaction PIN',
            error: 'Bad Request',
          },
        },
        amount_too_low: {
          summary: 'Amount Below Minimum',
          value: {
            statusCode: 400,
            message: 'Amount must be at least 0.5 USD (Stripe minimum)',
            error: 'Bad Request',
          },
        },
      },
    },
  })
  async processPayment(
    @Body() dto: CardNotPresentDto,
    @Merchant('id') merchantId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    // Validate DTO (either token or card details)
    dto.validate();

    // Parse expiry date if provided (MM/YY)
    let expiryMonth: string | undefined;
    let expiryYear: string | undefined;
    if (dto.expiryDate) {
      const [month, year] = dto.expiryDate.split('/');
      expiryMonth = month;
      expiryYear = `20${year}`;
    }

    // Verify transaction PIN first
    await this.transactionService['verifyMerchantPin'](
      merchantId,
      dto.transactionPin,
    );

    // Generate idempotency key if not provided
    const key =
      idempotencyKey ||
      `cnp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create transaction record directly (don't use transactionService.initiate to avoid queuing)
    const transaction = await this.transactionService['db'].transaction.create({
      data: {
        idempotencyKey: key,
        merchantId: merchantId,
        type: TransactionType.ONLINE,
        amount: dto.amount,
        currency: dto.currency.toUpperCase(),
        status: TransactionStatus.INITIATED,
      },
    });

    console.log(`CNP Transaction created: ${transaction.id}`);

    // Send to Stripe for processing IMMEDIATELY (no queue)
    const stripeResult = await this.stripeService.chargeCard({
      transactionId: transaction.id,
      type: TransactionType.ONLINE,
      amount: dto.amount,
      currency: dto.currency,
      paymentMethodId: dto.paymentMethodToken, // Use token if provided
      cardNumber: dto.cardNumber, // Or raw card details
      expiryMonth,
      expiryYear,
      cvv: dto.cvv,
    });

    if (!stripeResult.success) {
      // Mark transaction as FAILED
      await this.transactionService.updateStatus(
        transaction.id,
        TransactionStatus.FAILED,
        {
          gatewayResponse: stripeResult.rawResponse,
          errorMessage: stripeResult.errorMessage,
        },
      );

      // Emit WebSocket event for payment failure
      this.socketGateway.notifyPaymentFailed(merchantId, {
        transactionId: transaction.id,
        errorCode: stripeResult.errorDetails?.code || 'payment_failed',
        errorMessage: stripeResult.errorMessage || 'Payment failed',
        declineCode: stripeResult.errorDetails?.declineCode || null,
        amount: Number(dto.amount),
        currency: dto.currency,
      });

      throw new BadRequestException({
        message: stripeResult.errorMessage || 'Payment failed',
        details: stripeResult.errorDetails,
      });
    }

    // Update transaction with Stripe details - use advanceStatus to handle state transitions
    const updatedTransaction = await this.transactionService.advanceStatus(
      transaction.id,
      TransactionStatus.SETTLED,
      {
        gatewayReference: stripeResult.gatewayReference,
        gatewayResponse: stripeResult.rawResponse,
        authorizationCode: stripeResult.authorizationCode,
      },
    );

    // Extract card details from Stripe response for frontend
    const charge = stripeResult.rawResponse?.charges?.data?.[0];
    const paymentMethodDetails = charge?.payment_method_details;

    const responseData = {
      id: updatedTransaction.id,
      merchantId: updatedTransaction.merchantId,
      type: updatedTransaction.type,
      amount: updatedTransaction.amount,
      currency: updatedTransaction.currency,
      status: updatedTransaction.status,
      gatewayReference: updatedTransaction.gatewayReference,
      authorizationCode: updatedTransaction.authorizationCode,
      last4:
        paymentMethodDetails?.card?.last4 ||
        dto.cardNumber?.slice(-4) ||
        '****',
      cardScheme: paymentMethodDetails?.card?.brand?.toUpperCase() || 'UNKNOWN',
      createdAt: updatedTransaction.createdAt,
    };

    // Emit WebSocket event for successful payment
    this.socketGateway.notifyPaymentSettled(merchantId, {
      transactionId: updatedTransaction.id,
      authorizationCode: updatedTransaction.authorizationCode || null,
      amount: Number(updatedTransaction.amount),
      currency: updatedTransaction.currency,
      last4: responseData.last4,
      cardScheme: responseData.cardScheme,
      settledAt: updatedTransaction.createdAt.toISOString(),
      gatewayReference: updatedTransaction.gatewayReference || null,
    });

    return responseData;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get CNP transaction details' })
  @ApiResponse({ status: 200, description: 'Transaction details' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async getTransaction(@Param('id') id: string) {
    const transaction = await this.transactionService.findById(id);

    // Return card details for frontend display
    return {
      id: transaction.id,
      merchantId: transaction.merchantId,
      type: transaction.type,
      amount: transaction.amount,
      currency: transaction.currency,
      status: transaction.status,
      gatewayReference: transaction.gatewayReference,
      authorizationCode: transaction.authorizationCode,
      last4: transaction.maskedCardNumber?.replace('*', '') || '****',
      cardScheme: transaction.cardScheme,
      expiryDate: transaction.expiryDate,
      createdAt: transaction.createdAt,
    };
  }
}
