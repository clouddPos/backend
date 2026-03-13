-- CreateEnum
CREATE TYPE "MerchantStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MERCHANT_ADMIN', 'OPERATOR');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('ONLINE', 'OFFLINE', 'SALE_COMPLETION', 'PRE_AUTH');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('INITIATED', 'AUTHORIZED', 'CAPTURED', 'SETTLED', 'DECLINED', 'REVERSED', 'FAILED');

-- CreateEnum
CREATE TYPE "CardScheme" AS ENUM ('VISA', 'MASTERCARD', 'AMEX', 'UNIONPAY');

-- CreateEnum
CREATE TYPE "BlockchainTxStatus" AS ENUM ('PENDING', 'CONFIRMING', 'PAID', 'EXPIRED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "OnChainTxStatus" AS ENUM ('PENDING', 'SUBMITTED', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "WalletKeyType" AS ENUM ('MERCHANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "WebhookSource" AS ENUM ('ADYEN', 'COINGATE');

-- CreateTable
CREATE TABLE "merchants" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "status" "MerchantStatus" NOT NULL DEFAULT 'PENDING',
    "adyenMerchantAccount" TEXT,
    "adyenStoreId" TEXT,
    "coingateApiToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'OPERATOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "merchantId" TEXT,
    "refreshToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'INITIATED',
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "cardScheme" "CardScheme",
    "maskedCardNumber" TEXT,
    "expiryDate" TEXT,
    "authorizationCode" TEXT,
    "referenceNumber" TEXT,
    "gatewayReference" TEXT,
    "gatewayResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blockchain_transactions" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "coingateOrderId" TEXT,
    "status" "BlockchainTxStatus" NOT NULL DEFAULT 'PENDING',
    "payAmount" DECIMAL(18,8),
    "payCurrency" TEXT,
    "receiveAmount" DECIMAL(18,2),
    "receiveCurrency" TEXT,
    "paymentUrl" TEXT,
    "callbackPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blockchain_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "on_chain_transactions" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT,
    "txHash" TEXT,
    "blockNumber" INTEGER,
    "blockTimestamp" TIMESTAMP(3),
    "status" "OnChainTxStatus" NOT NULL DEFAULT 'PENDING',
    "gasUsed" TEXT,
    "gasFee" TEXT,
    "settlementData" JSONB,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "on_chain_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_keys" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT,
    "address" TEXT NOT NULL,
    "encryptedPrivateKey" TEXT NOT NULL,
    "hdPath" TEXT,
    "keyType" "WalletKeyType" NOT NULL DEFAULT 'MERCHANT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "source" "WebhookSource" NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "merchants_email_key" ON "merchants"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_idempotencyKey_key" ON "transactions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "transactions_merchantId_idx" ON "transactions"("merchantId");

-- CreateIndex
CREATE INDEX "transactions_status_idx" ON "transactions"("status");

-- CreateIndex
CREATE INDEX "transactions_createdAt_idx" ON "transactions"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "blockchain_transactions_transactionId_key" ON "blockchain_transactions"("transactionId");

-- CreateIndex
CREATE INDEX "on_chain_transactions_transactionId_idx" ON "on_chain_transactions"("transactionId");

-- CreateIndex
CREATE INDEX "on_chain_transactions_txHash_idx" ON "on_chain_transactions"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_keys_address_key" ON "wallet_keys"("address");

-- CreateIndex
CREATE INDEX "webhook_events_source_processed_idx" ON "webhook_events"("source", "processed");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blockchain_transactions" ADD CONSTRAINT "blockchain_transactions_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "on_chain_transactions" ADD CONSTRAINT "on_chain_transactions_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_keys" ADD CONSTRAINT "wallet_keys_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
