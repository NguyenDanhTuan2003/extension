import { Module, ValidationPipe } from '@nestjs/common';
import { AppConfigModule } from '@app/commons/config/config.module';
import { RedisModule } from '@app/commons/database/redis.module';
import { CustomNatsModule } from '@app/commons/custom_natsclient_traceid/CustomNatsClient.module';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { AllExceptionsFilter, TransformInterceptor } from '@app/commons';
import { NoticeModule } from './notice/notice.module';
import { LoggerModule } from '@app/commons/loggers/logger.module';
//bản chất decorator là 1 class chung nhưng mỗi loại decorator đươc viết 1 cách khác nhau nhưng mục đích vẫn là xử lý logic ngầm và khi code chỉ cần gọi ra k cần biết nó nằm đâu có logic ntn
@Module({
  imports: [
    AppConfigModule,
    RedisModule,
    CustomNatsModule,
    NoticeModule,
    LoggerModule.forRoot('GATEWAY'),
  ],
  providers: [
    {
      provide: APP_FILTER,
      //AllExceptionsFilter cần CustomWinstonLogger được truyền vào constructor, nên NestJS phải tự đứng ra khởi tạo instance cho nó
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    },
  ],
})
export class ApiGatewayModule {}
