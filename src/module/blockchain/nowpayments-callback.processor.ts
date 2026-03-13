import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { QueueService } from '../../queue/queue.service';
import { DatabaseService } from '../../database/database.service';
import { BlockchainTxStatus, TransactionStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { TransactionService } from '../transaction/transaction.service';

@Injectable()
export class NowPaymentsCallbackProcessor implements OnModuleInit {
    private readonly logger = new Logger(NowPaymentsCallbackProcessor.name);

    constructor(
        private readonly queueService: QueueService,
        private readonly db: DatabaseService,
        private readonly transactionService: TransactionService,
    ) { }

    onModuleInit() {
        this.queueService.registerWorker(
            'webhooks',
            async (job: Job) => {
                if (job.name === 'process-nowpayments-callback') {
                    await this.processCallback(job.data);
                }
            },
            { concurrency: 5 },
        );
        this.logger.log('NowPayments callback processor initialized and worker registered');
    }

    async processCallback(data: {
        webhookEventId: string;
        paymentId: string;
        paymentStatus: string;
        orderId: string;
        payAmount?: number;
        payCurrency?: string;
        priceAmount?: number;
        priceCurrency?: string;
        purchaseId?: string;
    }) {
        const { webhookEventId, paymentId, paymentStatus, orderId } = data;
        const normalizedStatus = (paymentStatus || '').toLowerCase();

        try {
            // Map NowPayments status to our enum
            const mappedStatus = this.mapStatus(normalizedStatus);

            // Find existing blockchain transaction or create
            let blockchainTx = await this.db.blockchainTransaction.findFirst({
                where: { nowpaymentsPaymentId: paymentId },
            });

            if (blockchainTx) {
                blockchainTx = await this.db.blockchainTransaction.update({
                    where: { id: blockchainTx.id },
                    data: {
                        status: mappedStatus,
                        payAmount: data.payAmount != null ? data.payAmount : undefined,
                        payCurrency: data.payCurrency,
                        receiveAmount: data.priceAmount != null ? data.priceAmount : undefined,
                        receiveCurrency: data.priceCurrency,
                        callbackPayload: data as any,
                    },
                });
            } else if (orderId) {
                // Create new blockchain transaction linked to our transaction
                blockchainTx = await this.db.blockchainTransaction.create({
                    data: {
                        transactionId: orderId,
                        nowpaymentsPaymentId: paymentId,
                        status: mappedStatus,
                        payAmount: data.payAmount != null ? data.payAmount : undefined,
                        payCurrency: data.payCurrency,
                        receiveAmount: data.priceAmount != null ? data.priceAmount : undefined,
                        receiveCurrency: data.priceCurrency,
                        callbackPayload: data as any,
                    },
                });
            }

            // Update main transaction status based on payment status
            const transactionId = orderId || blockchainTx?.transactionId;
            if (transactionId) {
                await this.updateTransactionStatus(transactionId, normalizedStatus, data);
            }

            // Mark webhook event processed
            await this.db.webhookEvent.update({
                where: { id: webhookEventId },
                data: { processed: true, processedAt: new Date() },
            });

            this.logger.log(
                `Processed NowPayments callback: payment=${paymentId}, status=${paymentStatus} → ${mappedStatus}`,
            );
        } catch (error: any) {
            this.logger.error(
                `Failed to process NowPayments callback ${webhookEventId}: ${error.message}`,
            );
            throw error;
        }
    }

    private mapStatus(nowpaymentsStatus: string): BlockchainTxStatus {
        const statusMap: Record<string, BlockchainTxStatus> = {
            waiting: BlockchainTxStatus.PENDING,
            confirming: BlockchainTxStatus.CONFIRMING,
            confirmed: BlockchainTxStatus.PAID,
            sending: BlockchainTxStatus.PAID,
            partially_paid: BlockchainTxStatus.CONFIRMING,
            finished: BlockchainTxStatus.PAID,
            failed: BlockchainTxStatus.CANCELLED,
            refunded: BlockchainTxStatus.REFUNDED,
            expired: BlockchainTxStatus.EXPIRED,
        };
        return statusMap[nowpaymentsStatus] || BlockchainTxStatus.PENDING;
    }

    private async updateTransactionStatus(
        transactionId: string,
        nowpaymentsStatus: string,
        payload: any,
    ) {
        const gatewayData = {
            gatewayReference: payload.paymentId,
            gatewayResponse: payload,
        };

        switch (nowpaymentsStatus) {
            case 'confirmed':
            case 'finished':
            case 'sending':
                await this.transactionService.advanceStatus(
                    transactionId,
                    TransactionStatus.SETTLED,
                    gatewayData,
                );
                break;
            case 'failed':
            case 'expired':
                await this.transactionService.updateStatus(
                    transactionId,
                    TransactionStatus.FAILED,
                    gatewayData,
                );
                break;
            case 'refunded':
                await this.transactionService.updateStatus(
                    transactionId,
                    TransactionStatus.REVERSED,
                    gatewayData,
                );
                break;
            default:
                // waiting / confirming / partially_paid: no status change
                break;
        }
    }
}
