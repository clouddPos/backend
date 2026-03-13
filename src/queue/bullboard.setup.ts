import { INestApplication, Logger } from '@nestjs/common';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { QueueService } from './queue.service';
import { ConfigService } from '@nestjs/config';

export function setupBullBoard(app: INestApplication) {
  const logger = new Logger('BullBoard');
  const queueService = app.get(QueueService);
  const configService = app.get(ConfigService);

  const enabled =
    configService.get<boolean>('bullboard.enabled') ??
    configService.get<string>('app.nodeEnv') !== 'production';

  if (!enabled) {
    logger.log('BullBoard disabled by configuration');
    return;
  }

  const username = configService.get<string>('bullboard.username');
  const password = configService.get<string>('bullboard.password');

  if (!username || !password) {
    logger.warn('BullBoard credentials not configured; BullBoard will not be exposed');
    return;
  }

  // Get queues relevant to the domain
  const transactionProcessingQueue = queueService.getQueue('transaction-processing');
  const blockchainSyncQueue = queueService.getQueue('blockchain-sync');
  const webhooksQueue = queueService.getQueue('webhooks');
  const emailQueue = queueService.getQueue('email');

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/api/v1/admin/queues');

  createBullBoard({
    queues: [
      new BullMQAdapter(transactionProcessingQueue),
      new BullMQAdapter(blockchainSyncQueue),
      new BullMQAdapter(webhooksQueue),
      new BullMQAdapter(emailQueue),
    ],
    serverAdapter,
  });

  const expressApp = app.getHttpAdapter().getInstance();

  const authMiddleware = (req: any, res: any, next: any) => {
    const header = req.headers['authorization'] as string | undefined;
    if (!header || !header.startsWith('Basic ')) {
      res.setHeader('WWW-Authenticate', 'Basic realm="BullBoard"');
      return res.status(401).send('Unauthorized');
    }
    const decoded = Buffer.from(header.slice('Basic '.length), 'base64')
      .toString('utf8');
    const [user, pass] = decoded.split(':');
    if (user !== username || pass !== password) {
      return res.status(403).send('Forbidden');
    }
    return next();
  };

  expressApp.use('/api/v1/admin/queues', authMiddleware, serverAdapter.getRouter());
}
