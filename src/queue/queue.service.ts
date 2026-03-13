import {
  Injectable,
  OnModuleDestroy,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import type { BullBoardInstance } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private queueEvents: Map<string, QueueEvents> = new Map();
  private connection: { host: string; port: number };

  private readonly knownQueues = [
    'email',
    'audit-logs',
    'notifications',
    'webhooks',
    'transaction-processing',
    'blockchain-sync',
  ];

  constructor(
    private configService: ConfigService,
    @Optional()
    @Inject('BULL_BOARD_INSTANCE')
    private readonly boardInstance?: BullBoardInstance,
  ) {
    this.connection = {
      host: this.configService.get<string>('redis.host')!,
      port: this.configService.get<number>('redis.port')!,
    };

    // I SAMUEL OWASE Initialize queues immediately so they appear in BullBoard
    this.initializeQueues();
  }

  private initializeQueues() {
    // Pre-create queues so they appear in BullBoard
    this.knownQueues.forEach((queueName) => {
      this.getQueue(queueName);
    });

    if (this.boardInstance) {
      this.logger.log(
        `Bull Board initialized with ${this.knownQueues.length} queues`,
      );
    } else {
      this.logger.log(
        `Initialized ${this.knownQueues.length} queues (BullBoard not available)`,
      );
    }
  }

  async onModuleDestroy() {
    for (const [name, queue] of this.queues) {
      await queue.close();
      this.logger.log(`Queue ${name} closed`);
    }

    for (const [name, worker] of this.workers) {
      await worker.close();
      this.logger.log(`Worker ${name} closed`);
    }

    for (const [name, events] of this.queueEvents) {
      await events.close();
      this.logger.log(`QueueEvents ${name} closed`);
    }
  }

  getQueue(name: string): Queue {
    if (!this.queues.has(name)) {
      const queue = new Queue(name, { connection: this.connection });
      this.queues.set(name, queue);

      // Try to add to BullBoard if available
      try {
        if (this.boardInstance) {
          this.boardInstance.addQueue(new BullMQAdapter(queue));
          this.logger.log(`Queue ${name} added to Bull Board`);
        }
      } catch (error) {
        this.logger.warn(
          `Could not add queue ${name} to Bull Board: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }
    return this.queues.get(name)!;
  }

  registerWorker<T = any>(
    queueName: string,
    processor: (job: Job<T>) => Promise<any>,
    options?: {
      concurrency?: number;
      limiter?: { max: number; duration: number };
    },
  ): Worker {
    if (this.workers.has(queueName)) {
      this.logger.warn(`Worker for queue ${queueName} already exists`);
      return this.workers.get(queueName)!;
    }

    const envNode =
      this.configService.get<string>('app.nodeEnv') ?? process.env.NODE_ENV;
    const skipWorkers =
      this.configService.get<boolean>('queue.skipWorkers') ??
      envNode === 'test';

    if (skipWorkers) {
      this.logger.log(
        `Skipping worker registration for queue ${queueName} in test environment or due to config 'queue.skipWorkers'`,
      );
      const stub = {
        close: async () => {
          /* no-op for tests */
        },
        on: (_event: any, _listener?: any) => {
          void _event;
          void _listener;
          return stub;
        },
      } as unknown as Worker;
      this.workers.set(queueName, stub);
      return stub;
    }

    const worker = new Worker(queueName, processor, {
      connection: this.connection,
      concurrency: options?.concurrency ?? 1,
      limiter: options?.limiter,
    });

    worker.on('completed', (job) => {
      this.logger.log(`Job ${job.id} in queue ${queueName} completed`);
    });

    worker.on('failed', (job, err) => {
      this.logger.error(
        `Job ${job?.id} in queue ${queueName} failed: ${err.message}`,
      );
    });

    this.workers.set(queueName, worker);
    this.logger.log(`Worker for queue ${queueName} registered`);

    return worker;
  }

  async addJob<T = any>(
    queueName: string,
    jobName: string,
    data: T,
    options?: {
      jobId?: string;
      delay?: number;
      attempts?: number;
      backoff?: { type: 'exponential' | 'fixed'; delay: number };
      removeOnComplete?: boolean | number;
      removeOnFail?: boolean | number;
    },
  ): Promise<Job<T>> {
    const queue = this.getQueue(queueName);
    return await queue.add(jobName, data, options);
  }

  async getJob(queueName: string, jobId: string): Promise<Job | undefined> {
    const queue = this.getQueue(queueName);
    return await queue.getJob(jobId);
  }

  async removeJob(queueName: string, jobId: string): Promise<void> {
    const job = await this.getJob(queueName, jobId);
    if (job) {
      await job.remove();
    }
  }

  getQueueEvents(queueName: string): QueueEvents {
    if (!this.queueEvents.has(queueName)) {
      const events = new QueueEvents(queueName, {
        connection: this.connection,
      });
      this.queueEvents.set(queueName, events);
    }
    return this.queueEvents.get(queueName)!;
  }
}
