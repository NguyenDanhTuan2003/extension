import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        // Fallback 3 lớp: database.uri -> MONGO_URI -> Mặc định local
        const uri =
          configService.get<string>('database.uri') ||
          configService.get<string>('MONGO_URI');

        return {
          uri,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
