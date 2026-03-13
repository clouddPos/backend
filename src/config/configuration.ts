export default () => ({
  app: {
    port: parseInt(process.env.PORT ?? '3000', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    globalPrefix: 'api/v1',
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  security: {
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS ?? '5', 10),
    lockoutDuration: parseInt(process.env.LOCKOUT_DURATION ?? '900', 10),
    enable2FA: process.env.ENABLE_2FA === 'true',
    otpExpiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES ?? '10', 10),
    passwordResetExpiryMinutes: parseInt(
      process.env.PASSWORD_RESET_EXPIRY_MINUTES ?? '10',
      10,
    ),
    walletEncryptionKey: process.env.WALLET_ENCRYPTION_KEY, // AES-256 key for WalletKey model
  },
  email: {
    provider: process.env.MAIL_MAILER ?? 'console',
    from: process.env.MAIL_FROM_ADDRESS ?? 'noreply@cloudpos.io',
    verificationRedirectUrl: process.env.EMAIL_VERIFICATION_REDIRECT_URL,
    smtp: {
      host: process.env.MAIL_HOST,
      port: parseInt(process.env.MAIL_PORT ?? '587', 10),
      secure: process.env.MAIL_SECURE === 'true',
      auth: {
        user: process.env.MAIL_USERNAME,
        pass: process.env.MAIL_PASSWORD,
      },
    },
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  },
  nowpayments: {
    apiKey: process.env.NOWPAYMENT_API_KEY,
    ipnSecret: process.env.NOWPAYMENT_IPN_SECRET,
    ipnCallbackUrl: process.env.NOWPAYMENT_IPN_CALLBACK_URL,
    environment: process.env.NOWPAYMENT_ENVIRONMENT ?? 'sandbox',
    apiUrl:
      process.env.NOWPAYMENT_ENVIRONMENT === 'production'
        ? 'https://api.nowpayments.io/v1'
        : 'https://api-sandbox.nowpayments.io/v1',
  },
  blockchain: {
    rpcUrl: process.env.BLOCKCHAIN_RPC_URL ?? 'http://localhost:8545',
    chainId: parseInt(process.env.BLOCKCHAIN_CHAIN_ID ?? '137', 10), // Polygon by default
    settlementContractAddress: process.env.SETTLEMENT_CONTRACT_ADDRESS,
    confirmationsRequired: parseInt(
      process.env.BLOCKCHAIN_CONFIRMATIONS ?? '12',
      10,
    ),
    blockExplorerUrl:
      process.env.BLOCK_EXPLORER_URL ?? 'https://polygonscan.com',
  },
  frontend: {
    url: process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.split(',')[0].trim()
      : 'http://localhost:3000',
    allowedUrls: process.env.ALLOWED_FRONTEND_URLS
      ? process.env.ALLOWED_FRONTEND_URLS.split(',').map((url) => url.trim())
      : ['http://localhost:3000'],
  },
  bullboard: {
    enabled: process.env.BULLBOARD_ENABLED
      ? process.env.BULLBOARD_ENABLED === 'true'
      : undefined,
    username: process.env.BULLBOARD_USER,
    password: process.env.BULLBOARD_PASSWORD,
  },
  pos: {
    apiKey: process.env.POS_API_KEY,
    merchantId: process.env.POS_MERCHANT_ID,
  },
});
