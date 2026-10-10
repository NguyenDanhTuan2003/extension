import { NestFactory } from '@nestjs/core';
import { NoticeServiceModule } from './notice-service.module';
import { CustomWinstonLogger } from '@app/commons';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(NoticeServiceModule, {
    bufferLogs: true,
  });
  const logger = app.get(CustomWinstonLogger);
  app.useLogger(logger);
  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.NATS,
      options: {
        servers: [`${process.env.NATS_URL || 'nats://127.0.0.1:4222'}`],
        queue: 'notice_service_queue',
      },
    },
    { inheritAppConfig: true },
  );

  await app.startAllMicroservices();

  const HTTP_PORT = process.env.NOTICE_PORT || 3001;
  await app.listen(HTTP_PORT);

  console.log(
    `Leave Request Service HTTP is running on: http://localhost:${HTTP_PORT}`,
  );
}
void bootstrap();
