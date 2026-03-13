import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../../database/database.module';
import { EmailService } from './email.service';
import { SocketGateway } from './socket.gateway';

@Module({
    imports: [
        ConfigModule,
        DatabaseModule,
        JwtModule.registerAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                secret: config.get<string>('jwt.secret') || 'default-secret',
                signOptions: { expiresIn: '1h' },
            }),
        }),
    ],
    providers: [EmailService, SocketGateway],
    exports: [EmailService, SocketGateway],
})
export class NotificationModule { }
