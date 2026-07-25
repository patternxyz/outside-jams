import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AppController } from "./app.controller.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: [".env", "../../.env"],
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        url: config.getOrThrow<string>("DATABASE_URL"),
        ssl: config.get("DB_SSL") === "true",
        synchronize: config.get("DB_SYNCHRONIZE") === "true",
        autoLoadEntities: true,
      }),
    }),
  ],
  controllers: [AppController],
})
export class AppModule {}
