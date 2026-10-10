import {
  Global,
  Module,
  Provider,
  OnApplicationShutdown,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

//Ong này k có trong module viết sẵn của nest nên phải nhét nó vào là của
// nest thông qua provider đói với ông như mongo thì có mongose hay typeorm nó đã được viết 1 thư viện moduke rồi
const RedisProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: (configService: ConfigService) => {
    const host = configService.get<string>('REDIS_HOST', 'localhost');
    const port = Number(configService.get<number>('REDIS_PORT', 6379));
    const password = configService.get<string>('REDIS_PASSWORD');
    const db = configService.get<number>('REDIS_DB', 0);
    const prefix = configService.get<string>('REDIS_KEY_PREFIX', '');
    const isTls =
      configService.get<string>('REDIS_TLS') === 'true' ||
      host.includes('upstash.io');

    return new Redis({
      host,
      port,
      password,
      db,
      keyPrefix: prefix,
      // Bắt buộc thêm TLS nếu kết nối tới Upstash hoặc Cloud Redis
      ...(isTls && { tls: {} }),
      // Tự động thử kết nối lại nếu mất mạng
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });
  },
  inject: [ConfigService],
};

@Global()
@Module({
  providers: [RedisProvider],
  exports: [RedisProvider],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redisClient: Redis) {}

  async onApplicationShutdown() {
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }
}
