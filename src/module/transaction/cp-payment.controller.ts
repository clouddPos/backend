import {
  Controller,
  Post,
  Body,
  Param,
  Get,
  UseFilters,
  UseInterceptors,
  HttpException,
  HttpStatus,
  BadRequestException,
  Headers,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiBody,
} from '@nestjs/swagger';
import { TransactionService } from './transaction.service';
import { CardPresentDto } from './dto/card-present.dto';
import { IdempotencyInterceptor } from './interceptors/idempotency.interceptor';
import { Merchant } from '../auth/decorators/merchant.decorator';
import { TransactionType, TransactionStatus } from '@prisma/client';
import { StripeService } from '../payment/stripe.service';
import { SocketGateway } from '../notification/socket.gateway';

/**
 * Error filter for CP transactions
 */
const CpErrorFilter = UseFilters({
  catch: async (exception: any, host: any) => {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      
      response.status(status).json({
        statusCode: status,
        message: typeof exceptionResponse === 'string' ? exceptionResponse : (exceptionResponse as any).message,
        error: (exceptionResponse as any)?.error || exception.name,
        details: (exceptionResponse as any)?.details || null,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Card-present transaction failed',
      error: 'Internal Server Error',
      details: exception?.message || null,
      timestamp: new Date().toISOString(),
    });
  },
});

@ApiTags('Card-Present Payments')
@Controller('cp-payments')
export class CpPaymentController {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly stripeService: StripeService,
    private readonly socketGateway: SocketGateway,
  ) {}

  @Post()
  @CpErrorFilter
  @UseInterceptors(IdempotencyInterceptor)
  @ApiBody({
    type: CardPresentDto,
    examples: {
      modern_reader: {
        summary: 'Modern Card Reader (Stripe Terminal)',
        value: {
          amount: 50.00,
          currency: 'USD',
          paymentMethodToken: 'pm_1abc123xyz',
          last4: '4242',
          // orderDescription: 'Order #12345',
        },
      },
      legacy_terminal: {
        summary: 'Legacy Terminal (Auth Code Only)',
        value: {
          amount: 75.50,
          currency: 'USD',
          authorizationCode: '789012',
          last4: '1234',
          // orderDescription: 'Table #5',
        },
      },
    },
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Prevent duplicate requests (UUID recommended)',
  })
  @ApiOperation({
    summary: 'Process a card-present payment',
    description: `
Process a physical POS terminal transaction.

**Supports TWO modes:**

1. **Modern Card Reader** (Stripe Terminal, Square):
   - Provide paymentMethodToken from reader
   - Real-time charge via Stripe
   - Returns authorization code immediately

2. **Legacy Terminal** (Auth code only):
   - Provide authorizationCode from terminal display
   - Records transaction for bookkeeping
   - ⚠️ Assumes payment already processed by terminal

**Flow (Modern Reader):**
1. Customer taps/inserts card on reader
2. Reader provides payment method token
3. Send token to CloudPOS for processing
4. Stripe charges card in real-time
5. Bank returns authorization code
6. WebSocket event emitted to frontend
`,
  })
  @ApiResponse({
    status: 201,
    description: 'Payment processed successfully',
    schema: {
      example: {
        id: 'txn_cp123',
        merchantId: 'merchant_xyz',
        type: 'OFFLINE',
        amount: 50.0,
        currency: 'USD',
        status: 'SETTLED',
        authorizationCode: 'H12345',
        gatewayReference: 'pi_3abc123',
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
        missing_payment_method: {
          summary: 'Missing Payment Method',
          value: {
            statusCode: 400,
            message: 'Either paymentMethodToken or authorizationCode must be provided',
            error: 'Bad Request',
          },
        },
        invalid_token: {
          summary: 'Invalid Payment Method Token',
          value: {
            statusCode: 400,
            message: 'paymentMethodToken must be a valid Stripe payment method ID (e.g., pm_1abc...)',
            error: 'Bad Request',
          },
        },
        invalid_auth_code: {
          summary: 'Invalid Authorization Code',
          value: {
            statusCode: 400,
            message: 'authorizationCode must be exactly 6 digits',
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
    @Body() dto: CardPresentDto,
    @Merchant('id') merchantId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    // Validate DTO (either token or auth code)
    dto.validate();

    // Create transaction record first (INITIATED status)
    const transaction = await this.transactionService.initiate(
      {
        type: TransactionType.OFFLINE,
        amount: dto.amount,
        currency: dto.currency,
        authorizationCode: dto.authorizationCode, // Pass auth code for OFFLINE transactions
        maskedCardNumber: dto.last4 ? `****${dto.last4}` : undefined,
      },
      idempotencyKey,
      merchantId,
    );

    let responseData: any;

    // MODE 1: Modern card reader with payment method token
    if (dto.paymentMethodToken) {
      // Charge the card via Stripe
      const stripeResult = await this.stripeService.chargeCard({
        transactionId: transaction.id,
        type: TransactionType.OFFLINE,
        amount: dto.amount,
        currency: dto.currency,
        paymentMethodId: dto.paymentMethodToken,
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

      // Update transaction with Stripe details (SETTLED)
      const updatedTransaction = await this.transactionService.updateStatus(
        transaction.id,
        TransactionStatus.SETTLED,
        {
          gatewayReference: stripeResult.gatewayReference,
          gatewayResponse: stripeResult.rawResponse,
          authorizationCode: stripeResult.authorizationCode,
        },
      );

      // Extract card details from Stripe response
      const charge = stripeResult.rawResponse?.charges?.data?.[0];
      const paymentMethodDetails = charge?.payment_method_details;

      responseData = {
        id: updatedTransaction.id,
        merchantId: updatedTransaction.merchantId,
        type: updatedTransaction.type,
        amount: updatedTransaction.amount,
        currency: updatedTransaction.currency,
        status: updatedTransaction.status,
        gatewayReference: updatedTransaction.gatewayReference,
        authorizationCode: updatedTransaction.authorizationCode,
        last4: paymentMethodDetails?.card?.last4 || dto.last4 || '****',
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
    }
    // MODE 2: Legacy terminal with authorization code only
    else if (dto.authorizationCode) {
      // Validate auth code format (6 digits)
      if (!/^\d{6}$/.test(dto.authorizationCode)) {
        throw new BadRequestException({
          message: 'authorizationCode must be exactly 6 digits',
        });
      }

      // Update transaction with auth code - use advanceStatus to handle state transitions
      const updatedTransaction = await this.transactionService.advanceStatus(
        transaction.id,
        TransactionStatus.SETTLED,
        {
          gatewayReference: `OFFLINE_${dto.authorizationCode}_${transaction.id}`,
          authorizationCode: dto.authorizationCode,
        },
      );

      responseData = {
        id: updatedTransaction.id,
        merchantId: updatedTransaction.merchantId,
        type: updatedTransaction.type,
        amount: updatedTransaction.amount,
        currency: updatedTransaction.currency,
        status: updatedTransaction.status,
        authorizationCode: updatedTransaction.authorizationCode,
        gatewayReference: updatedTransaction.gatewayReference,
        last4: dto.last4 || '****',
        createdAt: updatedTransaction.createdAt,
      };

      // Emit WebSocket event for offline payment recorded
      this.socketGateway.notifyPaymentSettled(merchantId, {
        transactionId: updatedTransaction.id,
        authorizationCode: updatedTransaction.authorizationCode || null,
        amount: Number(updatedTransaction.amount),
        currency: updatedTransaction.currency,
        last4: responseData.last4,
        cardScheme: 'UNKNOWN',
        settledAt: updatedTransaction.createdAt.toISOString(),
        gatewayReference: updatedTransaction.gatewayReference || null,
      });
    }

    return responseData;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get CP transaction details' })
  @ApiResponse({ status: 200, description: 'Transaction details' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async getTransaction(@Param('id') id: string) {
    return this.transactionService.findById(id);
  }
}
