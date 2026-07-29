import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { User } from "../users/entities/user.entity.js";
import { SpotifyAccount } from "./entities/spotify-account.entity.js";
import { SpotifyCredential } from "./entities/spotify-credential.entity.js";
import { SpotifyApiService } from "./spotify-api.service.js";
import { SpotifyAuthController } from "./spotify-auth.controller.js";
import { CloudTaskAuthGuard } from "./cloud-task-auth.guard.js";
import { SpotifyIdentityService } from "./spotify-identity.service.js";
import { SpotifyProfileController } from "./spotify-profile.controller.js";
import { SpotifySyncController } from "./spotify-sync.controller.js";
import { SpotifySyncCoordinator } from "./spotify-sync.coordinator.js";
import { SpotifySyncDispatcher } from "./spotify-sync.dispatcher.js";
import { SpotifySyncService } from "./spotify-sync.service.js";
import { SpotifyTokenService } from "./spotify-token.service.js";
import { TokenCipherService } from "./token-cipher.service.js";

@Module({
  imports: [TypeOrmModule.forFeature([User, SpotifyAccount, SpotifyCredential])],
  controllers: [SpotifyAuthController, SpotifyProfileController, SpotifySyncController],
  providers: [
    CloudTaskAuthGuard,
    SpotifyApiService,
    SpotifyIdentityService,
    SpotifySyncCoordinator,
    SpotifySyncDispatcher,
    SpotifySyncService,
    SpotifyTokenService,
    TokenCipherService,
  ],
  exports: [SpotifyTokenService],
})
export class SpotifyModule {}
