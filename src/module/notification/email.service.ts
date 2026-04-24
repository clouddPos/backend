import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name);

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host:
        this.configService.get<string>('smtp.host') || 'smtp.ethereal.email',
      port: this.configService.get<number>('smtp.port') || 587,
      auth: {
        user: this.configService.get<string>('smtp.user'),
        pass: this.configService.get<string>('smtp.pass'),
      },
    });
  }

  async sendTransactionSuccessEmail(
    to: string,
    transactionId: string,
    amount: number,
    currency: string,
    method: string,
  ) {
    try {
      const info = await this.transporter.sendMail({
        from: '"CloudPOS System" <noreply@cloudpos.com>',
        to,
        subject: `Transaction Successful: ${transactionId}`,
        text: `Hello, your ${method} payment of ${amount} ${currency} has successfully settled. Transaction ID: ${transactionId}.`,
        html: `
          <h2>Payment Successful</h2>
          <p>Your <strong>${method}</strong> payment of <strong>${amount} ${currency}</strong> has been successfully settled.</p>
          <p><small>Transaction ID: ${transactionId}</small></p>
        `,
      });
      this.logger.log(
        `Success email sent for tx ${transactionId} to ${to}. MessageId: ${info.messageId}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to send email for tx ${transactionId}: ${error.message}`,
      );
    }
  }
}
