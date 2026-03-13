# CloudPOS Frontend Integration Guide

Complete guide for integrating CloudPOS payment endpoints with your frontend application.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Setup](#setup)
3. [Card-Not-Present (CNP) Integration](#card-not-present-cnp-integration)
4. [Card-Present (CP) Integration](#card-present-cp-integration)
5. [WebSocket Integration](#websocket-integration)
6. [Error Handling](#error-handling)
7. [Security Best Practices](#security-best-practices)
8. [Complete Examples](#complete-examples)

---

## 📖 Overview

### Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │     │   CloudPOS   │     │    Stripe    │
│  (React/Vue) │     │   Backend    │     │     API      │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       │ 1. Tokenize Card   │                    │
       ├────────────────────────────────────────>│
       │                    │                    │
       │ 2. PaymentMethod   │                    │
       │    ID (pm_*)       │                    │
       <─────────────────────────────────────────┤
       │                    │                    │
       │ 3. POST Payment    │                    │
       │    {paymentMethodToken}                 │
       ├───────────────────>│                    │
       │                    │                    │
       │                    │ 4. Charge Card     │
       │                    ├───────────────────>│
       │                    │                    │
       │                    │ 5. Auth Code       │
       │                    <───────────────────┤
       │                    │                    │
       │ 6. Success +       │                    │
       │    Auth Code       │                    │
       <───────────────────┤                    │
       │                    │                    │
       │ 7. WebSocket       │                    │
       │    Event           │                    │
       <───────────────────┤                    │
```

### Key Points

1. **Frontend NEVER sends raw card data to CloudPOS**
2. **Stripe.js tokenizes cards** → returns PaymentMethod ID
3. **CloudPOS receives PaymentMethod token** → charges via Stripe
4. **WebSocket provides real-time updates** → payment status

---

## 🛠️ Setup

### 1. Install Dependencies

```bash
# React
npm install @stripe/stripe-js socket.io-client axios

# Vue
npm install @stripe/stripe-js socket.io-client axios

# Vanilla JS
npm install @stripe/stripe-js socket.io-client
```

### 2. Environment Variables

```javascript
// .env
REACT_APP_STRIPE_PUBLIC_KEY=pk_test_...
REACT_APP_CLOUDPOS_API_URL=http://localhost:3000/api/v1
REACT_APP_CLOUDPOS_API_KEY=your-api-key
REACT_APP_CLOUDPOS_WS_URL=ws://localhost:3000/pos
```

### 3. Initialize Stripe

```javascript
// src/lib/stripe.js
import { loadStripe } from '@stripe/stripe-js';

export const stripe = await loadStripe(
  process.env.REACT_APP_STRIPE_PUBLIC_KEY
);
```

---

## 💳 Card-Not-Present (CNP) Integration

### Step 1: Create Payment Form

```jsx
// src/components/PaymentForm.jsx
import React, { useState } from 'react';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { stripe } from '../lib/stripe';

function PaymentForm({ amount, onSuccess, onError }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!stripe || !elements) return;

    setLoading(true);

    try {
      // 1. Create PaymentMethod from card details
      const {paymentMethod, error} = await stripe.createPaymentMethod({
        type: 'card',
        card: elements.getElement(CardElement),
      });

      if (error) {
        throw new Error(error.message);
      }

      // 2. Send PaymentMethod ID to CloudPOS
      const response = await fetch(`${process.env.REACT_APP_CLOUDPOS_API_URL}/cnp-payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.REACT_APP_CLOUDPOS_API_KEY,
          'Idempotency-Key': generateIdempotencyKey(),
        },
        body: JSON.stringify({
          amount: amount,
          currency: 'USD',
          paymentMethodToken: paymentMethod.id, // pm_1abc...
          transactionPin: '123456', // Get from user input
          cardholderName: 'John Doe',
          orderDescription: 'Order #12345',
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Payment failed');
      }

      // 3. Payment successful!
      onSuccess(result);

    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <CardElement />
      <input 
        type="password" 
        placeholder="Transaction PIN"
        maxLength={6}
        required
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Processing...' : `Pay $${amount}`}
      </button>
    </form>
  );
}

// Wrap with Elements provider
export default function PaymentFormWrapper(props) {
  return (
    <Elements stripe={stripe}>
      <PaymentForm {...props} />
    </Elements>
  );
}

function generateIdempotencyKey() {
  return 'txn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}
```

### Step 2: Use the Payment Form

```jsx
// src/pages/Checkout.jsx
import React from 'react';
import PaymentForm from '../components/PaymentForm';

function Checkout() {
  const handleSuccess = (result) => {
    console.log('Payment successful!', result);
    // Show receipt with authorization code
    alert(`Payment successful!\nAuth Code: ${result.authorizationCode}`);
  };

  const handleError = (error) => {
    console.error('Payment failed:', error);
    alert(`Payment failed: ${error.message}`);
  };

  return (
    <div>
      <h1>Checkout</h1>
      <PaymentForm 
        amount={50.00}
        onSuccess={handleSuccess}
        onError={handleError}
      />
    </div>
  );
}
```

---

## 🏪 Card-Present (CP) Integration

### For Modern Card Readers (Stripe Terminal)

```jsx
// src/components/CardReaderPayment.jsx
import React, { useState } from 'react';

function CardReaderPayment({ amount, onSuccess, onError }) {
  const [processing, setProcessing] = useState(false);

  const handleCardTap = async () => {
    setProcessing(true);

    try {
      // 1. Read card from physical reader
      // This depends on your card reader SDK
      const readerResult = await cardReader.readCard();
      
      // 2. Get PaymentMethod token from reader
      const paymentMethodToken = readerResult.paymentMethodId; // pm_1abc...

      // 3. Send to CloudPOS
      const response = await fetch(`${process.env.REACT_APP_CLOUDPOS_API_URL}/cp-payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.REACT_APP_CLOUDPOS_API_KEY,
        },
        body: JSON.stringify({
          amount: amount,
          currency: 'USD',
          paymentMethodToken: paymentMethodToken,
          last4: readerResult.last4,
          orderDescription: 'In-store purchase',
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message);
      }

      onSuccess(result);

    } catch (error) {
      onError(error);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div>
      <p>Ask customer to tap/insert card</p>
      <button onClick={handleCardTap} disabled={processing}>
        {processing ? 'Processing...' : 'Process Payment'}
      </button>
    </div>
  );
}
```

### For Legacy Terminals (Auth Code Only)

```jsx
// src/components/LegacyTerminalPayment.jsx
import React, { useState } from 'react';

function LegacyTerminalPayment({ amount, onSuccess, onError }) {
  const [authCode, setAuthCode] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await fetch(`${process.env.REACT_APP_CLOUDPOS_API_URL}/cp-payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.REACT_APP_CLOUDPOS_API_KEY,
        },
        body: JSON.stringify({
          amount: amount,
          currency: 'USD',
          authorizationCode: authCode, // From terminal display
          orderDescription: 'In-store purchase',
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message);
      }

      onSuccess(result);

    } catch (error) {
      onError(error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Authorization Code (6 digits)"
        value={authCode}
        onChange={(e) => setAuthCode(e.target.value)}
        maxLength={6}
        required
      />
      <button type="submit">Record Payment</button>
    </form>
  );
}
```

---

## 📡 WebSocket Integration

### Create WebSocket Service

```javascript
// src/services/websocket.js
import io from 'socket.io-client';

class WebSocketService {
  constructor() {
    this.socket = null;
    this.callbacks = {
      onSettled: null,
      onFailed: null,
      onAuthorized: null,
      onRefund: null,
      onChargeback: null,
    };
  }

  connect(jwtToken) {
    this.socket = io(process.env.REACT_APP_CLOUDPOS_WS_URL, {
      auth: { token: jwtToken },
      transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      console.log('✅ WebSocket connected');
    });

    this.socket.on('disconnect', () => {
      console.log('❌ WebSocket disconnected');
    });

    // Payment events
    this.socket.on('payment.settled', (data) => {
      console.log('💰 Payment settled:', data);
      if (this.callbacks.onSettled) {
        this.callbacks.onSettled(data);
      }
    });

    this.socket.on('payment.failed', (data) => {
      console.error('❌ Payment failed:', data);
      if (this.callbacks.onFailed) {
        this.callbacks.onFailed(data);
      }
    });

    this.socket.on('payment.authorized', (data) => {
      console.log('🔐 Payment authorized:', data);
      if (this.callbacks.onAuthorized) {
        this.callbacks.onAuthorized(data);
      }
    });

    this.socket.on('refund.processed', (data) => {
      console.log('💵 Refund processed:', data);
      if (this.callbacks.onRefund) {
        this.callbacks.onRefund(data);
      }
    });

    this.socket.on('chargeback.received', (data) => {
      console.warn('⚠️ Chargeback received:', data);
      if (this.callbacks.onChargeback) {
        this.callbacks.onChargeback(data);
      }
    });

    return this;
  }

  onSettled(callback) {
    this.callbacks.onSettled = callback;
    return this;
  }

  onFailed(callback) {
    this.callbacks.onFailed = callback;
    return this;
  }

  onAuthorized(callback) {
    this.callbacks.onAuthorized = callback;
    return this;
  }

  onRefund(callback) {
    this.callbacks.onRefund = callback;
    return this;
  }

  onChargeback(callback) {
    this.callbacks.onChargeback = callback;
    return this;
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
    }
  }
}

export const websocket = new WebSocketService();
```

### Use WebSocket in Component

```jsx
// src/components/PaymentListener.jsx
import React, { useEffect, useState } from 'react';
import { websocket } from '../services/websocket';

function PaymentListener({ onPaymentComplete }) {
  const [status, setStatus] = useState('waiting');

  useEffect(() => {
    // Get JWT token from localStorage or auth context
    const jwtToken = localStorage.getItem('jwt_token');

    // Connect to WebSocket
    websocket
      .connect(jwtToken)
      .onSettled((data) => {
        setStatus('success');
        console.log('Payment settled:', data);
        
        // Show success UI
        onPaymentComplete({
          success: true,
          authorizationCode: data.authorizationCode,
          amount: data.amount,
          cardScheme: data.cardScheme,
          last4: data.last4,
        });
      })
      .onFailed((data) => {
        setStatus('failed');
        console.error('Payment failed:', data);
        
        // Show error UI
        onPaymentComplete({
          success: false,
          error: data.errorMessage,
          code: data.declineCode,
        });
      });

    // Cleanup on unmount
    return () => {
      websocket.disconnect();
    };
  }, []);

  return (
    <div className="payment-status">
      {status === 'waiting' && <p>Waiting for payment...</p>}
      {status === 'processing' && <p>Processing payment...</p>}
      {status === 'success' && <p className="success">✅ Payment successful!</p>}
      {status === 'failed' && <p className="error">❌ Payment failed</p>}
    </div>
  );
}
```

---

## ❌ Error Handling

### Payment Error Types

```javascript
// src/utils/paymentErrors.js

export const paymentErrorMessages = {
  // Card errors
  card_declined: 'Card was declined. Please try a different card.',
  insufficient_funds: 'Insufficient funds. Please try a different card.',
  expired_card: 'Card has expired. Please update card details.',
  incorrect_cvc: 'Card security code is incorrect.',
  processing_error: 'Error processing payment. Please try again.',
  
  // Authentication errors
  authentication_required: '3D Secure authentication required.',
  invalid_pin: 'Invalid transaction PIN. Please try again.',
  
  // Validation errors
  amount_too_low: 'Amount must be at least $0.50.',
  invalid_card: 'Invalid card number. Please check and try again.',
  duplicate_transaction: 'Duplicate transaction detected.',
  
  // System errors
  network_error: 'Network error. Please check your connection.',
  server_error: 'Server error. Please try again later.',
};

export function getPaymentErrorMessage(error) {
  // Stripe error codes
  if (error.code && paymentErrorMessages[error.code]) {
    return paymentErrorMessages[error.code];
  }
  
  // Decline codes
  if (error.declineCode && paymentErrorMessages[error.declineCode]) {
    return paymentErrorMessages[error.declineCode];
  }
  
  // Default message
  return error.message || 'Payment failed. Please try again.';
}
```

### Use in Component

```jsx
import { getPaymentErrorMessage } from '../utils/paymentErrors';

function PaymentForm() {
  const handleError = (error) => {
    const userMessage = getPaymentErrorMessage(error);
    
    // Show user-friendly message
    alert(userMessage);
    
    // Log full error for debugging
    console.error('Payment error:', error);
  };

  // ... rest of component
}
```

---

## 🔐 Security Best Practices

### 1. Never Log Card Data

```javascript
// ❌ WRONG
console.log('Card:', cardNumber);

// ✅ CORRECT
console.log('PaymentMethod:', paymentMethodId);
```

### 2. Use HTTPS in Production

```javascript
// .env.production
REACT_APP_CLOUDPOS_API_URL=https://your-domain.com/api/v1
REACT_APP_CLOUDPOS_WS_URL=wss://your-domain.com/pos
```

### 3. Store API Keys Securely

```javascript
// ❌ WRONG - Don't hardcode
const API_KEY = 'dd4027c293...';

// ✅ CORRECT - Use environment variables
const API_KEY = process.env.REACT_APP_CLOUDPOS_API_KEY;
```

### 4. Validate Amounts on Backend

```javascript
// Frontend - for display only
const amount = 50.00;

// Backend - always validate
if (amount <= 0 || amount > MAX_AMOUNT) {
  throw new Error('Invalid amount');
}
```

### 5. Use Idempotency Keys

```javascript
function generateIdempotencyKey() {
  return 'txn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Use in request
headers: {
  'Idempotency-Key': generateIdempotencyKey(),
}
```

---

## 📝 Complete Examples

### React App Example

```jsx
// src/App.jsx
import React, { useState } from 'react';
import PaymentForm from './components/PaymentForm';
import PaymentListener from './components/PaymentListener';
import Receipt from './components/Receipt';

function App() {
  const [paymentResult, setPaymentResult] = useState(null);

  const handlePaymentComplete = (result) => {
    setPaymentResult(result);
  };

  return (
    <div className="App">
      <h1>CloudPOS Payment Terminal</h1>
      
      {!paymentResult ? (
        <>
          <PaymentForm 
            amount={50.00}
            onSuccess={(result) => handlePaymentComplete({ success: true, ...result })}
            onError={(error) => handlePaymentComplete({ success: false, error })}
          />
          <PaymentListener onPaymentComplete={handlePaymentComplete} />
        </>
      ) : (
        <Receipt 
          result={paymentResult}
          onNewPayment={() => setPaymentResult(null)}
        />
      )}
    </div>
  );
}

export default App;
```

### Vue 3 Example

```vue
<!-- src/components/PaymentForm.vue -->
<template>
  <div>
    <div ref="cardElement"></div>
    <input 
      v-model="pin"
      type="password"
      placeholder="Transaction PIN"
      maxlength="6"
    />
    <button @click="handleSubmit" :disabled="loading">
      {{ loading ? 'Processing...' : `Pay $${amount}` }}
    </button>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { loadStripe } from '@stripe/stripe-js';

const props = defineProps({
  amount: Number,
});

const emit = defineEmits(['success', 'error']);

const stripe = ref(null);
const cardElement = ref(null);
const pin = ref('');
const loading = ref(false);

onMounted(async () => {
  stripe.value = await loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);
  
  const elements = stripe.value.elements();
  const card = elements.create('card');
  card.mount(cardElement.value);
});

const handleSubmit = async () => {
  loading.value = true;
  
  try {
    const {paymentMethod, error} = await stripe.value.createPaymentMethod({
      type: 'card',
      card: cardElement.value,
    });

    if (error) throw new Error(error.message);

    const response = await fetch(`${import.meta.env.VITE_CLOUDPOS_API_URL}/cnp-payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': import.meta.env.VITE_CLOUDPOS_API_KEY,
      },
      body: JSON.stringify({
        amount: props.amount,
        currency: 'USD',
        paymentMethodToken: paymentMethod.id,
        transactionPin: pin.value,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message);
    }

    emit('success', result);

  } catch (error) {
    emit('error', error);
  } finally {
    loading.value = false;
  }
};
</script>
```

---

## 🧪 Testing

### Test Card Numbers

Use these test cards with Stripe.js:

| Card | Number | Use Case |
|------|--------|----------|
| Visa | 4242 4242 4242 4242 | Success |
| Decline | 4000 0000 0000 0002 | Insufficient funds |
| Expired | 4000 0000 0000 0069 | Expired card |

### Test Flow

```javascript
// 1. Success
Card: 4242424242424242
Expiry: 12/25
CVC: 123
Expected: payment.settled event

// 2. Decline
Card: 4000000000000002
Expiry: 12/25
CVC: 123
Expected: payment.failed event
```

---

## 📞 Support

- 📚 API Docs: `PAYMENT_API_DOCS.md`
- 🔌 WebSocket Docs: `WEBSOCKET_EVENTS.md`
- 🃏 Test Cards: `TEST_CARDS.md`
- 📧 Support: support@cloudpos.io

---

**Last Updated:** March 13, 2026  
**SDK Version:** Stripe.js v3  
**WebSocket:** Socket.IO v4
