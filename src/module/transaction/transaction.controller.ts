import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  UseInterceptors,
  UseFilters,
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
import { InitiateTransactionDto, TransactionFilterDto } from './dto';
import { IdempotencyInterceptor } from './interceptors/idempotency.interceptor';
import { TransactionPinGuard } from '../auth/guards/transaction-pin.guard';

/**
 * Filter to catch and format transaction-related errors with helpful details
 */
@UseFilters({
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
    
    // Unknown error
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Transaction processing failed',
      error: 'Internal Server Error',
      details: exception?.message || null,
      timestamp: new Date().toISOString(),
    });
  },
})
@ApiTags('Transactions')
@Controller('transactions')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Initiate a new transaction' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiResponse({ 
    status: 201, 
    description: 'Transaction initiated successfully',
    schema: {
      example: {
        id: 'txn_123abc',
        merchantId: 'merchant_456',
        type: 'ONLINE',
        amount: 100.50,
        currency: 'USD',
        status: 'INITIATED',
        createdAt: '2026-03-13T00:00:00.000Z',
      },
    },
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Validation error (invalid amount, payment method, duplicate transaction)',
    schema: {
      example: {
        statusCode: 400,
        message: 'Duplicate transaction detected: A transaction for 50 USD was already initiated within the last 5 minutes.',
        error: 'Bad Request',
        details: 'Transaction IDs: txn_abc, txn_def',
        timestamp: '2026-03-13T00:00:00.000Z',
      },
    },
  })
  async initiate(
    @Body() dto: InitiateTransactionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.transactionService.initiate(dto, idempotencyKey);
  }

  @Get()
  @UseGuards(TransactionPinGuard)
  @ApiHeader({
    name: 'X-Transaction-PIN',
    required: true,
    description: '6-digit transaction PIN for authentication',
    example: '123456',
  })
  @ApiOperation({ summary: 'List transactions with filters' })
  @ApiResponse({ status: 401, description: 'Invalid or missing transaction PIN' })
  @ApiResponse({ status: 403, description: 'Account locked due to too many failed PIN attempts' })
  async findAll(@Query() filters: TransactionFilterDto) {
    return this.transactionService.findAll(filters);
  }

  @Get(':id')
  @UseGuards(TransactionPinGuard)
  @ApiHeader({
    name: 'X-Transaction-PIN',
    required: true,
    description: '6-digit transaction PIN for authentication',
    example: '123456',
  })
  @ApiOperation({ summary: 'Get transaction by ID' })
  @ApiResponse({ status: 401, description: 'Invalid or missing transaction PIN' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async findById(@Param('id') id: string) {
    return this.transactionService.findById(id);
  }

  @Post(':id/capture')
  @UseGuards(TransactionPinGuard)
  @ApiHeader({
    name: 'X-Transaction-PIN',
    required: true,
    description: '6-digit transaction PIN for authentication',
    example: '123456',
  })
  @ApiOperation({ summary: 'Capture an authorized transaction' })
  @ApiResponse({ status: 401, description: 'Invalid or missing transaction PIN' })
  @ApiResponse({ status: 403, description: 'Account locked due to too many failed PIN attempts' })
  async capture(@Param('id') id: string) {
    return this.transactionService.capture(id);
  }

  @Post(':id/reverse')
  @UseGuards(TransactionPinGuard)
  @ApiHeader({
    name: 'X-Transaction-PIN',
    required: true,
    description: '6-digit transaction PIN for authentication',
    example: '123456',
  })
  @ApiOperation({ summary: 'Reverse a transaction' })
  @ApiResponse({ status: 401, description: 'Invalid or missing transaction PIN' })
  @ApiResponse({ status: 403, description: 'Account locked due to too many failed PIN attempts' })
  async reverse(@Param('id') id: string) {
    return this.transactionService.reverse(id);
  }
}
