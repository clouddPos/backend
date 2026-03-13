# CloudPOS WebSocket Events Documentation

Real-time payment notifications for frontend applications.

---

## 📡 Overview

CloudPOS emits WebSocket events for all payment-related activities. Your frontend can subscribe to these events to show real-time updates to merchants and customers.

---

## 🔌 Connection

### Endpoint

```
ws://localhost:3000/pos
```

### Authentication

Connect with a JWT token in the handshake:

```javascript
import io from 'socket.io-client';

const socket = io('ws://localhost:3000/pos', {
  auth: {
    token: 'your-jwt-token-here',
  },
  transports: ['websocket'],
});

socket.on('connect', () => {
  console.log('Connected to CloudPOS WebSocket');
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
});
```

---

## 📤 Payment Events

### 1. `payment.authorized`

Emitted when a payment is authorized (funds held but not captured).

**Use Case:** Pre-authorization transactions (hotels, car rentals)

```javascript
socket.on('payment.authorized', (data) => {
  console.log('Payment Authorized:', data);
  // {
  //   transactionId: 'txn_abc123',
  //   authorizationCode: 'H12345',
  //   amount: 100.00,
  //   currency: 'USD',
  //   last4: '4242',
  //   cardScheme: 'VISA',
  //   status: 'AUTHORIZED'
  // }
});
```

### 2. `payment.settled` ⭐

Emitted when a payment is successfully settled (funds transferred).

**Use Case:** Show success message, print receipt, update UI

```javascript
socket.on('payment.settled', (data) => {
  console.log('Payment Settled:', data);
  // {
  //   transactionId: 'txn_abc123',
  //   authorizationCode: 'H12345',      // ← Bank approval code
  //   amount: 50.00,
  //   currency: 'USD',
  //   last4: '4242',
  //   cardScheme: 'VISA',
  //   settledAt: '2026-03-13T10:30:00.000Z',
  //   gatewayReference: 'pi_3QRS123'
  // }
  
  // Show success message
  showReceipt({
    authCode: data.authorizationCode,
    amount: data.amount,
    card: `${data.cardScheme} ending in ${data.last4}`,
    timestamp: new Date(data.settledAt).toLocaleString(),
  });
});
```

### 3. `payment.failed`

Emitted when a payment fails (card declined, insufficient funds, etc.)

**Use Case:** Show error message, prompt for different payment method

```javascript
socket.on('payment.failed', (data) => {
  console.log('Payment Failed:', data);
  // {
  //   transactionId: 'txn_abc123',
  //   errorCode: 'card_declined',
  //   errorMessage: 'Card was declined: insufficient_funds',
  //   declineCode: 'insufficient_funds',
  //   amount: 50.00,
  //   currency: 'USD'
  // }
  
  // Show error to customer
  showError({
    title: 'Payment Declined',
    message: data.errorMessage,
    code: data.declineCode,
    suggestion: 'Please try a different card or payment method',
  });
});
```

---

## 💰 Refund Events

### 4. `refund.processed`

Emitted when a refund is successfully processed.

**Use Case:** Notify merchant that refund completed

```javascript
socket.on('refund.processed', (data) => {
  console.log('Refund Processed:', data);
  // {
  //   transactionId: 'txn_abc123',
  //   refundId: 're_1abc123',
  //   amount: 50.00,
  //   currency: 'USD',
  //   reason: 'requested_by_customer'
  // }
  
  // Update transaction status in UI
  updateTransactionStatus(data.transactionId, 'REFUNDED');
});
```

---

## ⚠️ Dispute Events

### 5. `chargeback.received`

Emitted when a customer disputes a charge (chargeback).

**Use Case:** Alert merchant to respond to dispute

```javascript
socket.on('chargeback.received', (data) => {
  console.log('Chargeback Received:', data);
  // {
  //   transactionId: 'txn_abc123',
  //   chargebackId: 'dp_1abc123',
  //   amount: 50.00,
  //   currency: 'USD',
  //   reason: 'fraudulent',
  //   dueDate: '2026-03-20T10:30:00.000Z'
  // }
  
  // Alert merchant
  alertMerchant({
    type: 'URGENT',
    title: 'Chargeback Received',
    message: `Customer disputed transaction ${data.transactionId}`,
    reason: data.reason,
    amount: data.amount,
    dueDate: new Date(data.dueDate).toLocaleDateString(),
    action: 'Submit evidence before due date',
  });
});
```

---

## 🔄 Legacy Events (Still Supported)

### 6. `transaction.settled`

Legacy event for settled transactions (same as `payment.settled`).

### 7. `transaction.authorized`

Legacy event for authorized transactions (same as `payment.authorized`).

### 8. `offline.sync.complete`

Emitted when offline transactions are synced to the cloud.

---

## 🎯 Frontend Integration Examples

### React Hook

```jsx
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

const SOCKET_URL = 'ws://localhost:3000/pos';

export function usePaymentSocket() {
  const [socket, setSocket] = useState(null);
  const [lastPayment, setLastPayment] = useState(null);

  useEffect(() => {
    // Connect to WebSocket
    const token = localStorage.getItem('jwt_token');
    const newSocket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
    });

    newSocket.on('connect', () => {
      console.log('WebSocket connected');
    });

    // Listen for payment events
    newSocket.on('payment.settled', (data) => {
      console.log('Payment settled:', data);
      setLastPayment({ type: 'success', data });
      
      // Play success sound
      playSuccessSound();
      
      // Show notification
      showNotification('Payment Successful!', data.authorizationCode);
    });

    newSocket.on('payment.failed', (data) => {
      console.log('Payment failed:', data);
      setLastPayment({ type: 'error', data });
      
      // Play error sound
      playErrorSound();
      
      // Show error notification
      showNotification('Payment Failed', data.errorMessage);
    });

    setSocket(newSocket);

    // Cleanup
    return () => {
      newSocket.close();
    };
  }, []);

  return { socket, lastPayment };
}

// Usage in component
function PaymentTerminal() {
  const { lastPayment } = usePaymentSocket();

  useEffect(() => {
    if (lastPayment?.type === 'success') {
      // Show receipt modal
      setShowReceiptModal(true);
    } else if (lastPayment?.type === 'error') {
      // Show error modal
      setShowErrorModal(true);
    }
  }, [lastPayment]);

  return (
    <div>
      {/* Payment form */}
    </div>
  );
}
```


## 🧪 Testing WebSocket Events

### Using Socket.IO Client

```javascript
// Test connection
const socket = io('ws://localhost:3000/pos', {
  auth: { token: 'your-test-token' },
});

socket.on('connect', () => {
  console.log('Connected!');
});

socket.on('payment.settled', (data) => {
  console.log('Received payment.settled:', data);
});

socket.on('payment.failed', (data) => {
  console.log('Received payment.failed:', data);
});

// Make a payment to trigger event
fetch('http://localhost:3000/api/v1/cnp-payments', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'your-api-key',
  },
  body: JSON.stringify({
    amount: 50.00,
    currency: 'USD',
    cardNumber: '4242424242424242',
    expiryDate: '12/25',
    cvv: '123',
    transactionPin: '123456',
  }),
});
```

---

## 📊 Event Flow Diagram

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │     │  CloudPOS    │     │    Stripe    │
│  (WebSocket) │     │   Backend    │     │  Webhook     │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       │ Connect            │                    │
       ├───────────────────>│                    │
       │                    │                    │
       │                    │ Payment Intent     │
       │                    │ Succeeded          │
       │                    ├────────────────────┤
       │                    │                    │
       │ payment.settled    │                    │
       │<───────────────────┤                    │
       │                    │                    │
       │ Show Success UI    │                    │
       │                    │                    │
```

---

## 🔐 Security Best Practices

1. **Always use JWT authentication** for WebSocket connections
2. **Validate token on connection** - reject invalid tokens
3. **Use WSS (WebSocket Secure)** in production
4. **Implement rate limiting** to prevent abuse
5. **Subscribe to merchant-specific rooms** for data isolation

---

## 📝 Summary

| Event | When | Frontend Action |
|-------|------|-----------------|
| `payment.settled` | Payment successful | Show receipt, play success sound |
| `payment.failed` | Payment declined | Show error, prompt for new card |
| `payment.authorized` | Pre-auth approved | Show hold confirmation |
| `refund.processed` | Refund completed | Update transaction status |
| `chargeback.received` | Dispute received | Alert merchant, submit evidence |

---

**Last Updated:** March 13, 2026  
**Socket.IO Version:** 4.x
