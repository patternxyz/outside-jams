import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { User } from "../users/entities/user.entity.js";
import { SpotifyAccount } from "./entities/spotify-account.entity.js";
import { SpotifyCredential } from "./entities/spotify-credential.entity.js";
import { SpotifyApiService } from "./spotify-api.service.js";
import { SpotifyAuthController } from "./spotify-auth.controller.js";
import { SpotifyIdentityService } from "./spotify-identity.service.js";
import { SpotifyTokenService } from "./spotify-token.service.js";
import { TokenCipherService } from "./token-cipher.service.js";

@Module({
  imports: [TypeOrmModule.forFeature([User, SpotifyAccount, SpotifyCredential])],
  controllers: [SpotifyAuthController],
  providers: [SpotifyApiService, SpotifyIdentityService, SpotifyTokenService, TokenCipherService],
  exports: [SpotifyTokenService],
})
export class SpotifyModule {}
