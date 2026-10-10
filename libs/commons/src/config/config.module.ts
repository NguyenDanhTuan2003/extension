import { Module, Global } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import configuration from './configuration';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      //  Thêm các đường dẫn dự phòng để trỏ về đúng file .env ở Root
      envFilePath: ['.env', '../../.env', '../.env'],
      isGlobal: true, // Bản thân biến này đã giúp ConfigModule phủ rộng toàn bộ app
      load: [configuration],
    }),
  ],
  exports: [NestConfigModule],
})
export class AppConfigModule {}
