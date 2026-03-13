import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { TransactionStatus } from '@prisma/client';
import { TransactionService } from '../transaction/transaction.service';

@Processor('process-stripe-webhook')
export class StripeWebhookProcessor extends WorkerHost {
    private readonly logger = new Logger(StripeWebhookProcessor.name);

    constructor(
        private readonly db: DatabaseService,
        private readonly transactionService: TransactionService,
    ) {
        super();
    }

    async process(job: Job<any, any, string>): Promise<any> {
        const { eventId } = job.data;

        // Fetch persisted event
        const webhookEvent = await this.db.webhookEvent.findUnique({
            where: { id: eventId },
        });

        if (!webhookEvent) {
            this.logger.error(`WebhookEvent ${eventId} not found`);
            return;
        }

        const stripeEvent = webhookEvent.payload as any;
        const eventType = stripeEvent.type;
        const dataObject = stripeEvent.data.object;

        this.logger.log(`Processing Stripe event: ${eventType} [${stripeEvent.id}]`);

        try {
            switch (eventType) {
                case 'payment_intent.succeeded':
                    await this.handlePaymentIntentSucceeded(dataObject);
                    break;
                case 'payment_intent.payment_failed':
                    await this.handlePaymentIntentFailed(dataObject);
                    break;
                case 'charge.refunded':
                    await this.handleChargeRefunded(dataObject);
                    break;
                // Add more event handlers as needed
                default:
                    this.logger.debug(`Unhandled event type: ${eventType}`);
            }

            // Mark as processed
            await this.db.webhookEvent.update({
                where: { id: eventId },
                data: {
                    processed: true,
                    processedAt: new Date(),
                },
            });

        } catch (error: any) {
            this.logger.error(`Error processing Stripe event ${stripeEvent.id}: ${error.message}`);
            throw error;
        }
    }

    private async handlePaymentIntentSucceeded(paymentIntent: any) {
        const gatewayReference = paymentIntent.id;

        // Find transaction by gateway reference or transactionId in metadata
        const transactionId = paymentIntent.metadata?.transactionId;

        const transaction = await this.db.transaction.findFirst({
            where: {
                OR: [
                    { gatewayReference },
                    { id: transactionId },
                ],
            },
        });

        if (!transaction) {
            this.logger.warn(`Transaction not found for PaymentIntent: ${gatewayReference}`);
            return;
        }

        // Extract auth code from PI
        let authorizationCode: string | undefined;
        const charge = (paymentIntent as any).latest_charge || (paymentIntent as any).charges?.data?.[0];
        if (charge && typeof charge !== 'string') {
            authorizationCode = (charge as any).payment_method_details?.card?.network_authorization_code;
        }

        await this.transactionService.advanceStatus(
            transaction.id,
            TransactionStatus.SETTLED,
            {
                gatewayReference,
                gatewayResponse: paymentIntent,
                authorizationCode,
            },
        );

        this.logger.log(`Transaction ${transaction.id} advanced to SETTLED (Auth: ${authorizationCode})`);
    }

    private async handlePaymentIntentFailed(paymentIntent: any) {
        const gatewayReference = paymentIntent.id;
        const transactionId = paymentIntent.metadata?.transactionId;

        const transaction = await this.db.transaction.findFirst({
            where: {
                OR: [
                    { gatewayReference },
                    { id: transactionId },
                ],
            },
        });

        if (!transaction) return;

        await this.transactionService.updateStatus(
            transaction.id,
            TransactionStatus.FAILED,
            { gatewayResponse: paymentIntent },
        );
    }

    private async handleChargeRefunded(charge: any) {
        const paymentIntentId = charge.payment_intent;

        const transaction = await this.db.transaction.findFirst({
            where: { gatewayReference: paymentIntentId },
        });

        if (!transaction) return;

        await this.transactionService.updateStatus(
            transaction.id,
            TransactionStatus.REVERSED,
            { gatewayResponse: charge },
        );
    }
}
