import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiHeader,
  ApiResponse,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { TransactionPinGuard } from '../auth/guards/transaction-pin.guard';

@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  @UseGuards(TransactionPinGuard)
  @ApiHeader({
    name: 'X-Transaction-PIN',
    required: true,
    description: '6-digit transaction PIN for authentication',
    example: '123456',
  })
  @ApiOperation({ summary: 'Get dashboard summary stats' })
  @ApiResponse({ status: 401, description: 'Invalid or missing transaction PIN' })
  @ApiResponse({ status: 403, description: 'Account locked due to too many failed PIN attempts' })
  async getDashboard() {
    return this.adminService.getDashboardStats();
  }

  @Get('balances')
  @UseGuards(TransactionPinGuard)
  @ApiHeader({
    name: 'X-Transaction-PIN',
    required: true,
    description: '6-digit transaction PIN for authentication',
    example: '123456',
  })
  @ApiOperation({ summary: 'Get aggregated gateway balances' })
  @ApiResponse({ status: 401, description: 'Invalid or missing transaction PIN' })
  @ApiResponse({ status: 403, description: 'Account locked due to too many failed PIN attempts' })
  async getGatewayBalances() {
    return this.adminService.getGatewayBalances();
  }

  @Get('transactions')
  @UseGuards(TransactionPinGuard)
  @ApiHeader({
    name: 'X-Transaction-PIN',
    required: true,
    description: '6-digit transaction PIN for authentication',
    example: '123456',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiOperation({ summary: 'Search transactions' })
  @ApiResponse({ status: 401, description: 'Invalid or missing transaction PIN' })
  @ApiResponse({ status: 403, description: 'Account locked due to too many failed PIN attempts' })
  async searchTransactions(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    return this.adminService.searchTransactions({ page, limit, search });
  }

  @Get('webhooks')
  @UseGuards(TransactionPinGuard)
  @ApiHeader({
    name: 'X-Transaction-PIN',
    required: true,
    description: '6-digit transaction PIN for authentication',
    example: '123456',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'source', required: false, type: String })
  @ApiOperation({ summary: 'List webhook events' })
  @ApiResponse({ status: 401, description: 'Invalid or missing transaction PIN' })
  @ApiResponse({ status: 403, description: 'Account locked due to too many failed PIN attempts' })
  async listWebhooks(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('source') source?: string,
  ) {
    return this.adminService.listWebhookEvents({ page, limit, source });
  }
}
