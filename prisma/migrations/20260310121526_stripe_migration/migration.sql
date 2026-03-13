/*
  Warnings:

  - The values [PAYSTACK] on the enum `WebhookSource` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `paystackSubaccountCode` on the `merchants` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "WebhookSource_new" AS ENUM ('STRIPE', 'NOWPAYMENTS');
ALTER TABLE "webhook_events" ALTER COLUMN "source" TYPE "WebhookSource_new" USING ("source"::text::"WebhookSource_new");
ALTER TYPE "WebhookSource" RENAME TO "WebhookSource_old";
ALTER TYPE "WebhookSource_new" RENAME TO "WebhookSource";
DROP TYPE "public"."WebhookSource_old";
COMMIT;

-- AlterTable
ALTER TABLE "merchants" DROP COLUMN "paystackSubaccountCode",
ADD COLUMN     "stripeAccountId" TEXT;
