import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

export interface CreatePaymentRequest {
    orderId: string;
    priceAmount: number;
    priceCurrency: string;
    payCurrency?: string;
    orderDescription?: string;
    ipnCallbackUrl?: string;
    successUrl?: string;
    cancelUrl?: string;
}

export interface NowPaymentOrder {
    payment_id: string;
    payment_status: string;
    pay_address: string;
    price_amount: number;
    price_currency: string;
    pay_amount: number;
    pay_currency: string;
    order_id: string;
    order_description?: string;
    purchase_id?: string;
    invoice_id?: string;
    invoice_url?: string;
    created_at: string;
}

@Injectable()
export class NowPaymentsService {
    private readonly logger = new Logger(NowPaymentsService.name);
    private readonly apiUrl: string;
    private readonly apiKey: string;
    private readonly ipnSecret: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly httpService: HttpService,
    ) {
        this.apiUrl = this.configService.get<string>('nowpayments.apiUrl')!;
        this.apiKey = this.configService.get<string>('nowpayments.apiKey')!;
        this.ipnSecret =
            this.configService.get<string>('nowpayments.ipnSecret') || '';
    }

    private get headers() {
        return {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json',
        };
    }

    /**
     * Create a crypto payment.
     */
    async createPayment(
        request: CreatePaymentRequest,
    ): Promise<NowPaymentOrder> {
        try {
            const { data } = await firstValueFrom(
                this.httpService.post(
                    `${this.apiUrl}/payment`,
                    {
                        price_amount: request.priceAmount,
                        price_currency: request.priceCurrency,
                        pay_currency: request.payCurrency || 'btc',
                        order_id: request.orderId,
                        order_description: request.orderDescription,
                        ipn_callback_url: request.ipnCallbackUrl,
                        success_url: request.successUrl,
                        cancel_url: request.cancelUrl,
                    },
                    { headers: this.headers },
                ),
            );

            this.logger.log(
                `NowPayments payment created: ${data.payment_id}, status=${data.payment_status}`,
            );
            return data;
        } catch (error: any) {
            const message = error.response?.data?.message || error.message;
            this.logger.error(`createPayment failed: ${message}`);
            throw new Error(`NowPayments error: ${message}`);
        }
    }

    /**
     * Get payment status by payment ID.
     */
    async getPaymentStatus(paymentId: string): Promise<NowPaymentOrder> {
        try {
            const { data } = await firstValueFrom(
                this.httpService.get(`${this.apiUrl}/payment/${paymentId}`, {
                    headers: this.headers,
                }),
            );
            return data;
        } catch (error: any) {
            const message = error.response?.data?.message || error.message;
            this.logger.error(`getPaymentStatus failed: ${message}`);
            throw new Error(`NowPayments error: ${message}`);
        }
    }

    /**
     * Get account balance for all currencies.
     */
    async getBalance(): Promise<any> {
        try {
            const { data } = await firstValueFrom(
                this.httpService.get(`${this.apiUrl}/balance`, {
                    headers: this.headers,
                }),
            );
            return data;
        } catch (error: any) {
            const message = error.response?.data?.message || error.response?.data?.error || error.message;
            this.logger.error(`getBalance failed: ${message}`);
            // Return error info instead of null so controller can show it
            return { error: message, _failed: true };
        }
    }

    /**
     * Get transaction history with pagination and filters.
     */
    async getTransactions(params?: {
        limit?: number;
        page?: number;
        sortBy?: string;
        orderBy?: string;
        dateFrom?: string;
        dateTo?: string;
    }): Promise<any> {
        try {
            const queryParams = new URLSearchParams();

            if (params?.limit) queryParams.append('limit', params.limit.toString());
            if (params?.page) queryParams.append('page', params.page.toString());
            if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
            if (params?.orderBy) queryParams.append('orderBy', params.orderBy);
            if (params?.dateFrom) queryParams.append('dateFrom', params.dateFrom);
            if (params?.dateTo) queryParams.append('dateTo', params.dateTo);

            const { data } = await firstValueFrom(
                this.httpService.get(`${this.apiUrl}/transaction?${queryParams.toString()}`, {
                    headers: this.headers,
                }),
            );
            return data;
        } catch (error: any) {
            const message = error.response?.data?.message || error.response?.data?.error || error.message;
            this.logger.error(`getTransactions failed: ${message}`);
            // Return error info instead of throwing
            return { error: message, _failed: true, data: [], page: params?.page || 1, limit: params?.limit || 50, total: 0, totalPages: 0 };
        }
    }

    /**
     * Get transaction history by order ID (our transaction ID).
     */
    async getTransactionsByOrderId(orderId: string): Promise<any> {
        try {
            const { data } = await firstValueFrom(
                this.httpService.get(`${this.apiUrl}/transaction?order_id=${orderId}`, {
                    headers: this.headers,
                }),
            );
            return data;
        } catch (error: any) {
            this.logger.error(`getTransactionsByOrderId failed: ${error.response?.data?.message || error.message}`);
            return { data: [] };
        }
    }

    /**
     * Get list of available currencies for payment.
     */
    async getAvailableCurrencies(): Promise<any> {
        try {
            const { data } = await firstValueFrom(
                this.httpService.get(`${this.apiUrl}/currencies`, {
                    headers: this.headers,
                }),
            );
            return data;
        } catch (error: any) {
            this.logger.error(`getAvailableCurrencies failed: ${error.response?.data?.message || error.message}`);
            return { currencies: [] };
        }
    }

    /**
     * Get minimum payment amount for a given currency pair.
     */
    async getMinimumPaymentAmount(
        currencyFrom: string,
        currencyTo: string,
    ): Promise<any> {
        try {
            const { data } = await firstValueFrom(
                this.httpService.get(
                    `${this.apiUrl}/min-amount?currency_from=${currencyFrom}&currency_to=${currencyTo}`,
                    { headers: this.headers },
                ),
            );
            return data;
        } catch (error: any) {
            this.logger.error(`getMinimumPaymentAmount failed: ${error.response?.data?.message || error.message}`);
            return null;
        }
    }

    /**
     * Get estimated price for a crypto amount.
     */
    async getEstimatedPrice(
        amount: number,
        currencyFrom: string,
        currencyTo: string,
    ): Promise<any> {
        try {
            const { data } = await firstValueFrom(
                this.httpService.get(
                    `${this.apiUrl}/estimate?amount=${amount}&currency_from=${currencyFrom}&currency_to=${currencyTo}`,
                    { headers: this.headers },
                ),
            );
            return data;
        } catch (error: any) {
            this.logger.error(`getEstimatedPrice failed: ${error.response?.data?.message || error.message}`);
            return null;
        }
    }

    /**
     * Get NowPayments account balance.
     */
    async getAccountBalance(): Promise<any> {
        try {
            const { data } = await firstValueFrom(
                this.httpService.get(`${this.apiUrl}/balance`, {
                    headers: this.headers,
                }),
            );
            return data;
        } catch (error: any) {
            this.logger.error(`getAccountBalance failed: ${error.response?.data?.message || error.message}`);
            return null;
        }
    }

    /**
     * Ping the NowPayments API to check availability.
     */
    async ping(): Promise<boolean> {
        try {
            await firstValueFrom(
                this.httpService.get(`${this.apiUrl}/status`, {
                    headers: this.headers,
                }),
            );
            return true;
        } catch (error: any) {
            this.logger.error(`ping failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Verify NowPayments IPN HMAC-SHA512 signature.
     */
    verifyIpnSignature(payload: string, signature: string): boolean {
        if (!this.ipnSecret) {
            this.logger.warn(
                'IPN secret not configured — skipping verification',
            );
            return true;
        }

        try {
            const expectedSignature = crypto
                .createHmac('sha512', this.ipnSecret)
                .update(payload)
                .digest('hex');
            return expectedSignature === signature;
        } catch (error: any) {
            this.logger.error(`IPN signature verification failed: ${error.message}`);
            return false;
        }
    }
}
