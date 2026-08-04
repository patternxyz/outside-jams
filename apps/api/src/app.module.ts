import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AppController } from "./app.controller.js";
import { ArtistsModule } from "./artists/artists.module.js";
import { CreateSpotifyAuth1753500000000 } from "./database/migrations/1753500000000-create-spotify-auth.js";
import { AddSpotifySyncStatus1753600000000 } from "./database/migrations/1753600000000-add-spotify-sync-status.js";
import { CreateSpotifyTopArtists1753700000000 } from "./database/migrations/1753700000000-create-spotify-top-artists.js";
import { CreateSpotifyFollowedArtists1753800000000 } from "./database/migrations/1753800000000-create-spotify-followed-artists.js";
import { CreateSpotifyUserTags1753900000000 } from "./database/migrations/1753900000000-create-spotify-user-tags.js";
import { RefactorSpotifySchema1754100000000 } from "./database/migrations/1754100000000-refactor-spotify-schema.js";
import { CreateSpotifySavedTracks1754200000000 } from "./database/migrations/1754200000000-create-spotify-saved-tracks.js";
import { AddSpotifyArtistName1754300000000 } from "./database/migrations/1754300000000-add-spotify-artist-name.js";
import { ConvertPerformancesToScd21754400000000 } from "./database/migrations/1754400000000-convert-performances-to-scd2.js";
import { PerformancesModule } from "./performances/performances.module.js";
import { SpotifyModule } from "./spotify/spotify.module.js";
import { TagsModule } from "./tags/tags.module.js";
import { TracksModule } from "./tracks/tracks.module.js";

const DEFAULT_RATE_LIMIT = 100;
const DEFAULT_RATE_LIMIT_TTL_MS = 60_000;

function positiveIntegerOrDefault(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: [".env", "../../.env"],
      isGlobal: true,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          limit: positiveIntegerOrDefault(config.get<string>("API_RATE_LIMIT"), DEFAULT_RATE_LIMIT),
          ttl: positiveIntegerOrDefault(
            config.get<string>("API_RATE_LIMIT_TTL_MS"),
            DEFAULT_RATE_LIMIT_TTL_MS
          ),
        },
      ],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        url: config.getOrThrow<string>("DATABASE_URL"),
        ssl: config.get("DB_SSL") === "true",
        synchronize: config.get("DB_SYNCHRONIZE") === "true",
        autoLoadEntities: true,
        migrations: [
          CreateSpotifyAuth1753500000000,
          AddSpotifySyncStatus1753600000000,
          CreateSpotifyTopArtists1753700000000,
          CreateSpotifyFollowedArtists1753800000000,
          CreateSpotifyUserTags1753900000000,
          RefactorSpotifySchema1754100000000,
          CreateSpotifySavedTracks1754200000000,
          AddSpotifyArtistName1754300000000,
          ConvertPerformancesToScd21754400000000,
        ],
        migrationsRun: config.get("DB_RUN_MIGRATIONS") === "true",
      }),
    }),
    ArtistsModule,
    PerformancesModule,
    SpotifyModule,
    TagsModule,
    TracksModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
