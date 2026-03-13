/*
  Warnings:

  - The values [ADYEN,COINGATE] on the enum `WebhookSource` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `coingateOrderId` on the `blockchain_transactions` table. All the data in the column will be lost.
  - You are about to drop the column `adyenMerchantAccount` on the `merchants` table. All the data in the column will be lost.
  - You are about to drop the column `adyenStoreId` on the `merchants` table. All the data in the column will be lost.
  - You are about to drop the column `coingateApiToken` on the `merchants` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "WebhookSource_new" AS ENUM ('PAYSTACK', 'NOWPAYMENTS');
ALTER TABLE "webhook_events" ALTER COLUMN "source" TYPE "WebhookSource_new" USING ("source"::text::"WebhookSource_new");
ALTER TYPE "WebhookSource" RENAME TO "WebhookSource_old";
ALTER TYPE "WebhookSource_new" RENAME TO "WebhookSource";
DROP TYPE "public"."WebhookSource_old";
COMMIT;

-- AlterTable
ALTER TABLE "blockchain_transactions" DROP COLUMN "coingateOrderId",
ADD COLUMN     "nowpaymentsPaymentId" TEXT;

-- AlterTable
ALTER TABLE "merchants" DROP COLUMN "adyenMerchantAccount",
DROP COLUMN "adyenStoreId",
DROP COLUMN "coingateApiToken",
ADD COLUMN     "nowpaymentsApiToken" TEXT,
ADD COLUMN     "paystackSubaccountCode" TEXT;
