import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as crypto from 'crypto';

async function main() {
  console.log('🌱 Starting seed...');

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL must be set to run the seed script');
  }

  const jwtSecret = process.env.JWT_SECRET ?? 'default-salt';
  const defaultPin = '123456';
  const transactionPinHash = crypto
    .createHmac('sha256', jwtSecret)
    .update(defaultPin)
    .digest('hex');

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    // Generate API key (random 32-byte hex string)
    const apiKey = crypto.randomBytes(32).toString('hex');

    // Create or update the single merchant
    const merchant = await prisma.merchant.upsert({
      where: { email: 'admin@grandhotel.com' },
      update: {
        apiKey,
        transactionPinHash,
        businessName: 'Grand Hotel',
      },
      create: {
        email: 'admin@grandhotel.com',
        businessName: 'Grand Hotel',
        apiKey,
        transactionPinHash,
        status: 'ACTIVE',
      },
    });

    console.log(`
✅ Seed completed successfully!

┌─────────────────────────────────────────────────────────┐
│  MERCHANT CONFIGURATION                                 │
├─────────────────────────────────────────────────────────┤
│  Merchant ID:    ${merchant.id}
│  Business Name:  ${merchant.businessName}
│  Email:          ${merchant.email}
│  API Key:        ${apiKey}
│  Default PIN:    ${defaultPin}
├─────────────────────────────────────────────────────────┤
│  ⚠️  IMPORTANT: Save the API Key and PIN securely!      │
│  The API Key won't be shown again.                      │
│  Change the default PIN after first login.              │
└─────────────────────────────────────────────────────────┘

Next steps:
1. Copy the API Key to your backend .env:
   POS_API_KEY=${apiKey}
   POS_MERCHANT_ID=${merchant.id}

2. Copy the API Key to your frontend .env:
   REACT_APP_API_KEY=${apiKey}
   REACT_APP_API_URL=http://localhost:3000

3. Change the default PIN (123456) via the API:
   POST /api/v1/merchant/change-pin
   {
     "oldPin": "123456",
     "newPin": "000000"
   }
`);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  });
