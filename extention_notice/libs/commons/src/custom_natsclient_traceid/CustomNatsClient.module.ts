import { Module, Global } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { CustomNatsClient } from './custom-nats.client';
import { ConfigService } from '@nestjs/config';
import { AppConfigModule } from '../config/config.module';

@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'NATS_SERVICE', // <-- Đã đồng nhất thành NATS_SERVICE
        imports: [AppConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.NATS,
          options: {
            servers: [
              configService.get<string>('NATS_URL') ||
                configService.get<string>('nats.url') ||
                'nats://127.0.0.1:4222',
            ],
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  providers: [CustomNatsClient],
  exports: [CustomNatsClient, ClientsModule],
})
export class CustomNatsModule {}
