import { DynamicModule, Global, Module } from '@nestjs/common';
import { CustomWinstonLogger } from './my.logger';
@Global()
@Module({})
export class LoggerModule {
  // tự xây dựng dynamic module để các service khác k viết lại
  static forRoot(servicename: string): DynamicModule {
    return {
      module: LoggerModule,
      providers: [
        {
          provide: CustomWinstonLogger,
          useFactory: () => new CustomWinstonLogger(servicename),
        },
      ],
      exports: [CustomWinstonLogger],
    };
  }
}
