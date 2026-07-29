import { Controller, Get, Req, UnauthorizedException } from "@nestjs/common";
import { type Request } from "express";

import { SpotifyProfileResponseDto } from "./dto/spotify-profile-response.dto.js";
import { SpotifyApiService } from "./spotify-api.service.js";
import { SpotifyTokenService } from "./spotify-token.service.js";

@Controller("auth/spotify/profile")
export class SpotifyProfileController {
  constructor(
    private readonly tokenService: SpotifyTokenService,
    private readonly spotifyApi: SpotifyApiService
  ) {}

  @Get()
  async profile(@Req() request: Request): Promise<SpotifyProfileResponseDto> {
    const userId = request.session.userId;
    if (!userId) throw new UnauthorizedException("Spotify is not connected");

    const accessToken = await this.tokenService.getValidAccessToken(userId);
    const profile = await this.spotifyApi.getProfile(accessToken);
    return { name: profile.displayName, image: profile.image };
  }
}
