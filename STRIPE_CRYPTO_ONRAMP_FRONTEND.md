# Stripe Crypto Onramp — Frontend Integration Guide

How to embed Stripe's crypto onramp widget into the POS terminal so customers can buy crypto with card — **without leaving your app**.

---

## Overview

The Stripe Crypto Onramp lets customers enter card details and purchase crypto. The crypto is delivered to a wallet address you specify. Everything happens inside an embedded widget on your POS screen — **no redirect to Stripe's website**.

```
Customer wants crypto
        ↓
POS creates onramp session (backend API)
        ↓
Backend returns `clientSecret`
        ↓
Frontend renders `<EmbeddedOnramp clientSecret="..." />`
        ↓
Customer enters card INSIDE the widget
        ↓
Stripe charges card → delivers crypto to wallet
        ↓
Webhook fires → POS shows success
```

---

## Backend API

### Create Onramp Session

```
POST /api/v1/crypto-payments/stripe-onramp
```

**Headers:**
```
Content-Type: application/json
x-api-key: YOUR_POS_API_KEY
Idempotency-Key: optional-unique-key  // prevents duplicate sessions
```

**Request Body:**
```json
{
  "sourceAmount": 100,
  "sourceCurrency": "USD",
  "destinationCurrency": "btc",
  "destinationNetwork": "bitcoin",
  "walletAddress": "bc1qxy2kgdyxj...",
  "destinationAmount": null,
  "customerIpAddress": "203.0.113.10",
  "lockWalletAddress": true,
  "settlementSpeed": "instant",
  "externalTransactionId": "your-internal-ref-123"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sourceAmount` | number | **Yes** | Fiat amount to charge (e.g., `100` = $100) |
| `sourceCurrency` | string | **Yes** | Fiat currency code (`USD`, `EUR`, `NGN`, etc.) |
| `destinationCurrency` | string | **Yes** | Crypto ticker (`btc`, `eth`, `usdc`, etc.) |
| `destinationNetwork` | string | **Yes** | Blockchain network (`bitcoin`, `ethereum`, `polygon`, etc.) |
| `walletAddress` | string | **Yes** | Crypto wallet to receive the purchased crypto |
| `destinationAmount` | number | No | Fix the crypto amount instead of fiat (mutually exclusive with `sourceAmount`) |
| `customerIpAddress` | string | No | Auto-detected by backend if omitted |
| `lockWalletAddress` | boolean | No | Default `true`. Prevents customer from changing wallet in widget |
| `settlementSpeed` | string | No | `"instant"` (default) or `"standard"`. When crypto is delivered |
| `externalTransactionId` | string | No | Your internal reference, stored in Stripe metadata |

**Response (201):**
```json
{
  "clientSecret": "cos_live_abc123def456...",
  "redirectUrl": "https://crypto.link.com/onramp?session=cos_abc123",
  "sessionId": "cos_abc123def456",
  "status": "initialized",
  "walletAddress": "bc1qxy2kgdyxj...",
  "sourceCurrency": "USD",
  "sourceAmount": 100,
  "destinationCurrency": "btc",
  "destinationNetwork": "bitcoin",
  "transactionDetails": {
    "destination_amount": "0.00145000",
    "fees": { "total": "3.50", "currency": "USD" },
    "wallet_address": "bc1qxy2kgdyxj..."
  }
}
```

| Field | Description |
|-------|-------------|
| `clientSecret` | **Use this** to render the embedded widget |
| `redirectUrl` | Fallback — use this only if embedded mode fails |
| `sessionId` | Session ID for status polling |
| `status` | `initialized`, `requires_payment`, `fulfillment_complete`, etc. |
| `transactionDetails` | Quote details (exact crypto amount, fees, etc.) |

### Get Session Status

```
GET /api/v1/crypto-payments/stripe-onramp/:sessionId
```

**Response:**
```json
{
  "id": "cos_abc123",
  "status": "fulfillment_complete",
  "client_secret": "cos_live_...",
  "transaction_details": {
    "destination_amount": "0.00145000",
    "source_amount": 100
  }
}
```

---

## Frontend Integration

### Option 1: Stripe.js (Vanilla JS / Any Framework)

**1. Load Stripe.js in your HTML:**
```html
<script src="https://js.stripe.com/v3/"></script>
```

**2. Initialize and render the onramp:**
```javascript
const stripe = Stripe('pk_live_YOUR_PUBLISHABLE_KEY');

async function openCryptoOnramp() {
  // Step 1: Create session via your backend
  const response = await fetch('/api/v1/crypto-payments/stripe-onramp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.REACT_APP_API_KEY,
    },
    body: JSON.stringify({
      sourceAmount: 100,
      sourceCurrency: 'USD',
      destinationCurrency: 'btc',
      destinationNetwork: 'bitcoin',
      walletAddress: 'bc1qxy2kgdyxj...',
    }),
  });

  const { clientSecret } = await response.json();

  // Step 2: Render embedded widget in a div
  const { error } = await stripe.confirmOnramp(clientSecret, {
    element: '#onramp-widget',
  });

  if (error) {
    console.error('Onramp failed:', error.message);
    showError(error.message);
  }
}
```

**3. Add a container div:**
```html
<div id="onramp-widget" style="width: 100%; height: 600px;"></div>
```

---

### Option 2: React (@stripe/react-stripe-js)

**1. Install packages:**
```bash
npm install @stripe/stripe-js @stripe/react-stripe-js
```

**2. Wrap your app with Elements provider:**
```tsx
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe('pk_live_YOUR_PUBLISHABLE_KEY');

function App() {
  return (
    <Elements stripe={stripePromise}>
      <CryptoOnrampPage />
    </Elements>
  );
}
```

**3. Create the onramp component:**
```tsx
import { useState } from 'react';
import {
  useStripe,
  EmbeddedOnramp,
} from '@stripe/react-stripe-js';

export function CryptoOnrampPage() {
  const stripe = useStripe();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateSession = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/crypto-payments/stripe-onramp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.REACT_APP_API_KEY,
        },
        body: JSON.stringify({
          sourceAmount: 100,
          sourceCurrency: 'USD',
          destinationCurrency: 'btc',
          destinationNetwork: 'bitcoin',
          walletAddress: 'bc1qxy2kgdyxj...',
          lockWalletAddress: true,
          settlementSpeed: 'instant',
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to create session');
      }

      const data = await response.json();
      setClientSecret(data.clientSecret);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {!clientSecret ? (
        <div>
          <h2>Buy Bitcoin</h2>
          <button onClick={handleCreateSession} disabled={loading}>
            {loading ? 'Loading...' : 'Continue to Payment'}
          </button>
          {error && <p style={{ color: 'red' }}>{error}</p>}
        </div>
      ) : (
        <EmbeddedOnramp
          clientSecret={clientSecret}
          onReady={() => console.log('Onramp widget ready')}
          onComplete={(event) => {
            console.log('Purchase complete:', event);
            // event.data contains:
            //   - session status
            //   - transaction details
            showSuccess('Crypto purchased successfully!');
          }}
          onError={(error) => {
            console.error('Onramp error:', error);
            setError(error.message);
          }}
        />
      )}
    </div>
  );
}
```

---

### Option 3: React with Full Custom UI

If you want a form-like experience where the user selects amount/crypto first:

```tsx
export function CryptoPurchaseForm() {
  const [amount, setAmount] = useState(100);
  const [crypto, setCrypto] = useState('btc');
  const [walletAddress, setWalletAddress] = useState('');
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const networks: Record<string, string> = {
    btc: 'bitcoin',
    eth: 'ethereum',
    usdc: 'polygon',  // USDC on Polygon for low fees
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const response = await fetch('/api/v1/crypto-payments/stripe-onramp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.REACT_APP_API_KEY,
      },
      body: JSON.stringify({
        sourceAmount: amount,
        sourceCurrency: 'USD',
        destinationCurrency: crypto,
        destinationNetwork: networks[crypto],
        walletAddress,
        lockWalletAddress: true,
      }),
    });

    const data = await response.json();
    setClientSecret(data.clientSecret);
  };

  if (clientSecret) {
    return (
      <EmbeddedOnramp
        clientSecret={clientSecret}
        onComplete={() => {
          // Reset form for next purchase
          setClientSecret(null);
          setAmount(100);
          setWalletAddress('');
        }}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Amount (USD):
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          min={1}
        />
      </label>

      <label>
        Cryptocurrency:
        <select value={crypto} onChange={(e) => setCrypto(e.target.value)}>
          <option value="btc">Bitcoin (BTC)</option>
          <option value="eth">Ethereum (ETH)</option>
          <option value="usdc">USD Coin (USDC)</option>
        </select>
      </label>

      <label>
        Wallet Address:
        <input
          type="text"
          value={walletAddress}
          onChange={(e) => setWalletAddress(e.target.value)}
          placeholder="Enter crypto wallet address"
          required
        />
      </label>

      <button type="submit">Buy Crypto</button>
    </form>
  );
}
```

---

## Webhook Handling (Backend → Frontend)

After the customer completes the purchase, Stripe fires a webhook to your backend. Your backend should then emit a WebSocket event to the POS frontend.

### WebSocket Event (from backend)

```typescript
// Listen on your POS socket connection
socket.on('crypto.purchased', (data) => {
  console.log('Crypto purchase complete:', data);
  // data.sessionId, data.amount, data.destinationCurrency, etc.
  showReceipt(data);
});

socket.on('crypto.failed', (data) => {
  console.error('Crypto purchase failed:', data);
  showError(data.errorMessage);
});
```

### Polling Fallback (if WebSocket is unreliable)

```tsx
// Poll session status until complete
useEffect(() => {
  if (!sessionId) return;

  const poll = setInterval(async () => {
    const res = await fetch(`/api/v1/crypto-payments/stripe-onramp/${sessionId}`);
    const session = await res.json();

    if (session.status === 'fulfillment_complete') {
      clearInterval(poll);
      showSuccess('Crypto delivered!');
    } else if (session.status === 'rejected' || session.status === 'expired') {
      clearInterval(poll);
      showError('Purchase failed or expired');
    }
  }, 3000); // every 3 seconds

  return () => clearInterval(poll);
}, [sessionId]);
```

---

## Supported Currencies & Networks

| Crypto | Network Options |
|--------|----------------|
| `btc` | `bitcoin` |
| `eth` | `ethereum` |
| `usdc` | `ethereum`, `polygon`, `arbitrum`, `optimism`, `base` |
| `sol` | `solana` |
| `matic` | `polygon` |
| `avax` | `avalanche_c_chain` |

Check the latest list: [Stripe Crypto Onramp docs](https://docs.stripe.com/crypto/onramp)

---

## Test Mode

Use Stripe's **test publishable key** (`pk_test_...`) and **test secret key** in your backend.

Test card numbers:
| Card | Number | Result |
|------|--------|--------|
| Success | `4242 4242 4242 4242` | Payment succeeds |
| Declined | `4000 0000 0000 0002` | Card declined |
| Requires 3DS | `4000 0025 0000 3155` | Triggers 3D Secure |

See full list: [Stripe test cards](https://docs.stripe.com/testing)

---

## UX Best Practices for POS

1. **Lock the wallet address** (`lockWalletAddress: true`) — prevents customer from changing it in the widget
2. **Use `settlementSpeed: "instant"`** — crypto delivers as soon as payment confirms (not after settlement)
3. **Show the quote before rendering the widget** — use `transactionDetails.destination_amount` from the response to show "You'll receive ~0.00145 BTC"
4. **Handle errors gracefully** — card declines, 3DS timeouts, session expiration
5. **Provide a receipt** — after completion, show transaction ID, crypto amount, wallet address, and timestamp
6. **Don't embed in a tiny iframe** — the widget needs at least 400px width and 500px height

---

## Error Handling

```tsx
const handleOnrampError = (error: any) => {
  switch (error.code) {
    case 'session_expired':
      return 'Session expired. Please start over.';
    case 'card_declined':
      return 'Card was declined. Please try another card.';
    case 'authentication_required':
      return '3D Secure authentication failed.';
    case 'unsupported_region':
      return 'Crypto purchases are not available in your region.';
    case 'wallet_address_invalid':
      return 'Invalid wallet address. Please check and try again.';
    default:
      return error.message || 'Something went wrong. Please try again.';
  }
};
```

---

## Complete Flow Summary

```
┌─────────────────────────────────────────────────┐
│  POS Screen                                      │
│                                                  │
│  1. Merchant selects:                            │
│     - Amount: $100 USD                           │
│     - Crypto: Bitcoin (BTC)                      │
│     - Network: Bitcoin                           │
│     - Wallet: bc1qxy2kgdy...                     │
│                                                  │
│  2. Frontend calls backend:                      │
│     POST /crypto-payments/stripe-onramp          │
│     → Returns clientSecret                       │
│                                                  │
│  3. Embedded widget renders INSIDE the POS:      │
│     ┌───────────────────────────────┐            │
│     │  Stripe Onramp Widget         │            │
│     │                               │            │
│     │  You'll receive: 0.00145 BTC  │            │
│     │  Cost: $100.00 USD            │            │
│     │                               │            │
│     │  [Card Number]                │            │
│     │  [Expiry] [CVC]               │            │
│     │                               │            │
│     │  [ Pay $100.00 ]              │            │
│     └───────────────────────────────┘            │
│                                                  │
│  4. Customer enters card → clicks Pay            │
│     (Stripe handles everything)                  │
│                                                  │
│  5. Webhook fires → WebSocket notifies POS       │
│     → Show receipt: "✅ BTC sent to wallet!"     │
│                                                  │
└─────────────────────────────────────────────────┘
```
