import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import axios from 'axios';
import { URLSearchParams } from 'url';
import { TransactionType } from '@prisma/client';

export interface PaymentRequest {
  transactionId: string;
  type: TransactionType;
  amount: number;
  currency: string;
  cardNumber?: string;
  expiryMonth?: string;
  expiryYear?: string;
  cvv?: string;
  paymentMethodId?: string; // Stripe specific
  email?: string;
}

export interface PaymentResult {
  success: boolean;
  gatewayReference?: string;
  resultCode?: string;
  rawResponse?: any;
  errorMessage?: string;
  errorDetails?: {
    message: string;
    type: string;
    code: string | null;
    declineCode: string | null;
    param: string | null;
  };
  clientSecret?: string; // For Stripe frontend
  authorizationCode?: string; // 6-digit bank code
}

export interface StripeOnrampSessionRequest {
  sourceAmount: number;
  sourceCurrency: string;
  destinationCurrency: string;
  destinationNetwork: string;
  walletAddress: string;
  destinationAmount?: number;
  customerIpAddress: string;
  lockWalletAddress?: boolean;
  settlementSpeed?: 'instant' | 'standard';
  merchantId?: string;
  externalTransactionId?: string;
}

export interface StripeOnrampSession {
  id: string;
  client_secret: string;
  redirect_url?: string | null;
  status: string;
  transaction_details?: any;
  [key: string]: any;
}

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(private readonly configService: ConfigService) {
    const secretKey = this.configService.get<string>('stripe.secretKey')!;
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2026-02-25.clover',
    });
    this.webhookSecret =
      this.configService.get<string>('stripe.webhookSecret') || '';
  }

  private get secretKey(): string {
    const key = this.configService.get<string>('stripe.secretKey');
    if (!key) {
      throw new Error('Stripe secret key is not configured');
    }
    return key;
  }

  async createPaymentIntent(
    amount: number,
    currency: string,
    metadata: Record<string, any>,
  ): Promise<PaymentResult> {
    try {
      const intent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Stripe uses cents
        currency: currency.toLowerCase(),
        metadata: {
          ...metadata,
        },
        automatic_payment_methods: {
          enabled: true,
        },
      });

      return {
        success: true,
        gatewayReference: intent.id,
        clientSecret: intent.client_secret || undefined,
        rawResponse: intent,
      };
    } catch (error: any) {
      this.logger.error(`createPaymentIntent failed: ${error.message}`);
      return {
        success: false,
        errorMessage: error.message,
        rawResponse: error,
      };
    }
  }

  /**
   * Charge a card directly (CNP / MOTO flow).
   * Creates a PaymentMethod from card details or uses existing PaymentMethod/Token.
   */
  async chargeCard(request: PaymentRequest): Promise<PaymentResult> {
    try {
      if (!request.cardNumber && !request.paymentMethodId) {
        return {
          success: false,
          errorMessage: 'Missing paymentMethodId',
        };
      }

      let paymentMethodId = request.paymentMethodId;

      // Handle legacy Stripe tokens (tok_*)
      if (paymentMethodId && paymentMethodId.startsWith('tok_')) {
        // Legacy token - create a PaymentMethod from it first
        try {
          const paymentMethod = await this.stripe.paymentMethods.create({
            type: 'card',
            card: {
              token: paymentMethodId, // Convert legacy token to PaymentMethod
            },
          });
          paymentMethodId = paymentMethod.id;
        } catch (error: any) {
          this.logger.error(`Failed to convert legacy token: ${error.message}`);
          return {
            success: false,
            errorMessage: error.message || 'Failed to process payment token',
            errorDetails: {
              message: error.message,
              type: error.type || 'StripeInvalidRequestError',
              code: error.code || null,
              declineCode: error.decline_code || null,
              param: error.param || null,
            },
          };
        }
      }

      // If raw card details provided, create a PaymentMethod first
      if (request.cardNumber && !paymentMethodId) {
        try {
          const paymentMethod = await this.stripe.paymentMethods.create({
            type: 'card',
            card: {
              number: request.cardNumber,
              exp_month: parseInt(request.expiryMonth!),
              exp_year: parseInt(request.expiryYear!),
              cvc: request.cvv,
            },
          });
          paymentMethodId = paymentMethod.id;
        } catch (error: any) {
          this.logger.error(`Failed to create PaymentMethod: ${error.message}`);
          return {
            success: false,
            errorMessage: error.message || 'Failed to create payment method',
            errorDetails: {
              message: error.message,
              type: error.type || 'StripeInvalidRequestError',
              code: error.code || null,
              declineCode: error.decline_code || null,
              param: error.param || null,
            },
          };
        }
      }

      const params: Stripe.PaymentIntentCreateParams = {
        amount: Math.round(request.amount * 100),
        currency: request.currency.toLowerCase(),
        confirm: true,
        payment_method: paymentMethodId,
        metadata: {
          transactionId: request.transactionId,
          type: request.type,
        },
        return_url: 'https://cloudpos.io/checkout/complete',
        capture_method:
          request.type === TransactionType.PRE_AUTH ? 'manual' : 'automatic',
      };

      const intent = await this.stripe.paymentIntents.create(params);

      // Extract bank authorization code if available
      let authorizationCode: string | undefined;
      const charge =
        (intent as any).latest_charge || (intent as any).charges?.data?.[0];
      if (charge && typeof charge !== 'string') {
        authorizationCode =
          charge.payment_method_details?.card?.network_authorization_code;
      }

      return {
        success:
          intent.status === 'succeeded' || intent.status === 'requires_capture',
        gatewayReference: intent.id,
        resultCode: intent.status,
        rawResponse: intent,
        authorizationCode,
      };
    } catch (error: any) {
      this.logger.error(
        `chargeCard failed for ${request.transactionId}: ${error.message}`,
      );

      // Extract helpful error details from Stripe error
      const errorDetails: any = {
        message: error.message || 'Payment failed',
        type: error.type || 'unknown',
        code: error.code || null,
        declineCode: error.decline_code || null,
        param: error.param || null,
      };

      // Map common Stripe error codes to user-friendly messages
      if (error.code === 'card_declined') {
        errorDetails.message = `Card was declined: ${error.decline_code || 'Insufficient funds'}`;
      } else if (error.code === 'expired_card') {
        errorDetails.message = 'Card has expired';
      } else if (error.code === 'incorrect_cvc') {
        errorDetails.message = 'Card security code (CVC) is incorrect';
      } else if (error.code === 'processing_error') {
        errorDetails.message = 'Error processing payment. Please try again.';
      } else if (error.code === 'authentication_required') {
        errorDetails.message = '3D Secure authentication required';
      }

      return {
        success: false,
        errorMessage: errorDetails.message,
        errorDetails,
        rawResponse: error,
      };
    }
  }

  /**
   * Get list of supported currencies from Stripe
   */
  async getSupportedCurrencies(): Promise<any[]> {
    // Stripe's supported currencies with details
    // Source: https://stripe.com/docs/currencies
    const currencies: any[] = [
      {
        code: 'USD',
        name: 'United States Dollar',
        symbol: '$',
        minimumAmount: 0.5,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'EUR',
        name: 'Euro',
        symbol: '€',
        minimumAmount: 0.5,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'GBP',
        name: 'British Pound Sterling',
        symbol: '£',
        minimumAmount: 0.3,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'NGN',
        name: 'Nigerian Naira',
        symbol: '₦',
        minimumAmount: 50,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'JPY',
        name: 'Japanese Yen',
        symbol: '¥',
        minimumAmount: 50,
        decimalPlaces: 0,
        supported: true,
      },
      {
        code: 'KRW',
        name: 'South Korean Won',
        symbol: '₩',
        minimumAmount: 500,
        decimalPlaces: 0,
        supported: true,
      },
      {
        code: 'CAD',
        name: 'Canadian Dollar',
        symbol: 'CA$',
        minimumAmount: 0.5,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'AUD',
        name: 'Australian Dollar',
        symbol: 'A$',
        minimumAmount: 0.5,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'CHF',
        name: 'Swiss Franc',
        symbol: 'CHF',
        minimumAmount: 0.5,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'SEK',
        name: 'Swedish Krona',
        symbol: 'kr',
        minimumAmount: 5,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'NOK',
        name: 'Norwegian Krone',
        symbol: 'kr',
        minimumAmount: 5,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'DKK',
        name: 'Danish Krone',
        symbol: 'kr',
        minimumAmount: 5,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'PLN',
        name: 'Polish Złoty',
        symbol: 'zł',
        minimumAmount: 5,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'CZK',
        name: 'Czech Koruna',
        symbol: 'Kč',
        minimumAmount: 15,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'HUF',
        name: 'Hungarian Forint',
        symbol: 'Ft',
        minimumAmount: 175,
        decimalPlaces: 0,
        supported: true,
      },
      {
        code: 'RON',
        name: 'Romanian Leu',
        symbol: 'lei',
        minimumAmount: 2,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'BGN',
        name: 'Bulgarian Lev',
        symbol: 'лв',
        minimumAmount: 1,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'HRK',
        name: 'Croatian Kuna',
        symbol: 'kn',
        minimumAmount: 4,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'ISK',
        name: 'Icelandic Króna',
        symbol: 'kr',
        minimumAmount: 85,
        decimalPlaces: 0,
        supported: true,
      },
      {
        code: 'TRY',
        name: 'Turkish Lira',
        symbol: '₺',
        minimumAmount: 10,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'INR',
        name: 'Indian Rupee',
        symbol: '₹',
        minimumAmount: 50,
        decimalPlaces: 0,
        supported: true,
      },
      {
        code: 'SGD',
        name: 'Singapore Dollar',
        symbol: 'S$',
        minimumAmount: 1,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'HKD',
        name: 'Hong Kong Dollar',
        symbol: 'HK$',
        minimumAmount: 4,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'MXN',
        name: 'Mexican Peso',
        symbol: 'MX$',
        minimumAmount: 10,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'BRL',
        name: 'Brazilian Real',
        symbol: 'R$',
        minimumAmount: 5,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'ZAR',
        name: 'South African Rand',
        symbol: 'R',
        minimumAmount: 10,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'NZD',
        name: 'New Zealand Dollar',
        symbol: 'NZ$',
        minimumAmount: 1,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'CNY',
        name: 'Chinese Yuan',
        symbol: '¥',
        minimumAmount: 5,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'THB',
        name: 'Thai Baht',
        symbol: '฿',
        minimumAmount: 20,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'MYR',
        name: 'Malaysian Ringgit',
        symbol: 'RM',
        minimumAmount: 2,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'PHP',
        name: 'Philippine Peso',
        symbol: '₱',
        minimumAmount: 30,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'IDR',
        name: 'Indonesian Rupiah',
        symbol: 'Rp',
        minimumAmount: 10000,
        decimalPlaces: 0,
        supported: true,
      },
      {
        code: 'VND',
        name: 'Vietnamese Đồng',
        symbol: '₫',
        minimumAmount: 15000,
        decimalPlaces: 0,
        supported: true,
      },
      {
        code: 'AED',
        name: 'United Arab Emirates Dirham',
        symbol: 'د.إ',
        minimumAmount: 2,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'SAR',
        name: 'Saudi Riyal',
        symbol: '﷼',
        minimumAmount: 2,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'ILS',
        name: 'Israeli New Shekel',
        symbol: '₪',
        minimumAmount: 2,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'EGP',
        name: 'Egyptian Pound',
        symbol: '£',
        minimumAmount: 10,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'KES',
        name: 'Kenyan Shilling',
        symbol: 'KSh',
        minimumAmount: 50,
        decimalPlaces: 2,
        supported: true,
      },
      {
        code: 'GHS',
        name: 'Ghanaian Cedi',
        symbol: '₵',
        minimumAmount: 5,
        decimalPlaces: 2,
        supported: true,
      },
    ];

    return currencies;
  }

  /**
   * Capture a manual PaymentIntent.
   */
  async capturePaymentIntent(paymentIntentId: string): Promise<PaymentResult> {
    try {
      const intent = await this.stripe.paymentIntents.capture(paymentIntentId);

      let authorizationCode: string | undefined;
      const charge =
        (intent as any).latest_charge || (intent as any).charges?.data?.[0];
      if (charge && typeof charge !== 'string') {
        authorizationCode =
          charge.payment_method_details?.card?.network_authorization_code;
      }

      return {
        success: intent.status === 'succeeded',
        gatewayReference: intent.id,
        resultCode: intent.status,
        rawResponse: intent,
        authorizationCode,
      };
    } catch (error: any) {
      this.logger.error(
        `capturePaymentIntent failed for ${paymentIntentId}: ${error.message}`,
      );
      return {
        success: false,
        errorMessage: error.message,
        rawResponse: error,
      };
    }
  }

  /**
   * Cancel a PaymentIntent (typically for pre-auth reversals).
   */
  async cancelPaymentIntent(paymentIntentId: string): Promise<PaymentResult> {
    try {
      const intent = await this.stripe.paymentIntents.cancel(paymentIntentId);
      return {
        success: intent.status === 'canceled',
        gatewayReference: intent.id,
        resultCode: intent.status,
        rawResponse: intent,
      };
    } catch (error: any) {
      this.logger.error(
        `cancelPaymentIntent failed for ${paymentIntentId}: ${error.message}`,
      );
      return {
        success: false,
        errorMessage: error.message,
        rawResponse: error,
      };
    }
  }

  /**
   * Refund a payment intent.
   */
  async refundTransaction(
    paymentIntentId: string,
    amount?: number,
  ): Promise<PaymentResult> {
    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: amount ? Math.round(amount * 100) : undefined,
      });

      return {
        success: !!refund.id,
        gatewayReference: refund.id,
        resultCode: refund.status || undefined,
        rawResponse: refund,
      };
    } catch (error: any) {
      this.logger.error(
        `refundTransaction failed for ${paymentIntentId}: ${error.message}`,
      );
      return {
        success: false,
        errorMessage: error.message,
        rawResponse: error,
      };
    }
  }

  /**
   * Get Stripe balance.
   */
  async getBalance(): Promise<any> {
    try {
      const balance = await this.stripe.balance.retrieve();
      return balance;
    } catch (error: any) {
      this.logger.error(`getBalance failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verify Stripe webhook signature and construct event.
   */
  constructEvent(payload: string | Buffer, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.webhookSecret,
    );
  }

  /**
   * Create a Stripe crypto onramp session.
   * Stripe handles the card payment UI and crypto delivery; the backend only creates the session.
   *
   * The response contains both `client_secret` (for embedded mode) and `redirect_url` (for redirect mode).
   * The frontend decides which to use:
   * - Embedded: use `client_secret` with Stripe's embedded widget
   * - Redirect: use `redirect_url` to navigate away to Stripe's hosted page
   */
  async createCryptoOnrampSession(
    request: StripeOnrampSessionRequest,
  ): Promise<StripeOnrampSession> {
    const params = new URLSearchParams();
    params.append('customer_ip_address', request.customerIpAddress);
    params.append('source_currency', request.sourceCurrency.toLowerCase());
    params.append('source_amount', request.sourceAmount.toString());
    params.append(
      'destination_currency',
      request.destinationCurrency.toLowerCase(),
    );
    params.append(
      'destination_network',
      request.destinationNetwork.toLowerCase(),
    );
    params.append(
      `wallet_addresses[${request.destinationNetwork.toLowerCase()}]`,
      request.walletAddress,
    );

    if (request.destinationAmount != null) {
      params.append('destination_amount', request.destinationAmount.toString());
    }

    if (request.lockWalletAddress !== undefined) {
      params.append(
        'lock_wallet_address',
        request.lockWalletAddress ? 'true' : 'false',
      );
    }

    // Embedded mode optimization: restrict to single currency/network
    // so the user sees a fixed quote instead of a selection screen
    params.append(
      'destination_currencies[]',
      request.destinationCurrency.toLowerCase(),
    );
    params.append(
      'destination_networks[]',
      request.destinationNetwork.toLowerCase(),
    );

    // Default to instant settlement for POS-like experience
    if (!request.settlementSpeed) {
      params.append('settlement_speed', 'instant');
    }

    // Attach merchant metadata for tracking
    if (request.merchantId) {
      params.append('metadata[merchant_id]', request.merchantId);
    }
    if (request.externalTransactionId) {
      params.append(
        'metadata[external_transaction_id]',
        request.externalTransactionId,
      );
    }

    try {
      const response = await axios.post(
        'https://api.stripe.com/v1/crypto/onramp_sessions',
        params.toString(),
        {
          auth: {
            username: this.secretKey,
            password: '',
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      return response.data as StripeOnrampSession;
    } catch (error: any) {
      const message =
        error.response?.data?.error?.message ||
        error.response?.data?.message ||
        error.message;
      this.logger.error(`createCryptoOnrampSession failed: ${message}`);
      throw new Error(`Stripe onramp error: ${message}`);
    }
  }

  /**
   * Retrieve a Stripe crypto onramp session by ID.
   */
  async getCryptoOnrampSession(
    sessionId: string,
  ): Promise<StripeOnrampSession> {
    try {
      const response = await axios.get(
        `https://api.stripe.com/v1/crypto/onramp_sessions/${sessionId}`,
        {
          auth: {
            username: this.secretKey,
            password: '',
          },
        },
      );

      return response.data as StripeOnrampSession;
    } catch (error: any) {
      const message =
        error.response?.data?.error?.message ||
        error.response?.data?.message ||
        error.message;
      this.logger.error(`getCryptoOnrampSession failed: ${message}`);
      throw new Error(`Stripe onramp error: ${message}`);
    }
  }
}
