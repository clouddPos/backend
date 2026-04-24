import {
  Controller,
  Post,
  Headers,
  Body,
  BadRequestException,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { StripeService } from '../payment/stripe.service';
import { DatabaseService } from '../../database/database.service';
import { SocketGateway } from '../notification/socket.gateway';
import { WebhookSource } from '@prisma/client';

@ApiTags('Webhooks')
@Controller('webhooks/stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly db: DatabaseService,
    private readonly socketGateway: SocketGateway,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Stripe webhook events for payment updates' })
  @ApiResponse({ status: 200, description: 'Event received and queued' })
  @ApiResponse({ status: 400, description: 'Invalid signature or payload' })
  async handleWebhook(
    @Headers('stripe-signature') sig: string,
    @Body() body: any,
  ) {
    if (!sig) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    // Verify webhook signature
    let event;
    try {
      event = this.stripeService.constructEvent(JSON.stringify(body), sig);
    } catch (err: any) {
      this.logger.error(
        `Webhook signature verification failed: ${err.message}`,
      );
      throw new BadRequestException(`Webhook Error: ${err.message}`);
    }

    this.logger.log(
      `Received Stripe webhook event: ${event.type} [${event.id}]`,
    );

    // 1. Persist the event for audit/reliability
    const persistedEvent = await this.db.webhookEvent.create({
      data: {
        source: WebhookSource.STRIPE,
        eventType: event.type,
        payload: event,
      },
    });

    // 2. Process specific event types and emit WebSocket events
    await this.processStripeEvent(event);

    return { received: true };
  }

  /**
   * Process specific Stripe event types and emit WebSocket events
   */
  private async processStripeEvent(event: any) {
    const merchantId = 'default'; // TODO: Extract from event metadata

    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentSucceeded(event, merchantId);
        break;

      case 'payment_intent.payment_failed':
        await this.handlePaymentFailed(event, merchantId);
        break;

      case 'charge.refunded':
        await this.handleChargeRefunded(event, merchantId);
        break;

      case 'charge.dispute.created':
        await this.handleChargebackReceived(event, merchantId);
        break;

      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }
  }

  /**
   * Payment succeeded - emit settlement confirmation
   */
  private async handlePaymentSucceeded(event: any, merchantId: string) {
    const paymentIntent = event.data.object;
    const charge = paymentIntent.latest_charge || {};
    const authCode =
      charge.payment_method_details?.card?.network_authorization_code;

    this.logger.log(
      `Payment succeeded: ${paymentIntent.id}, Auth Code: ${authCode}`,
    );

    // Emit WebSocket event for frontend
    this.socketGateway.notifyPaymentSettled(merchantId, {
      transactionId: paymentIntent.metadata?.transactionId || paymentIntent.id,
      authorizationCode: authCode || 'N/A',
      amount: paymentIntent.amount / 100, // Convert from cents
      currency: paymentIntent.currency.toUpperCase(),
      last4: charge.payment_method_details?.card?.last4 || '****',
      cardScheme:
        charge.payment_method_details?.card?.brand?.toUpperCase() || 'UNKNOWN',
      settledAt: new Date().toISOString(),
      gatewayReference: paymentIntent.id,
    });
  }

  /**
   * Payment failed - emit failure notification
   */
  private async handlePaymentFailed(event: any, merchantId: string) {
    const paymentIntent = event.data.object;
    const lastPaymentError = paymentIntent.last_payment_error;

    this.logger.warn(
      `Payment failed: ${paymentIntent.id} - ${lastPaymentError?.message}`,
    );

    // Emit WebSocket event for frontend
    this.socketGateway.notifyPaymentFailed(merchantId, {
      transactionId: paymentIntent.metadata?.transactionId || paymentIntent.id,
      errorCode: lastPaymentError?.code || 'payment_failed',
      errorMessage: lastPaymentError?.message || 'Payment failed',
      declineCode: lastPaymentError?.decline_code,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency.toUpperCase(),
    });
  }

  /**
   * Charge refunded - emit refund confirmation
   */
  private async handleChargeRefunded(event: any, merchantId: string) {
    const charge = event.data.object;
    const refund = charge.refunds?.data?.[0] || {};

    this.logger.log(`Refund processed: ${refund.id} for charge ${charge.id}`);

    // Emit WebSocket event for frontend
    this.socketGateway.notifyRefundProcessed(merchantId, {
      transactionId: charge.metadata?.transactionId || charge.id,
      refundId: refund.id,
      amount: (refund.amount || charge.amount) / 100,
      currency: charge.currency.toUpperCase(),
      reason: refund.reason || 'requested_by_customer',
    });
  }

  /**
   * Chargeback received - emit dispute notification
   */
  private async handleChargebackReceived(event: any, merchantId: string) {
    const dispute = event.data.object;

    this.logger.warn(
      `Chargeback received: ${dispute.id} for charge ${dispute.charge}`,
    );

    // Emit WebSocket event for frontend
    this.socketGateway.notifyChargebackReceived(merchantId, {
      transactionId: dispute.metadata?.transactionId || dispute.charge,
      chargebackId: dispute.id,
      amount: dispute.amount / 100,
      currency: dispute.currency.toUpperCase(),
      reason: dispute.reason,
      dueDate: new Date(dispute.evidence_due_date).toISOString(),
    });
  }
}
