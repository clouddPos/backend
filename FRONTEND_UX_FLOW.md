# CloudPOS Frontend UX Flow Documentation

Complete user journey from PIN entry to all payment flows.

---

## 🔐 Authentication System

### How It Works

```
Frontend: Has API Key (stored in localStorage)
Backend:  Has Merchant ID + API Key (in .env)
User:     Only enters PIN
```

**NO email/password login!** Just PIN.

### Setup (One-Time)

1. Add to frontend `.env`: `REACT_APP_API_KEY=[key]`
2. Add to the frontend `.env`: `REACT_APP_API_URL=[backendUrl]`
3. Frontend stores `REACT_APP_API_KEY` in localStorage


---

## 📱 Section 1: Authentication Flow

### Screen 1.1: PIN Entry (Main Entry Point)

```
┌─────────────────────────────────────────┐
│          CloudPOS                       │
├─────────────────────────────────────────┤
│                                         │
│  Welcome to CloudPOS                    │
│                                         │
│  Please enter your 6-digit              │
│  Transaction PIN to continue.           │
│                                         │
│  PIN: [●][●][●][●][●][●]               │
│                                         │
│  [1] [2] [3]                            │
│  [4] [5] [6]                            │
│  [7] [8] [9]                            │
│  [   0   ] [←]                          │
│                                         │
│  Attempts remaining: ●●●●○              │
│                                         │
│  [      Enter      ]                    │
│                                         │
│  Forgot PIN? Contact administrator      │
│                                         │
└─────────────────────────────────────────┘
```

**Flow:**
1. Frontend loads, retrieves API key from localStorage
2. User enters 6-digit PIN using keypad
3. System validates PIN format (must be 6 digits)
4. On submit:
   ```javascript
   // Frontend automatically includes API key
   POST /api/v1/auth/verify-pin
   Headers:
     x-api-key: [from localStorage]
   Body:
     { pin: "123456" }
   ```
5. **Backend:**
   - API key middleware identifies merchant from `pos.merchantId` config
   - Verifies PIN against `transactionPinHash`
   - Returns JWT token + merchant info
6. **If PIN correct:**
   - Store JWT token
   - Navigate to **Screen 2: Dashboard**
   - Reset failed attempt counter
7. **If PIN wrong:**
   - Show error: "Invalid PIN. X attempts remaining."
   - Decrement attempt counter
   - Clear PIN input
8. **If 5 failed attempts:**
   - Show: "Account locked. Try again in 15 minutes."
   - Disable PIN input
   - Show countdown timer

**NO email/password!** Just PIN.

---

### Screen 1.2: First-Time PIN Setup

```
┌─────────────────────────────────────────┐
│      Setup Transaction PIN              │
├─────────────────────────────────────────┤
│                                         │
│  Welcome! Let's set up your             │
│  transaction PIN.                       │
│                                         │
│  This PIN will be required for:         │
│  ✓ Processing payments                  │
│  ✓ Viewing balances                     │
│  ✓ Refunds and reversals                │
│  ✓ Admin settings                       │
│                                         │
│  Enter PIN: [●][●][●][●][●][●]         │
│                                         │
│  Confirm PIN: [●][●][●][●][●][●]       │
│                                         │
│  [      Set PIN      ]                  │
│                                         │
│  ⚠️  Don't forget your PIN!             │
│     Recovery requires admin access.     │
│                                         │
└─────────────────────────────────────────┘
```

**When This Shows:**
- Merchant has `transactionPinHash = null` in database
- First time using the system
- PIN was reset by admin

**Flow:**
1. User enters 6-digit PIN twice
2. System validates:
   - Both fields are 6 digits
   - Both fields match
   - PIN is not weak (e.g., 123456, 000000)
3. On submit:
   ```javascript
   POST /api/v1/merchant/set-pin
   Headers:
     x-api-key: [from localStorage]
   Body:
     { pin: "123456" }
   ```
4. Backend hashes PIN and stores in `transactionPinHash`
5. **If successful:**
   - Show success message
   - Navigate to **Screen 2: Dashboard**
6. **If failed:**
   - Show error message
   - Clear both fields

---

## 📊 Section 2: Dashboard

### Screen 2: Main Dashboard

```
┌─────────────────────────────────────────────────────────┐
│  CloudPOS                                    [Profile▼] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────┐                                       │
│  │  NAVIGATION │  ┌─────────────────────────────────┐  │
│  │             │  │      QUICK STATS                │  │
│  │ 📊 Dashboard│  │                                 │  │
│  │ 💳 Payments │  │  Today's Revenue    ₦45,250    │  │
│  │   ├─ Card   │  │  Transactions       23         │  │
│  │   ├─ Crypto │  │  Success Rate       95.7%      │  │
│  │   └─ Offline│  │                                 │  │
│  │             │  └─────────────────────────────────┘  │
│  │ 📜 History  │                                       │
│  │   ├─ Card   │  ┌─────────────────────────────────┐  │
│  │   ├─ Crypto │  │  RECENT TRANSACTIONS            │  │
│  │   └─ All    │  │                                 │  │
│  │ 💰 Balances │  │  ✅ ₦5,000  - Card  - 10:23am  │  │
│  │             │  │  ✅ ₦12,500 - Crypto- 10:15am  │  │
│  │ ⛓️ Blockchain│  │  ⏳ ₦3,000  - Pending- 10:05am  │  │
│  │             │  │  ❌ ₦2,500  - Failed- 9:45am   │  │
│  │ ⚙️ Settings │  │                                 │  │
│  │   ├─ PIN    │  │  [View All Transactions →]      │  │
│  │   ├─ Profile│  └─────────────────────────────────┘  │
│  │   └─ Admin  │                                       │
│  │             │                                       │
│  └─────────────┘                                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Navigation Items:**

| Menu Item | PIN Required | Description |
|-----------|--------------|-------------|
| 📊 Dashboard | ❌ No | Overview stats (no sensitive data) |
| 💳 Payments → Card Present | ✅ Yes | Process in-person card payments |
| 💳 Payments → Card Not Present | ✅ Yes | Process remote card payments |
| 💳 Payments → Crypto | ✅ Yes | Process crypto payments |
| 💳 Payments → Offline Sync | ✅ Yes | Sync offline transactions |
| 📜 History → Card | ✅ Yes | View card payment history |
| 📜 History → Crypto | ✅ Yes | View crypto payment history |
| 📜 History → All | ✅ Yes | View all transactions |
| 💰 Balances | ✅ Yes | View all gateway balances |
| ⛓️ Blockchain | ✅ Yes | View blockchain settlement records |
| ⚙️ Settings → PIN | ✅ Yes | Change transaction PIN |
| ⚙️ Settings → Profile | ❌ No | Update business info |
| ⚙️ Settings → Admin | ✅ Yes | Admin panel (if authorized) |

---

## 💳 Section 3: Card Payments

### Screen 3.1: Payment Type Selection

```
┌─────────────────────────────────────────┐
│      Select Payment Type                │
├─────────────────────────────────────────┤
│                                         │
│  How will the customer pay?             │
│                                         │
│  ┌─────────────────┐  ┌───────────────┐ │
│  │  💳 Card Present│  │  💻 Card Not  │ │
│  │                 │  │     Present   │ │
│  │  Customer has   │  │               │ │
│  │  physical card  │  │  Remote/Online│ │
│  │                 │  │  payment      │ │
│  │  [Select →]     │  │               │ │
│  │                 │  │  [Select →]   │ │
│  └─────────────────┘  └───────────────┘ │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  ℹ️  What's the difference?     │    │
│  │                                 │    │
│  │  Card Present: Customer taps/   │    │
│  │  inserts card on reader         │    │
│  │                                 │    │
│  │  Card Not Present: You enter    │    │
│  │  card details manually          │    │
│  └─────────────────────────────────┘    │
│                                         │
└─────────────────────────────────────────┘
```

**Flow:**
1. Merchant selects payment type
2. **If Card Present:** Navigate to **Screen 3.2: CP Payment**
3. **If Card Not Present:** Navigate to **Screen 3.3: CNP Payment**

---

### Screen 3.2: Card-Present (CP) Payment Flow

```
┌─────────────────────────────────────────────────────────┐
│  Card-Present Payment                       [Cancel]    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  STEP 1: Enter Amount                                   │
│  ─────────────────                                      │
│                                                         │
│  Currency: [NGN ▼]  Amount: [₦ _______]                │
│                                                         │
│  Quick Amounts:                                         │
│  [₦500] [₦1,000] [₦2,000] [₦5,000] [₦10,000]          │
│                                                         │
│  [  Continue to Payment  ]                              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**STEP 1 Flow:**
1. Merchant selects currency (NGN, USD, EUR, etc.)
2. Merchant enters amount
3. System validates:
   - Amount > minimum for currency (e.g., ₦50 for NGN)
   - Amount is valid number
4. Click "Continue to Payment"
5. Navigate to **Screen 3.2b: Card Reader**

---

```
┌─────────────────────────────────────────────────────────┐
│  Card-Present Payment                       [Cancel]    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  STEP 2: Customer Inserts/Taps Card                     │
│  ─────────────────────────────────                      │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │                                                 │   │
│  │         💳 [Card Animation]                     │   │
│  │                                                 │   │
│  │     Please insert, tap, or swipe card           │   │
│  │                                                 │   │
│  │     [Waiting for card...]                       │   │
│  │                                                 │   │
│  │     ━━━━━━━━━━━━━━━━                            │   │
│  │     Processing...                               │   │
│  │                                                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Card Details:                                          │
│  Card: **** **** **** 4242                             │
│  Type: VISA                                            │
│                                                         │
│  [  Cancel Transaction  ]                               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**STEP 2 Flow:**
1. **If using card reader:**
   - Customer inserts/taps/swipes card on physical reader
   - Reader creates PaymentMethod token
   - Token sent to backend automatically
   - System displays last 4 digits when card read

2. **If manual entry (fallback):**
   - Show card number input
   - Show expiry date input
   - Show CVV input
   - System tokenizes via Stripe.js
   - NEVER store raw card data

3. System shows:
   - Card type (VISA, Mastercard, etc.)
   - Last 4 digits
   - "Processing..." animation

4. Navigate to **Screen 3.2c: PIN Entry**

---

```
┌─────────────────────────────────────────────────────────┐
│  Card-Present Payment                       [Cancel]    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  STEP 3: Customer Enters PIN                            │
│  ─────────────────────────                              │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │                                                 │   │
│  │         🔒 [Lock Icon]                          │   │
│  │                                                 │   │
│  │     Please enter your card PIN                  │   │
│  │                                                 │   │
│  │     PIN: [●][●][●][●]                           │   │
│  │                                                 │   │
│  │     [1] [2] [3]                                 │   │
│  │     [4] [5] [6]                                 │   │
│  │     [7] [8] [9]                                 │   │
│  │     [   0   ] [←]                               │   │
│  │                                                 │   │
│  │     Attempts: ●●●○○                             │   │
│  │                                                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Amount: ₦5,000.00                                     │
│  Card: VISA ending in 4242                             │
│                                                         │
│  [  Cancel Transaction  ]                               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**STEP 3 Flow:**
1. Customer enters 4-6 digit PIN on PIN pad
2. **PIN is encrypted INSIDE the card reader**
3. **Merchant/CloudPOS NEVER sees the actual PIN**
4. Encrypted PIN sent to bank for verification
5. Bank responds:
   - ✅ **Approved:** Continue to **Screen 3.2d: Processing**
   - ❌ **Declined:** Show decline reason, return to STEP 1
6. If 3 failed PIN attempts:
   - Card locked by bank
   - Show: "Card locked. Please contact your bank."
   - Return to STEP 1

---

```
┌─────────────────────────────────────────────────────────┐
│  Card-Present Payment                       [Cancel]    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  STEP 4: Processing Payment                             │
│  ─────────────────────────                              │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │                                                 │   │
│  │         ⏳ [Spinning Loader]                    │   │
│  │                                                 │   │
│  │     Contacting bank...                          │   │
│  │     Verifying funds...                          │   │
│  │     Processing payment...                       │   │
│  │                                                 │   │
│  │     Please wait, do not remove card.            │   │
│  │                                                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Transaction Details:                                   │
│  Amount: ₦5,000.00                                     │
│  Card: VISA ending in 4242                             │
│  Auth Code: [Waiting...]                               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**STEP 4 Flow:**
1. Backend sends payment to Stripe/payment processor
2. Stripe contacts customer's bank
3. Bank verifies:
   - Card is valid
   - PIN is correct
   - Sufficient funds available
   - No fraud flags
4. Bank responds with:
   - **Authorization Code** (e.g., `H12345`)
   - **Approval/Decline status**
5. Backend receives response
6. **If approved:**
   - Transaction marked as SETTLED
   - Authorization code stored
   - Navigate to **Screen 3.2e: Success**
7. **If declined:**
   - Show decline reason
   - Return to STEP 1

---

```
┌─────────────────────────────────────────────────────────┐
│  Payment Successful!                        [Done]      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │                                                 │   │
│  │         ✅ [Success Checkmark]                  │   │
│  │                                                 │   │
│  │         PAYMENT APPROVED                        │   │
│  │                                                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Receipt Details:                                       │
│  ─────────────────                                      │
│  Transaction ID: txn_abc123xyz                         │
│  Authorization Code: H12345                            │
│  Amount: ₦5,000.00                                     │
│  Card: VISA ending in 4242                             │
│  Date: Mar 13, 2026 10:30 AM                           │
│  Status: SETTLED                                       │
│                                                         │
│  [  📧 Email Receipt  ]  [  🖨️ Print  ]               │
│                                                         │
│  [     Done - New Payment     ]                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**STEP 5 Flow:**
1. Show success screen with:
   - Transaction ID
   - **Authorization Code** (important for records)
   - Amount, card type, last 4
   - Date/time
   - Status
2. Options:
   - Email receipt to customer
   - Print receipt
   - Start new payment
3. Transaction complete!

---

### Screen 3.3: Card-Not-Present (CNP) Payment Flow

```
┌─────────────────────────────────────────────────────────┐
│  Card-Not-Present Payment                   [Cancel]    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  STEP 1: Enter Payment Details                          │
│  ─────────────────────────────                          │
│                                                         │
│  Amount: [₦ _______]   Currency: [NGN ▼]               │
│                                                         │
│  Card Number:                                           │
│  [____ ____ ____ ____]                                  │
│                                                         │                                      │
                           
│                                                         │
│  Expiry Date:      CVV:                                 │
│  [MM/YY]          [___]                                 │
│                                                         │
│  ⚠️  Security Notice:                                   │
│  Card details are tokenized via Stripe.js               │
│  and NEVER stored on our servers.                       │
│                                                         │
│  [  Continue  ]                                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**STEP 1 Flow:**
1. Merchant enters:
   - Amount and currency
   - Customer's card number
   - Cardholder name
   - Expiry date
   - CVV code
2. **IMPORTANT - Tokenization:**
   - When card number is entered, Stripe.js creates a token
   - Raw card number NEVER leaves the browser
   - Only token (e.g., `pm_1abc123`) is sent to backend
   - This is PCI compliant
3. System validates:
   - Card number passes Luhn algorithm
   - Expiry is in future
   - CVV is 3-4 digits
   - Amount > minimum
4. Click "Continue"
5. Navigate to **Screen 3.3b: Merchant PIN**

---

```
┌─────────────────────────────────────────────────────────┐
│  Card-Not-Present Payment                   [Cancel]    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  STEP 2: Enter Transaction PIN                          │
│  ─────────────────────────                              │
│                                                         │
│  ⚠️  Transaction PIN Required                           │
│                                                         │
│  For security, please enter your                        │
│  6-digit transaction PIN to process                     │
│  this remote payment.                                   │
│                                                         │
│  PIN: [●][●][●][●][●][●]                               │
│                                                         │
│  [1] [2] [3]                                            │
│  [4] [5] [6]                                            │
│  [7] [8] [9]                                            │
│  [   0   ] [←]                                          │
│                                                         │
│  Amount: ₦5,000.00                                     │
│  Card: **** **** **** 4242                             │
│                                                         │
│  [  Process Payment  ]                                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**STEP 2 Flow:**
1. Merchant enters their 6-digit transaction PIN
2. System validates PIN format (6 digits)
3. On submit:
   - Send to backend:
     - PaymentMethod token (from STEP 1)
     - Amount, currency
     - **Transaction PIN** (in `X-Transaction-PIN` header)
4. Backend verifies PIN:
   - **If correct:** Continue to **Screen 3.3c: Processing**
   - **If wrong:** Show error, clear PIN, allow retry
   - **If 5 failed attempts:** Lock account for 15 minutes

---

```
┌─────────────────────────────────────────────────────────┐
│  Card-Not-Present Payment                   [Cancel]    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  STEP 3: Processing Payment                             │
│  ─────────────────────────                              │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │                                                 │   │
│  │         ⏳ [Spinning Loader]                    │   │
│  │                                                 │   │
│  │     Tokenizing card...                          │   │
│  │     Contacting bank...                          │   │
│  │     Verifying funds...                          │   │
│  │     Processing payment...                       │   │
│  │                                                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Transaction Details:                                   │
│  Amount: ₦5,000.00                                     │
│  Card: VISA ending in 4242                             │
│  Auth Code: [Waiting...]                               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**STEP 3 Flow:**
1. Backend receives PaymentMethod token + PIN
2. Backend verifies PIN first
3. If PIN valid, backend sends to Stripe:
   - PaymentMethod token
   - Amount, currency
4. Stripe contacts customer's bank
5. Bank verifies:
   - Card is valid
   - Sufficient funds
   - No fraud flags
   - CVV matches (if provided)
6. Bank responds with authorization code
7. **If approved:** Navigate to **Screen 3.3d: Success**
8. **If declined:** Show decline reason, return to STEP 1

---

```
┌─────────────────────────────────────────────────────────┐
│  Payment Successful!                        [Done]      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │                                                 │   │
│  │         ✅ [Success Checkmark]                  │   │
│  │                                                 │   │
│  │         PAYMENT APPROVED                        │   │
│  │                                                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Receipt Details:                                       │
│  ─────────────────                                      │
│  Transaction ID: txn_abc123xyz                         │
│  Authorization Code: H12345                            │
│  Amount: ₦5,000.00                                     │
│  Card: VISA ending in 4242                             │
│  Cardholder: John Doe                                  │
│  Date: Mar 13, 2026 10:30 AM                           │
│  Status: SETTLED                                       │
│                                                         │
│  [  📧 Email Receipt  ]  [  🖨️ Print  ]               │
│                                                         │
│  [     Done - New Payment     ]                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**STEP 4 Flow:**
1. Show success screen with all transaction details
2. Authorization code displayed prominently
3. Options to email/print receipt
4. Transaction complete!

---

## ₿ Section 4: Crypto Payment Flow

### Screen 4.1: Crypto Payment Setup

```
┌─────────────────────────────────────────────────────────┐
│  Crypto Payment                             [Cancel]    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  STEP 1: Select Cryptocurrency                          │
│  ─────────────────────────────                          │
│                                                         │
│  Search: [________________]                             │
│                                                         │
│  Popular:                                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                │
│  │ ₿ Bitcoin│ │ Ξ Ethereum│ │ ₮ USDT   │                │
│  │  (BTC)   │ │  (ETH)   │ │ (TRC20)  │                │
│  │ [Select] │ │ [Select] │ │ [Select] │                │
│  └──────────┘ └──────────┘ └──────────┘                │
│                                                         │
│  All Currencies:                                        │
│  [BTC] [ETH] [USDT] [USDC] [LTC] [XRP] [DOGE]          │
│                                                         │
│  [  Continue  ]                                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**STEP 1 Flow:**
1. Merchant searches or selects cryptocurrency
2. System shows:
   - Current exchange rate (e.g., 1 BTC = ₦45,000,000)
   - Network fee estimate
   - Supported networks (e.g., USDT on TRC20, ERC20)
3. Merchant selects currency
4. Click "Continue"
5. Navigate to **Screen 4.2: Amount & PIN**

---

```
┌─────────────────────────────────────────────────────────┐
│  Crypto Payment                             [Cancel]    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  STEP 2: Enter Amount & PIN                             │
│  ─────────────────────────                              │
│                                                         │
│  Amount in Fiat:                                        │
│  Currency: [NGN ▼]  Amount: [₦ _______]                │
│                                                         │
│  Equivalent in Crypto:                                  │
│  ≈ 0.00012345 BTC                                       │
│  (Rate: 1 BTC = ₦45,000,000)                           │
│                                                         │
│  ─────────────────────────────────────────────────      │
│                                                         │
│  Transaction PIN Required:                              │
│  PIN: [●][●][●][●][●][●]                               │
│                                                         │
│  ⚠️  Important:                                         │
│  - Payment address expires in 15 minutes                │
│  - Send EXACT amount to avoid delays                    │
│  - Only send [BTC] to this address                      │
│                                                         │
│  [  Generate Payment Address  ]                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**STEP 2 Flow:**
1. Merchant enters amount in fiat (NGN, USD, etc.)
2. System calculates crypto equivalent:
   - Fetches current exchange rate
   - Shows exact crypto amount
   - Updates in real-time as amount changes
3. Merchant enters 6-digit transaction PIN
4. System validates PIN
5. Click "Generate Payment Address"
6. Backend:
   - Verifies PIN
   - Calls NOWPayments API to create payment
   - Receives payment address and amount
7. Navigate to **Screen 4.3: Payment Address & QR**

---

```
┌─────────────────────────────────────────────────────────┐
│  Crypto Payment                             [Cancel]    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  STEP 3: Customer Scans & Pays                          │
│  ─────────────────────────────                          │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │                                                 │   │
│  │         [QR CODE HERE]                          │   │
│  │                                                 │   │
│  │     Scan to Pay                                 │   │
│  │                                                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Payment Details:                                       │
│  ─────────────────                                      │
│  Amount: 0.00012345 BTC                                │
│  Address: bc1qxy2kgdyxj... (copy)                       │
│  Network: Bitcoin                                      │
│                                                         │
│  ⏱️  Expires in: 14:32                                  │
│                                                         │
│  Status: ⏳ Waiting for payment...                      │
│                                                         │
│  [🔄 Check Status]  [📋 Copy Address]                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**STEP 3 Flow:**
1. System displays:
   - **QR Code** containing payment address and amount
   - Payment address (click to copy)
   - Exact crypto amount to send
   - Network type (BTC, ETH, etc.)
   - Countdown timer (15 minutes)
2. Customer:
   - Opens their crypto wallet
   - Scans QR code
   - Confirms amount and address
   - Sends payment
3. Frontend:
   - Polls backend every 10 seconds for payment status
   - Shows "Waiting for payment..."
   - Updates countdown timer
4. Backend:
   - Monitors blockchain for incoming transaction
   - Verifies amount matches
   - Confirms transaction on blockchain
5. **If payment received:** Navigate to **Screen 4.4: Confirming**
6. **If timeout (15 min):** Show "Payment expired, please restart"

---

```
┌─────────────────────────────────────────────────────────┐
│  Crypto Payment                             [Cancel]    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  STEP 4: Confirming on Blockchain                       │
│  ─────────────────────────────                          │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │                                                 │   │
│  │         ⏳ [Blockchain Animation]               │   │
│  │                                                 │   │
│  │     Payment Received!                           │   │
│  │     Confirming on blockchain...                 │   │
│  │                                                 │   │
│  │     Confirmations: 1/3                          │   │
│  │     ████████░░░░░░░░░░░░ 33%                    │   │
│  │                                                 │   │
│  │     This usually takes 5-10 minutes.            │   │
│  │                                                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Transaction Hash:                                      │
│  0x1234abcd... (view on blockchain)                     │
│                                                         │
│  Status: ⏳ Confirming...                               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**STEP 4 Flow:**
1. Payment detected on blockchain
2. System shows:
   - Transaction hash (click to view on blockchain explorer)
   - Confirmation progress (e.g., 1/3 confirmations)
   - Estimated time remaining
3. Backend:
   - Monitors blockchain confirmations
   - For BTC: Waits for 3 confirmations (~30 min)
   - For ETH: Waits for 12 confirmations (~3 min)
   - For USDT (TRC20): Waits for 20 confirmations (~5 min)
4. **When confirmations complete:** Navigate to **Screen 4.5: Success**

---

```
┌─────────────────────────────────────────────────────────┐
│  Payment Successful!                        [Done]      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │                                                 │   │
│  │         ✅ [Success Checkmark]                  │   │
│  │                                                 │   │
│  │         PAYMENT CONFIRMED                       │   │
│  │                                                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Receipt Details:                                       │
│  ─────────────────                                      │
│  Transaction ID: txn_crypto123                         │
│  Crypto Amount: 0.00012345 BTC                         │
│  Fiat Value: ₦5,000.00                                 │
│  TX Hash: 0x1234abcd...                                │
│  Confirmations: 3/3                                    │
│  Date: Mar 13, 2026 10:45 AM                           │
│  Status: SETTLED                                       │
│                                                         │
│  [  📧 Email Receipt  ]  [  🖨️ Print  ]               │
│  [  🔗 View on Blockchain  ]                           │
│                                                         │
│  [     Done - New Payment     ]                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**STEP 5 Flow:**
1. Show success screen with:
   - Transaction ID
   - Crypto amount AND fiat value
   - Blockchain transaction hash
   - Number of confirmations
   - Date/time
2. Options:
   - Email receipt
   - Print receipt
   - View on blockchain explorer
   - Start new payment
3. Transaction complete!

---

## 📜 Section 5: Transaction History

### Screen 5.1: Transaction List

```
┌─────────────────────────────────────────────────────────┐
│  Transaction History                        [Export▼]   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Filters:                                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Type: [All ▼]  Status: [All▼]  Date: [📅]      │   │
│  │ Search: [____________________]  [Search]        │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ✅ ₦5,000  Card Present  VISA ****4242         │   │
│  │    txn_abc123  •  Mar 13, 10:30 AM             │   │
│  │    Auth: H12345  [View Details →]              │   │
│  ├─────────────────────────────────────────────────┤   │
│  │ ✅ ₦12,500 Crypto       BTC 0.0003             │   │
│  │    txn_xyz789  •  Mar 13, 10:15 AM             │   │
│  │    TX: 0x1234...  [View Details →]             │   │
│  ├─────────────────────────────────────────────────┤   │
│  │ ⏳ ₦3,000  Pending     Card Present            │   │
│  │    txn_def456  •  Mar 13, 10:05 AM             │   │
│  │    [View Details →]                            │   │
│  ├─────────────────────────────────────────────────┤   │
│  │ ❌ ₦2,500  Failed     Card Not Present         │   │
│  │    txn_ghi012  •  Mar 13, 9:45 AM              │   │
│  │    Error: Insufficient funds  [View →]         │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Page: [←] 1 of 5 [→]    Show: [20▼] per page         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**PIN Requirement:** ✅ **YES** - Requires transaction PIN to view

**Flow:**
1. Merchant enters transaction PIN on first access
2. System loads transaction history
3. Merchant can:
   - Filter by type (Card, Crypto, All)
   - Filter by status (Success, Pending, Failed)
   - Filter by date range
   - Search by transaction ID or amount
4. Click "View Details" to see full transaction info

---

## 💰 Section 6: Balances

### Screen 6.1: Balance Overview

```
┌─────────────────────────────────────────────────────────┐
│  Balances & Settlements                     [Refresh]   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ⚠️  Enter Transaction PIN to View Balances            │
│  PIN: [●][●][●][●][●][●]  [Verify]                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**PIN Requirement:** ✅ **YES** - Requires transaction PIN to view

**Flow:**
1. Merchant enters 6-digit transaction PIN
2. Backend verifies PIN
3. If valid, shows balance screen

---

```
┌─────────────────────────────────────────────────────────┐
│  Balances & Settlements                     [Refresh]   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Stripe Balance:                                        │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Available: ₦45,250.00                          │   │
│  │  Pending:   ₦8,500.00 (settles in 2 days)       │   │
│  │  Total:     ₦53,750.00                          │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  NOWPayments (Crypto) Balance:                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │  BTC: 0.00125000 (≈ ₦56,250.00)                │   │
│  │  ETH: 0.05000000 (≈ ₦62,500.00)                │   │
│  │  USDT: 100.0000 (≈ ₦125,000.00)                │   │
│  │  ─────────────────────────                      │   │
│  │  Total Crypto: ≈ ₦243,750.00                    │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Blockchain Settlement Records:                         │
│  [⛓️ View Blockchain Records →]                        │
│                                                         │
│  [  💸 Withdraw Funds  ]  [  📊 Export Report  ]        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Flow:**
1. Shows available, pending, and total balances
2. Shows crypto balances with fiat equivalent
3. Links to blockchain settlement records
4. Options to withdraw or export reports

---

## ⛓️ Section 7: Blockchain Immutability View

### Screen 7.1: Blockchain Records

```
┌─────────────────────────────────────────────────────────┐
│  Blockchain Settlement Records              [Refresh]   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ⚠️  Enter Transaction PIN to View                     │
│  PIN: [●][●][●][●][●][●]  [Verify]                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**PIN Requirement:** ✅ **YES** - Requires transaction PIN to view

---

```
┌─────────────────────────────────────────────────────────┐
│  Blockchain Settlement Records              [Refresh]   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Search: [________________]  Network: [All▼]           │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ✅ Bitcoin Settlement                           │   │
│  │    Amount: 0.00012345 BTC (₦5,000)             │   │
│  │    TX Hash: 1a2b3c4d...                        │   │
│  │    Block: 789,123  •  Confirmations: 6         │   │
│  │    Date: Mar 13, 2026 10:45 AM                 │   │
│  │    [🔗 View on Blockchain] [📋 Copy Hash]      │   │
│  ├─────────────────────────────────────────────────┤   │
│  │ ✅ Ethereum Settlement                          │   │
│  │    Amount: 0.005 ETH (₦12,500)                 │   │
│  │    TX Hash: 0x5e6f7g8h...                      │   │
│  │    Block: 18,456,789  •  Confirmations: 25     │   │
│  │    Date: Mar 13, 2026 10:30 AM                 │   │
│  │    [🔗 View on Blockchain] [📋 Copy Hash]      │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ℹ️  All transactions are immutably recorded on        │
│     the blockchain for transparency and audit.         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Flow:**
1. Shows all transactions settled on blockchain
2. Each record includes:
   - Cryptocurrency and amount
   - Fiat equivalent
   - Transaction hash
   - Block number
   - Confirmation count
   - Date/time
3. Click "View on Blockchain" opens blockchain explorer
4. Click "Copy Hash" copies transaction hash to clipboard

---

## ⚙️ Section 8: Settings

### Screen 8.1: PIN Settings

```
┌─────────────────────────────────────────────────────────┐
│  PIN Settings                               [Save]      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ⚠️  Enter Current PIN                                 │
│  Current PIN: [●][●][●][●][●][●]                       │
│                                                         │
│  ─────────────────────────────────────────────────      │
│                                                         │
│  Set New PIN:                                           │
│  New PIN: [●][●][●][●][●][●]                           │
│  Confirm: [●][●][●][●][●][●]                           │
│                                                         │
│  ⚠️  Security Tips:                                     │
│  - Don't use obvious numbers (123456, 000000)          │
│  - Don't share your PIN with anyone                    │
│  - Change PIN regularly for security                   │
│  - Account locks after 5 failed attempts               │
│                                                         │
│  [  Change PIN  ]                                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**PIN Requirement:** ✅ **YES** - Requires current PIN to change

**Flow:**
1. Merchant enters current PIN
2. Enters new PIN twice (must match)
3. System validates:
   - Current PIN is correct
   - New PIN is 6 digits
   - New PIN is not weak
   - New PIN matches confirmation
4. On submit:
   - Backend hashes and stores new PIN
   - Resets failed attempt counter
5. Show success message

---

### Screen 8.2: Admin Channel

```
┌─────────────────────────────────────────────────────────┐
│  Admin Dashboard                            [Logout]    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ⚠️  Admin Access - Enter Transaction PIN              │
│  PIN: [●][●][●][●][●][●]  [Verify]                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**PIN Requirement:** ✅ **YES** - Requires transaction PIN for admin access

---

```
┌─────────────────────────────────────────────────────────┐
│  Admin Dashboard                            [Logout]    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────┐                                       │
│  │  ADMIN MENU │  ┌─────────────────────────────────┐  │
│  │             │  │      SYSTEM STATISTICS          │  │
│  │ 👥 Merchants│  │                                 │  │
│  │ 💰 Refunds  │  │  Total Merchants    156        │  │
│  │ 🔄 Reversals│  │  Active Today       89         │  │
│  │ 📊 Reports  │  │  Total Volume       ₦2.5M      │  │
│  │ ⚙️ System   │  │  Failed Today       12         │  │
│  │             │  │                                 │  │
│  └─────────────┘  └─────────────────────────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  RECENT ADMIN ACTIONS                           │   │
│  │                                                 │   │
│  │  🔙 Refund ₦5,000 - txn_abc123 - 10:30am       │   │
│  │  🔄 Reverse ₦3,000 - txn_def456 - 10:15am      │   │
│  │  👤 New Merchant - John's Store - 9:45am       │   │
│  │                                                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [  Process Refund  ]  [  Process Reversal  ]          │
│  [  View All Reports  ]  [  System Settings  ]         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Admin Actions (All Require PIN):**
- Process refunds
- Process reversals
- View all merchant transactions
- System configuration
- Generate reports
- Manage merchants

---

## 📋 Summary: PIN Requirements

| Section | Screen | PIN Required? | When |
|---------|--------|---------------|------|
| **Auth** | Login | ❌ No | - |
| **Auth** | PIN Entry | ✅ Yes | After login |
| **Auth** | Setup PIN | ✅ Yes | First-time setup |
| **Dashboard** | Main Dashboard | ❌ No | After PIN verified |
| **Payments** | Card Present | ✅ Yes | Before processing |
| **Payments** | Card Not Present | ✅ Yes | Before processing |
| **Payments** | Crypto | ✅ Yes | Before generating address |
| **History** | Transaction List | ✅ Yes | On first access |
| **Balances** | Balance View | ✅ Yes | On first access |
| **Blockchain** | Settlement Records | ✅ Yes | On first access |
| **Settings** | Change PIN | ✅ Yes | To verify current PIN |
| **Settings** | Admin Panel | ✅ Yes | On access |

---

## 🔐 PIN Security Flow

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  User enters PIN → Backend verifies → Access granted   │
│                       │                                 │
│                       ├─ ✅ Correct → Reset attempts   │
│                       │                                 │
│                       ├─ ❌ Wrong → +1 failed attempt  │
│                       │   • Show remaining attempts     │
│                       │                                 │
│                       └─ 🔒 5 failures → Lock 15 min   │
│                           • Show countdown              │
│                           • Auto-unlock after 15 min    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```



---

**This completes the frontend UX flow documentation for CloudPOS!**
