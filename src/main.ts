import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import compression from 'compression';
import { ValidationPipe, Logger, LoggerService } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder, OpenAPIObject } from '@nestjs/swagger';
import { setupBullBoard } from './queue/bullboard.setup';
import { ApiKeyMiddleware } from './module/auth/middleware/api-key.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const configService = app.get(ConfigService);
  const isProduction =
    configService.get<string>('app.nodeEnv') === 'production';
  const port = configService.get<number>('app.port') ?? 3000;

  // Logger
  let logger: LoggerService;
  try {
    logger = app.get<LoggerService>(WINSTON_MODULE_NEST_PROVIDER);
    app.useLogger(logger);
  } catch {
    logger = new Logger('Bootstrap');
    Logger.log('Winston not available, using default NestJS logger');
  }

  // CORS
  const allowedOrigins = configService.get<string[]>(
    'frontend.allowedUrls',
  ) ?? [
      'http://localhost:3000',
      'http://localhost:4200',
      'http://localhost:8080',
    ];

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow requests from local files (file:// protocol)
      if (origin === 'null') {
        callback(null, true);
        return;
      }
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
      'Idempotency-Key',
      'x-api-key',
    ],
    optionsSuccessStatus: 204,
  });

  // Security
  app.use(
    helmet({
      contentSecurityPolicy: isProduction
        ? {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", 'data:'],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
          },
        }
        : false, // Disable CSP in development for Swagger
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      frameguard: { action: 'deny' },
      noSniff: true,
      xssFilter: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // Body parsing
  app.use(json({
    limit: '10mb',
    verify: (req: any, res, buf) => {
      if (
        req.originalUrl &&
        (req.originalUrl.includes('/webhooks/stripe') ||
          req.originalUrl.includes('/webhooks/nowpayments'))
      ) {
        req.rawBody = buf;
      }
    }
  }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // Compression
  app.use(compression());

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // API prefix
  app.setGlobalPrefix('api/v1');

  // Apply API key middleware to protected routes
  const apiKeyMiddleware = app.get(ApiKeyMiddleware);
  app.use('/api/v1/merchant', apiKeyMiddleware.use.bind(apiKeyMiddleware));
  app.use('/api/v1/transactions', apiKeyMiddleware.use.bind(apiKeyMiddleware));
  app.use('/api/v1/crypto-payments', apiKeyMiddleware.use.bind(apiKeyMiddleware));
  app.use('/api/v1/cnp-payments', apiKeyMiddleware.use.bind(apiKeyMiddleware));
  app.use('/api/v1/cp-payments', apiKeyMiddleware.use.bind(apiKeyMiddleware));
  app.use('/api/v1/pre-auth', apiKeyMiddleware.use.bind(apiKeyMiddleware));

  // Swagger (non-production only)
  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('CloudPOS API')
      .setDescription(
        'Blockchain-Integrated Merchant Payment Terminal API. Use the `x-api-key` header (same key printed by `npm run seed`) to authenticate POS routes.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'apiKey')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig, {
      // Remove special characters that break Swagger UI
      ignoreGlobalPrefix: false,
    });
    const openApi = document as OpenAPIObject;
    openApi.security = openApi.security ?? [];
    openApi.security.push({ apiKey: [] });
    SwaggerModule.setup('api/docs', app, document, {
      customCss: '.swagger-ui .topbar .download-url-wrapper { display: none }',
      customSiteTitle: 'CloudPOS API Docs',
    });
  }

  // Initialize BullBoard GUI
  setupBullBoard(app);

  await app.listen(port);
  Logger.log(
    `
    ============================================
    🚀 CloudPOS Server started
    ============================================
    Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}
    Port: ${port}
    API Prefix: /api/v1
    Swagger: ${isProduction ? 'Disabled' : `http://localhost:${port}/api/docs`}
    ============================================
  `,
    'Bootstrap',
  );
}

bootstrap();
