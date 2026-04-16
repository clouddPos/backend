import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Req,
} from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { DatabaseService } from '../../database/database.service';
import { QueueService } from '../../queue/queue.service';
import { NowPaymentsService } from './nowpayments.service';
import { WebhookSource } from '@prisma/client';

@Controller('webhooks')
export class NowPaymentsCallbackController {
  private readonly logger = new Logger(NowPaymentsCallbackController.name);

  constructor(
    private readonly nowPaymentsService: NowPaymentsService,
    private readonly db: DatabaseService,
    private readonly queueService: QueueService,
  ) {}

  @Post('nowpayments')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async handleCallback(
    @Body() body: any,
    @Headers('x-nowpayments-sig') signature: string,
    @Req() req: any,
  ) {
    this.logger.log(
      `Received NowPayments IPN: payment_id=${body.payment_id}, status=${body.payment_status}`,
    );

    // Verify IPN signature
    const rawBody = req?.rawBody
      ? req.rawBody.toString('utf8')
      : JSON.stringify(body);
    if (!this.nowPaymentsService.verifyIpnSignature(rawBody, signature)) {
      this.logger.warn('Invalid NowPayments IPN signature — ignoring');
      return { status: 'ignored' };
    }

    // Persist webhook event
    const webhookEvent = await this.db.webhookEvent.create({
      data: {
        source: WebhookSource.NOWPAYMENTS,
        eventType: body.payment_status || 'UNKNOWN',
        payload: body,
      },
    });

    // Enqueue processing
    await this.queueService.addJob(
      'webhooks',
      'process-nowpayments-callback',
      {
        webhookEventId: webhookEvent.id,
        paymentId: body.payment_id,
        paymentStatus: body.payment_status,
        orderId: body.order_id, // our transactionId
        payAmount: body.pay_amount,
        payCurrency: body.pay_currency,
        priceAmount: body.price_amount,
        priceCurrency: body.price_currency,
        purchaseId: body.purchase_id,
      },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 3000 },
      },
    );

    return { status: 'ok' };
  }
}
