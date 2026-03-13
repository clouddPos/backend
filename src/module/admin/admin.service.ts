import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { TransactionStatus } from '@prisma/client';
import { StripeService } from '../payment/stripe.service';
import { NowPaymentsService } from '../blockchain/nowpayments.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly db: DatabaseService,
    private readonly stripeService: StripeService,
    private readonly nowPaymentsService: NowPaymentsService,
  ) { }

  async getGatewayBalances() {
    const [stripe, nowpayments] = await Promise.all([
      this.stripeService.getBalance(),
      this.nowPaymentsService.getAccountBalance(),
    ]);
    return { stripe, nowpayments };
  }

  async getDashboardStats() {
    const [
      totalMerchants,
      activeMerchants,
      totalTransactions,
      statusCounts,
      totalVolume,
      recentTransactions,
      pendingWebhooks,
    ] = await Promise.all([
      this.db.merchant.count(),
      this.db.merchant.count({ where: { status: 'ACTIVE' } }),
      this.db.transaction.count(),
      this.db.transaction.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      this.db.transaction.aggregate({
        where: { status: TransactionStatus.SETTLED },
        _sum: { amount: true },
      }),
      this.db.transaction.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          merchant: { select: { businessName: true } },
        },
      }),
      this.db.webhookEvent.count({ where: { processed: false } }),
    ]);

    const statusBreakdown: Record<string, number> = {};
    for (const item of statusCounts) {
      statusBreakdown[item.status] = item._count.status;
    }

    return {
      merchants: { total: totalMerchants, active: activeMerchants },
      transactions: {
        total: totalTransactions,
        statusBreakdown,
        settledVolume: totalVolume._sum.amount || 0,
      },
      recentTransactions,
      pendingWebhooks,
    };
  }

  async searchTransactions(params: {
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const { page = 1, limit = 20, search } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      where.OR = [
        { id: { contains: search } },
        { idempotencyKey: { contains: search } },
        { gatewayReference: { contains: search } },
        { maskedCardNumber: { contains: search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.db.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          merchant: { select: { id: true, businessName: true } },
          blockchainTx: true,
        },
      }),
      this.db.transaction.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async listWebhookEvents(params: {
    page?: number;
    limit?: number;
    source?: string;
  }) {
    const { page = 1, limit = 20, source } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (source) where.source = source;

    const [data, total] = await Promise.all([
      this.db.webhookEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.db.webhookEvent.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
