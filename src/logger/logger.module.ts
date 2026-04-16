import { Global, Module } from '@nestjs/common';
import { format, transports } from 'winston';
import { WinstonModule } from 'nest-winston';

const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  format.splat(),
  format.json(),
);

const consoleFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.colorize(),
  format.printf((info: any) => {
    const { timestamp, level, message, context, stack } = info;
    const contextStr = context ? `[${context}] ` : '';
    const stackStr = stack ? `\n${stack}` : '';
    return `[${timestamp}] ${level}: ${contextStr}${message}${stackStr}`;
  }),
);

const logger = {
  transport: [
    // File transport with JSON format for production
    new transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: logFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new transports.File({
      filename: 'logs/combined.log',
      format: logFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Console transport with readable format
    new transports.Console({
      format: consoleFormat,
    }),
  ],
};

@Global()
@Module({
  imports: [
    WinstonModule.forRoot({
      transports: logger.transport,
      exitOnError: false,
    }),
  ],
  exports: [WinstonModule],
})
export class LoggerModule {}
