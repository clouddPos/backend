import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';

const allowedOrigins =
    process.env.ALLOWED_FRONTEND_URLS?.split(',').map((url) => url.trim()) ??
    ['http://localhost:3000'];

@WebSocketGateway({
    cors: {
        origin: allowedOrigins,
        credentials: true,
    },
    namespace: '/pos',
})
export class SocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(SocketGateway.name);

    constructor(
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
        private readonly db: DatabaseService,
    ) { }

    // Track connected POS terminals by merchantId if they authenticate 
    // For simplicity, we broadcast to a 'merchant-{id}' room

    afterInit(server: Server) {
        this.logger.log('WebSocket Gateway Initialized');
    }

    async handleConnection(client: Socket) {
        const token = this.extractToken(client);
        if (!token) {
            this.logger.warn(`Socket client missing token: ${client.id}`);
            client.disconnect();
            return;
        }

        try {
            const secret = this.configService.get<string>('jwt.secret')!;
            const payload: any = await this.jwtService.verifyAsync(token, { secret });

            // For now, just accept any valid JWT - merchant info comes from API key middleware
            this.logger.log(`Socket client authenticated: ${client.id}`);
            client.join(`merchant-default`);
            this.logger.log(`POS Client connected to room merchant-default: ${client.id}`);
        } catch (err: any) {
            this.logger.warn(`Socket auth error for client ${client.id}: ${err.message}`);
            client.disconnect();
        }
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`Client disconnected: ${client.id}`);
    }

    // Called by other services (like Adyen Webhook or CoinGate webhook)
    notifyTransactionSettled(merchantId: string, payload: any) {
        this.server.to(`merchant-${merchantId}`).emit('transaction.settled', payload);
        this.logger.log(`Emitted transaction.settled to merchant-${merchantId}`);
    }

    notifyTransactionAuthorized(merchantId: string, payload: any) {
        this.server.to(`merchant-${merchantId}`).emit('transaction.authorized', payload);
        this.logger.log(`Emitted transaction.authorized to merchant-${merchantId}`);
    }

    notifyOfflineSyncComplete(merchantId: string, payload: any) {
        this.server.to(`merchant-${merchantId}`).emit('offline.sync.complete', payload);
        this.logger.log(`Emitted offline.sync.complete to merchant-${merchantId}`);
    }

    // Payment-specific events for CNP/CP flows
    notifyPaymentAuthorized(merchantId: string, payload: {
        transactionId: string;
        authorizationCode: string | null;
        amount: number;
        currency: string;
        last4: string;
        cardScheme: string;
        status: string;
    }) {
        this.server.to(`merchant-${merchantId}`).emit('payment.authorized', payload);
        this.logger.log(`Emitted payment.authorized to merchant-${merchantId}: ${payload.transactionId}`);
    }

    notifyPaymentSettled(merchantId: string, payload: {
        transactionId: string;
        authorizationCode: string | null;
        amount: number;
        currency: string;
        last4: string;
        cardScheme: string;
        settledAt: string;
        gatewayReference: string | null;
    }) {
        this.server.to(`merchant-${merchantId}`).emit('payment.settled', payload);
        this.logger.log(`Emitted payment.settled to merchant-${merchantId}: ${payload.transactionId}`);
    }

    notifyPaymentFailed(merchantId: string, payload: {
        transactionId: string;
        errorCode: string;
        errorMessage: string;
        declineCode?: string | null;
        amount: number;
        currency: string;
    }) {
        this.server.to(`merchant-${merchantId}`).emit('payment.failed', payload);
        this.logger.log(`Emitted payment.failed to merchant-${merchantId}: ${payload.transactionId}`);
    }

    notifyRefundProcessed(merchantId: string, payload: {
        transactionId: string;
        refundId: string;
        amount: number;
        currency: string;
        reason: string;
    }) {
        this.server.to(`merchant-${merchantId}`).emit('refund.processed', payload);
        this.logger.log(`Emitted refund.processed to merchant-${merchantId}: ${payload.transactionId}`);
    }

    notifyChargebackReceived(merchantId: string, payload: {
        transactionId: string;
        chargebackId: string;
        amount: number;
        currency: string;
        reason: string;
        dueDate: string;
    }) {
        this.server.to(`merchant-${merchantId}`).emit('chargeback.received', payload);
        this.logger.log(`Emitted chargeback.received to merchant-${merchantId}: ${payload.transactionId}`);
    }

    private extractToken(client: Socket): string | null {
        const authToken = (client.handshake as any)?.auth?.token as string | undefined;
        if (authToken) return authToken;

        const header = client.handshake.headers?.authorization as string | undefined;
        if (header?.startsWith('Bearer ')) {
            return header.slice('Bearer '.length);
        }
        return null;
    }
}
