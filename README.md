# CloudPOS Backend — Integrated Card, Crypto & Blockchain Solution

Welcome to the CloudPOS backend. This platform provides a unified Point-of-Sale backend supporting **Stripe** (Card), **NowPayments** (Crypto), and immutable **On-Chain** settlement proof via smart contracts.

---

## 🏗 System Architecture

The application is built with NestJS and follows a modular, event-driven architecture:

### 1. Card Payments (Stripe CNP/MOTO)
*   **Unified Flow:** All card payments (Online and Offline Sync) use the Stripe `PaymentIntents` API.
*   **PCI-DSS Friendly:** Card data is handled as CNP/keyed-in to ensure global compatibility.
*   **Webhooks:** Uses Stripe webhooks with raw body signature verification to synchronize transaction states.

### 2. Crypto Payments (NowPayments)
*   **Multi-Coin Support:** 200+ cryptocurrencies supported via NowPayments.
*   **QR Flow:** Generates unique deposit addresses displayed as QR codes for customer scanning.
*   **IPN Integration:** Asynchronous status updates via Instant Payment Notifications.

### 3. Blockchain Settlement
*   **Immutable Proof:** Settled transactions are mirrored on-chain to merchant-specific smart contracts.
*   **Secure Wallets:** Merchant private keys are AES-256 encrypted and decrypted just-in-time for on-chain signing.
*   **Auto-Monitoring:** A background monitor polls for block confirmations.

---

## 🛠 Setup & Running

1. **Infrastructure:**
   ```bash
   docker-compose up -d # Starts Postgres & Redis
   ```

2. **Database:**
   ```bash
   npx prisma generate
   npx prisma migrate dev
   ```

3. **Development:**
   ```bash
   npm run start:dev
   ```

4. **Documentation:**
   *   Swagger: `http://localhost:3000/api`
   *   Detailed Flows: Refer to `DETAILED_FLOW.md`
   *   Architecture Overview: Refer to `SYSTEM_OVERVIEW.md`

---

## 🔑 Key Environment Variables

*   `STRIPE_SECRET_KEY`: Your Stripe secret key.
*   `STRIPE_WEBHOOK_SECRET`: For signature verification.
*   `NOWPAYMENT_API_KEY`: For crypto payments.
*   `WALLET_ENCRYPTION_KEY`: 32-character key for AES encryption.
*   `BLOCKCHAIN_RPC_URL`: Infura/Alchemy endpoint.

---

## 🧪 Quick Test Payloads

### Card Transaction (Stripe)
`POST /api/v1/transactions`
```json
{
  "merchantId": "uuid",
  "amount": 100.00,
  "currency": "USD",
  "type": "ONLINE",
  "cardNumber": "4242424242424242",
  "expiryDate": "12/28",
  "cvv": "123"
}
```

### Crypto Initiation (NowPayments)
`POST /api/v1/crypto-payments/initiate`
```json
{
  "merchantId": "uuid",
  "amount": 50.00,
  "currency": "USD",
  "payCurrency": "btc"
}
```

### Admin Balance Check
`GET /api/v1/admin/balances`
(Returns aggregated balances from Stripe and other gateways)


### Frontend Sketch pattern

[Frontend UX flow](/backend/FRONTEND_UX_FLOW.md)
[Auth Flow](/backend/FRONTEND_INTEGRATION.md)

### WEBHOOK

[webhook](/backend/WEBSOCKET_EVENTS.md)

