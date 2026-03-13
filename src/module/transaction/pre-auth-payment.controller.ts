import {
  Controller,
  Post,
  Body,
  Param,
  Get,
  Headers,
  UseFilters,
  UseInterceptors,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiHeader,
  ApiResponse,
} from '@nestjs/swagger';
import { TransactionService } from './transaction.service';
import { PreAuthDto } from './dto/pre-auth.dto';
import { CaptureAuthDto } from './dto/capture-auth.dto';
import { IdempotencyInterceptor } from './interceptors/idempotency.interceptor';
import { Merchant } from '../auth/decorators/merchant.decorator';
import { TransactionType, TransactionStatus } from '@prisma/client';
import { TransactionPinGuard } from '../auth/guards/transaction-pin.guard';

/**
 * Error filter for pre-auth transactions
 */
const PreAuthErrorFilter = UseFilters({
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
      message: 'Pre-authorization failed',
      error: 'Internal Server Error',
      details: exception?.message || null,
      timestamp: new Date().toISOString(),
    });
  },
});

@ApiTags('Pre-Authorization Payments')
@Controller('pre-auth')
export class PreAuthPaymentController {
  constructor(private readonly transactionService: TransactionService) {}

  @Post()
  @PreAuthErrorFilter
  @UseGuards(TransactionPinGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({
    name: 'X-Transaction-PIN',
    required: true,
    description: '6-digit transaction PIN for authentication',
    example: '123456',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Prevent duplicate requests',
  })
  @ApiOperation({
    summary: 'Authorize funds (hold on card)',
    description: `
Place a hold on funds without capturing them.

**Use Cases:**
- Hotels (incidentals)
- Car rentals (deposit)
- Restaurants (tip adjustment later)

**Requirements:**
- Either PaymentMethod ID (online) OR authorization code (offline)
- 6-digit transaction PIN
- Amount meets currency minimum

**Flow:**
1. Validate PIN and payment method
2. Authorize funds (hold placed on card)
3. Return AUTHORIZED status
4. Capture later with /:id/capture endpoint
`,
  })
  @ApiResponse({
    status: 201,
    description: 'Funds authorized successfully',
    schema: {
      example: {
        id: 'txn_preauth123',
        merchantId: 'merchant_xyz',
        type: 'PRE_AUTH',
        amount: 100.0,
        currency: 'USD',
        status: 'AUTHORIZED',
        gatewayReference: 'pi_3abc123',
        authorizationCode: 'H12345',
        createdAt: '2026-03-13T00:00:00.000Z',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
  })
  async authorize(
    @Body() dto: PreAuthDto,
    @Merchant('id') merchantId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const transaction = await this.transactionService.initiate(
      {
        type: TransactionType.PRE_AUTH,
        amount: dto.amount,
        currency: dto.currency,
        paymentMethodId: dto.paymentMethodId,
        authorizationCode: dto.authorizationCode,
        transactionPin: dto.transactionPin,
      },
      idempotencyKey,
      merchantId,
    );

    return {
      id: transaction.id,
      merchantId: transaction.merchantId,
      type: transaction.type,
      amount: transaction.amount,
      currency: transaction.currency,
      status: transaction.status,
      gatewayReference: transaction.gatewayReference,
      authorizationCode: transaction.authorizationCode,
      createdAt: transaction.createdAt,
    };
  }

  @Post(':id/capture')
  @PreAuthErrorFilter
  @UseGuards(TransactionPinGuard)
  @ApiHeader({
    name: 'X-Transaction-PIN',
    required: true,
    description: '6-digit transaction PIN for authentication',
    example: '123456',
  })
  @ApiOperation({
    summary: 'Capture authorized funds',
    description: `
Capture funds from a previously authorized transaction.

**Note:** Can capture less than the authorized amount (e.g., final bill after tip).

Requires transaction PIN for security.
`,
  })
  @ApiResponse({
    status: 200,
    description: 'Funds captured successfully',
    schema: {
      example: {
        id: 'txn_preauth123',
        merchantId: 'merchant_xyz',
        type: 'PRE_AUTH',
        amount: 85.0,
        currency: 'USD',
        status: 'SETTLED',
        authorizationCode: 'H12345',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot capture - transaction not in AUTHORIZED status',
  })
  async capture(
    @Param('id') id: string,
    @Body() dto: CaptureAuthDto,
  ) {
    // Update transaction amount if different
    if (dto.amount) {
      await this.transactionService['db'].transaction.update({
        where: { id },
        data: { amount: dto.amount, currency: dto.currency },
      });
    }

    return this.transactionService.capture(id);
  }

  @Post(':id/release')
  @PreAuthErrorFilter
  @UseGuards(TransactionPinGuard)
  @ApiHeader({
    name: 'X-Transaction-PIN',
    required: true,
    description: '6-digit transaction PIN for authentication',
    example: '123456',
  })
  @ApiOperation({
    summary: 'Release authorized funds (void)',
    description: `
Release the hold on funds without capturing.

**Use Cases:**
- Customer cancelled
- Check-out without incidentals used

Requires transaction PIN for security.
`,
  })
  @ApiResponse({
    status: 200,
    description: 'Authorization released successfully',
  })
  async release(@Param('id') id: string) {
    return this.transactionService.reverse(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get pre-auth transaction details' })
  @ApiResponse({ status: 200, description: 'Transaction details' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async getTransaction(@Param('id') id: string) {
    return this.transactionService.findById(id);
  }
}
