import {
  Controller,
  Post,
  Body,
  Headers,
  UseInterceptors,
  Get,
  Query,
  Param,
  Logger,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiHeader,
  ApiQuery,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { InitiateCryptoPaymentDto } from './dto/crypto-payment.dto';
import { NowPaymentsService } from './nowpayments.service';
import { TransactionService } from '../transaction/transaction.service';
import { DatabaseService } from '../../database/database.service';
import { IdempotencyInterceptor } from '../transaction/interceptors/idempotency.interceptor';
import { TransactionType, TransactionStatus } from '@prisma/client';
import { Merchant } from '../auth/decorators/merchant.decorator';
import { TransactionPinGuard } from '../auth/guards/transaction-pin.guard';

@ApiTags('Crypto Payments')
@Controller('crypto-payments')
export class CryptoController {
  private readonly logger = new Logger(CryptoController.name);

  constructor(
    private readonly nowPaymentsService: NowPaymentsService,
    private readonly transactionService: TransactionService,
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
  ) {}

  @Post('initiate')
  @UseGuards(TransactionPinGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({
    name: 'X-Transaction-PIN',
    required: true,
    description: '6-digit transaction PIN for authentication',
    example: '123456',
  })
  @ApiOperation({
    summary: 'Initiate a crypto payment',
    description: `
Creates a crypto payment via NOWPayments and returns payment details including:
- **payAddress**: The cryptocurrency wallet address to send funds to
- **payAmount**: The exact crypto amount to send
- **payCurrency**: The cryptocurrency selected (e.g., 'btc', 'eth', 'usdt')

Requires transaction PIN for security.

## Transaction PIN (Required)

A 6-digit transaction PIN must be provided to authorize crypto payments. The PIN is set by the merchant admin.

\`\`\`typescript
// Example request body
{
  "amount": 50,
  "currency": "USD",
  "payCurrency": "btc",
  "title": "Order #123",
  "transactionPin": "123456" // Required 6-digit PIN
}
\`\`\`

## QR Code Generation

To generate a QR code for the user to scan, use the payment URI format:

**Bitcoin (BTC):**
\`\`\`
bitcoin:{payAddress}?amount={payAmount}
Example: bitcoin:3NA5Pq846s8YbkY4hvbjgejkXnoCHdsv1q?amount=0.00071314
\`\`\`

**Ethereum (ETH):**
\`\`\`
ethereum:{payAddress}?amount={payAmount}
Example: ethereum:0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb?amount=0.0145
\`\`\`

**Litecoin (LTC):**
\`\`\`
litecoin:{payAddress}?amount={payAmount}
\`\`\`

**Dogecoin (DOGE):**
\`\`\`
dogecoin:{payAddress}?amount={payAmount}
\`\`\`

**USDT (ERC20):**
\`\`\`
ethereum:{payAddress}?amount={payAmount}&contractaddress=0xdac17f958d2ee523a2206206994597c13d831ec7
\`\`\`

## Frontend QR Code Example (React)
\`\`\`typescript
import QRCode from 'react-qr-code';

function generatePaymentURI(currency: string, address: string, amount: number) {
  const uriSchemes: Record<string, string> = {
    btc: 'bitcoin',
    eth: 'ethereum',
    ltc: 'litecoin',
    doge: 'dogecoin',
    usdt: 'ethereum', // ERC20
  };
  
  const scheme = uriSchemes[currency.toLowerCase()] || currency.toLowerCase();
  
  if (currency.toLowerCase() === 'usdt') {
    return scheme + ':' + address + '?amount=' + amount + '&contractaddress=0xdac17f958d2ee523a2206206994597c13d831ec7';
  }
  
  return scheme + ':' + address + '?amount=' + amount;
}

// Usage
const qrData = generatePaymentURI(payCurrency, payAddress, payAmount);
<QRCode value={qrData} size={256} />
\`\`\`

## Payment Status Tracking

After initiation, track payment status via:
1. **Polling**: GET /api/v1/transactions/{transactionId}
2. **WebSocket**: Listen to 'transaction.settled' event on /pos namespace

Status flow: INITIATED -> AUTHORIZED -> CONFIRMING -> SETTLED
    `,
  })
  @ApiResponse({
    status: 201,
    description: 'Crypto payment initiated successfully',
    schema: {
      example: {
        message: 'Crypto payment initiated',
        transactionId: '688b0c28-6258-487c-9de5-756b2ee8faf0',
        payAddress: '3NA5Pq846s8YbkY4hvbjgejkXnoCHdsv1q',
        invoiceUrl: 'https://nowpayments.io/payment/?iid=abc123',
        nowpaymentsPaymentId: '5820129390',
        payCurrency: 'btc',
        payAmount: 0.00071314,
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Optional idempotency key to prevent duplicate payments' })
  async initiateCryptoPayment(
    @Body() dto: InitiateCryptoPaymentDto,
    @Merchant('id') merchantId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    // 1. Create a core transaction record of type CRYPTO
    const transaction = await this.transactionService.initiate(
      {
        merchantId,
        type: TransactionType.CRYPTO,
        amount: dto.amount,
        currency: dto.currency,
        transactionPin: dto.transactionPin, // Pass the PIN for verification
      },
      idempotencyKey,
    );

    // Check if blockchainTx already exists for this transaction (idempotency)
    const existingCryptoTx = await this.db.blockchainTransaction.findUnique({
      where: { transactionId: transaction.id },
    });

    if (existingCryptoTx) {
      return {
        message: 'Crypto payment already initiated',
        transactionId: transaction.id,
        payAddress: existingCryptoTx.paymentUrl,
        invoiceUrl: existingCryptoTx.invoiceUrl,
        nowpaymentsPaymentId: existingCryptoTx.nowpaymentsPaymentId,
        status: existingCryptoTx.status,
      };
    }

    // 2. Contact NowPayments to create the actual crypto payment
    const callbackUrl = this.configService.get<string>('nowpayments.ipnCallbackUrl') ||
      `${this.configService.get<string>('frontend.url')}/api/v1/webhooks/nowpayments`;

    const nowPayment = await this.nowPaymentsService.createPayment({
      orderId: transaction.id,
      priceAmount: dto.amount,
      priceCurrency: dto.currency,
      payCurrency: dto.payCurrency || 'btc',
      orderDescription: dto.title || `Order ${transaction.id}`,
      ipnCallbackUrl: callbackUrl,
    });

    // 3. Save the BlockchainTransaction details
    await this.db.blockchainTransaction.create({
      data: {
        transactionId: transaction.id,
        nowpaymentsPaymentId: nowPayment.payment_id,
        invoiceUrl: nowPayment.invoice_url ?? null,
        payAmount: nowPayment.pay_amount ?? null,
        payCurrency: nowPayment.pay_currency,
        receiveAmount: nowPayment.price_amount,
        receiveCurrency: nowPayment.price_currency,
        paymentUrl: nowPayment.pay_address,
      },
    });

    // Update main transaction status to AUTHORIZED (awaiting confirmation via IPN)
    await this.transactionService.updateStatus(
      transaction.id,
      TransactionStatus.AUTHORIZED,
      { gatewayReference: nowPayment.payment_id },
    );

    // 4. Return the payment address to the frontend/POS terminal
    return {
      message: 'Crypto payment initiated',
      transactionId: transaction.id,
      payAddress: nowPayment.pay_address,
      invoiceUrl: nowPayment.invoice_url,
      nowpaymentsPaymentId: nowPayment.payment_id,
      payCurrency: nowPayment.pay_currency,
      payAmount: nowPayment.pay_amount,
    };
  }

  @Get('currencies')
  @ApiOperation({
    summary: 'Get available cryptocurrencies',
    description: 'Returns a list of all supported cryptocurrencies for payment including BTC, ETH, USDT, LTC, DOGE, XRP, SOL, BNB, ADA, DOT, MATIC, TRX and 100+ more. Supports search by ticker or name.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of available cryptocurrencies',
    schema: {
      example: {
        currencies: [
          { ticker: 'btc', name: 'Bitcoin', network: 'bitcoin' },
          { ticker: 'eth', name: 'Ethereum', network: 'ethereum' },
          { ticker: 'usdt', name: 'Tether USD', network: 'ethereum' },
        ],
      },
    },
  })
  @ApiQuery({ name: 'search', required: false, description: 'Filter by currency ticker or name (e.g., "btc", "eth", "usdt")' })
  async getAvailableCurrencies(@Query('search') search?: string) {
    const result = await this.nowPaymentsService.getAvailableCurrencies();
    // NowPayments returns an array of strings (tickers), not objects
    let currencies = Array.isArray(result) ? result : result?.currencies || [];

    // Fallback to hardcoded list if NowPayments API is unavailable
    if (currencies.length === 0) {
      currencies = [
        'btc', 'eth', 'usdt', 'usdc', 'ltc', 'xrp', 'bch', 'doge', 
        'ada', 'dot', 'sol', 'matic', 'bnb', 'trx', 'dai', 'xlm', 
        'xmr', 'etc', 'dash', 'zec'
      ];
    }

    if (search && currencies.length > 0) {
      const searchLower = search.toLowerCase();
      // Filter array of strings
      const filtered = currencies.filter((c: string) => 
        c.toLowerCase().includes(searchLower)
      );
      return { currencies: filtered };
    }

    // Convert to array of objects for consistent response format
    const formattedCurrencies = currencies.map((ticker: string) => ({ ticker }));
    return { currencies: formattedCurrencies };
  }

  @Get('estimate')
  @ApiOperation({
    summary: 'Get estimated crypto amount',
    description: 'Calculates the cryptocurrency amount for a given fiat amount. Use this endpoint to show users how much crypto they need to pay before initiating the payment.',
  })
  @ApiQuery({ name: 'amount', example: 50, description: 'Fiat amount to convert' })
  @ApiQuery({ name: 'currency_from', example: 'USD', description: 'Fiat currency code (USD, EUR, GBP, etc.)' })
  @ApiQuery({ name: 'currency_to', example: 'btc', description: 'Cryptocurrency ticker (btc, eth, usdt, etc.)' })
  @ApiResponse({
    status: 200,
    description: 'Estimated crypto amount',
    schema: {
      example: {
        estimated_price: 0.00071314,
        currency_from: 'USD',
        currency_to: 'btc',
      },
    },
  })
  async getEstimatedPrice(
    @Query('amount') amount: number,
    @Query('currency_from') currencyFrom: string,
    @Query('currency_to') currencyTo: string,
  ) {
    const estimate = await this.nowPaymentsService.getEstimatedPrice(
      amount,
      currencyFrom,
      currencyTo,
    );
    return estimate;
  }

  @Get('status/:transactionId')
  @ApiOperation({
    summary: 'Get crypto payment status',
    description: `
Check the status of a crypto payment.

## Status Flow

\`\`\`
INITIATED -> AUTHORIZED -> CONFIRMING -> SETTLED
                 |
           FAILED/EXPIRED/CANCELLED
\`\`\`

## Status Meanings

| Status | Description |
|--------|-------------|
| INITIATED | Payment created, waiting for user to send crypto |
| AUTHORIZED | Payment initiated with NOWPayments |
| CONFIRMING | Payment detected, waiting for blockchain confirmations |
| SETTLED | Payment confirmed and completed |
| FAILED | Payment failed (insufficient amount, etc.) |
| EXPIRED | Payment window expired (typically 15-30 min) |
| CANCELLED | Payment was cancelled |

## Polling Example

\`\`\`typescript
// Poll every 3 seconds until terminal status
async function checkPaymentStatus(transactionId: string) {
  const response = await fetch(
    '/api/v1/transactions/' + transactionId,
    { headers: { Authorization: 'Bearer ' + token } }
  );
  const data = await response.json();

  if (data.status === 'SETTLED') {
    showSuccess('Payment confirmed!');
  } else if (['FAILED', 'EXPIRED', 'CANCELLED'].includes(data.status)) {
    showError('Payment failed');
  } else {
    // Continue polling
    setTimeout(() => checkPaymentStatus(transactionId), 3000);
  }
}
\`\`\`

## WebSocket Example (Real-time)

\`\`\`typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000/pos', { auth: { token } });

socket.on('transaction.settled', (data) => {
  if (data.transactionId === transactionId) {
    showSuccess('Payment confirmed!');
  }
});

socket.on('transaction.authorized', (data) => {
  if (data.transactionId === transactionId) {
    updateStatus('AUTHORIZED');
  }
});
\`\`\`
    `,
  })
  @ApiParam({ name: 'transactionId', description: 'Transaction ID from initiate response' })
  @ApiResponse({
    status: 200,
    description: 'Payment status details',
    schema: {
      example: {
        id: '688b0c28-6258-487c-9de5-756b2ee8faf0',
        status: 'SETTLED',
        amount: 50,
        currency: 'USD',
        type: 'CRYPTO',
        blockchainTx: {
          nowpaymentsPaymentId: '5820129390',
          status: 'PAID',
          payAmount: 0.00071314,
          payCurrency: 'btc',
          paymentUrl: '3NA5Pq846s8YbkY4hvbjgejkXnoCHdsv1q',
        },
      },
    },
  })
  async getCryptoPaymentStatus(@Param('transactionId') transactionId: string) {
    return this.transactionService.findById(transactionId);
  }

  @Get('balance')
  @UseGuards(TransactionPinGuard)
  @ApiHeader({
    name: 'X-Transaction-PIN',
    required: true,
    description: '6-digit transaction PIN for authentication',
    example: '123456',
  })
  @ApiOperation({
    summary: 'Get NOWPayments account balance',
    description: 'Retrieve your NOWPayments wallet balance for all cryptocurrencies. Returns balances array with currency, amount, and USD value for each supported crypto.',
  })
  @ApiResponse({
    status: 200,
    description: 'Account balance for all cryptocurrencies',
    schema: {
      example: {
        balances: [
          { currency: 'btc', amount: '0.00125000', amountInUsd: '52.50' },
          { currency: 'eth', amount: '0.05000000', amountInUsd: '125.00' },
        ],
        totalBalanceInUsd: '177.50',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid or missing transaction PIN' })
  @ApiResponse({ status: 403, description: 'Account locked due to too many failed PIN attempts' })
  @ApiResponse({ status: 503, description: 'NOWPayments service unavailable' })
  async getBalance() {
    const result = await this.nowPaymentsService.getBalance();
    
    // If NowPayments returned an error, show it
    if (result?._failed) {
      return {
        error: 'NOWPayments service unavailable',
        message: result.error || 'Unable to fetch balance from NOWPayments',
        statusCode: 503,
      };
    }
    
    return { balances: result };
  }

  @Get('transactions')
  @UseGuards(TransactionPinGuard)
  @ApiHeader({
    name: 'X-Transaction-PIN',
    required: true,
    description: '6-digit transaction PIN for authentication',
    example: '123456',
  })
  @ApiOperation({
    summary: 'Get NOWPayments transaction history',
    description: 'Retrieve transaction history from NOWPayments with pagination and filters. Supports filtering by date range, sorting by date/amount/status, and pagination.',
  })
  @ApiQuery({ name: 'limit', required: false, example: 50, description: 'Number of transactions per page (max: 100)' })
  @ApiQuery({ name: 'page', required: false, example: 1, description: 'Page number' })
  @ApiQuery({ name: 'sortBy', required: false, example: 'date', description: 'Sort field: date, amount, status' })
  @ApiQuery({ name: 'orderBy', required: false, example: 'desc', description: 'Sort order: asc, desc' })
  @ApiQuery({ name: 'dateFrom', required: false, example: '2026-01-01', description: 'Filter from date (ISO format)' })
  @ApiQuery({ name: 'dateTo', required: false, example: '2026-12-31', description: 'Filter to date (ISO format)' })
  @ApiResponse({
    status: 200,
    description: 'Transaction history with pagination',
    schema: {
      example: {
        data: [
          {
            payment_id: '5820129390',
            order_id: '688b0c28-6258-487c-9de5-756b2ee8faf0',
            payment_status: 'finished',
            pay_amount: 0.00071314,
            pay_currency: 'btc',
            price_amount: 50,
            price_currency: 'USD',
            created_at: '2026-03-12T17:07:32.000Z',
          },
        ],
        page: 1,
        limit: 50,
        total: 150,
        totalPages: 8,
      },
    },
  })
  @ApiResponse({ status: 503, description: 'NOWPayments service unavailable' })
  async getTransactions(
    @Query('limit') limit?: number,
    @Query('page') page?: number,
    @Query('sortBy') sortBy?: string,
    @Query('orderBy') orderBy?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const result = await this.nowPaymentsService.getTransactions({
      limit: limit || 50,
      page: page || 1,
      sortBy,
      orderBy,
      dateFrom,
      dateTo,
    });
    
    // If NowPayments returned an error, show it
    if (result?._failed) {
      return {
        error: 'NOWPayments service unavailable',
        message: result.error || 'Unable to fetch transactions from NOWPayments',
        statusCode: 503,
        data: [],
        page: page || 1,
        limit: limit || 50,
        total: 0,
        totalPages: 0,
      };
    }
    
    return result;
  }
}
