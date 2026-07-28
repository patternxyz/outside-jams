import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { BadRequestException, Controller, Delete, Get, Logger, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { type Request, type Response } from "express";
import { Repository } from "typeorm";

import { apiBaseUrl } from "./api-base-url.js";
import { SpotifyAccount } from "./entities/spotify-account.entity.js";
import { SpotifyCredential } from "./entities/spotify-credential.entity.js";
import { SpotifyApiService } from "./spotify-api.service.js";
import { SpotifyIdentityService } from "./spotify-identity.service.js";
import { SpotifySyncDispatcher } from "./spotify-sync.dispatcher.js";
import { SpotifyTokenService } from "./spotify-token.service.js";

type SpotifyCallbackQuery = { code?: string; error?: string; state?: string };

@Controller("auth/spotify")
export class SpotifyAuthController {
  private readonly logger = new Logger(SpotifyAuthController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly spotifyApi: SpotifyApiService,
    private readonly identity: SpotifyIdentityService,
    private readonly syncDispatcher: SpotifySyncDispatcher,
    private readonly tokenService: SpotifyTokenService,
    @InjectRepository(SpotifyAccount)
    private readonly accounts: Repository<SpotifyAccount>,
    @InjectRepository(SpotifyCredential)
    private readonly credentials: Repository<SpotifyCredential>
  ) {}

  @Get()
  connect(@Req() request: Request, @Res() response: Response): void {
    const baseUrl = apiBaseUrl(request, this.config.get<string>("API_BASE_URL"));
    const redirectUri = `${baseUrl}/api/auth/spotify/callback`;
    const state = randomBytes(32).toString("base64url");
    const codeVerifier = randomBytes(64).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
    request.session.spotifyOAuth = { state, codeVerifier };

    const authorize = new URL("https://accounts.spotify.com/authorize");
    authorize.search = new URLSearchParams({
      client_id: this.config.getOrThrow<string>("SPOTIFY_CLIENT_ID"),
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "user-top-read user-follow-read",
      show_dialog: "true",
      state,
    }).toString();

    response.redirect(authorize.toString());
  }

  @Get("callback")
  async callback(@Req() request: Request, @Res() response: Response): Promise<void> {
    const query = request.query as SpotifyCallbackQuery;
    const pending = request.session.spotifyOAuth;
    delete request.session.spotifyOAuth;

    if (query.error) {
      response.redirect("/?spotify=denied");
      return;
    }
    if (!query.code || !query.state || !pending || !this.statesMatch(query.state, pending.state)) {
      throw new BadRequestException("Invalid Spotify authorization state");
    }

    const baseUrl = apiBaseUrl(request, this.config.get<string>("API_BASE_URL"));
    let userId: string;
    try {
      const tokens = await this.spotifyApi.exchangeCode(
        query.code,
        pending.codeVerifier,
        `${baseUrl}/api/auth/spotify/callback`
      );
      const profile = await this.spotifyApi.getProfile(tokens.accessToken);
      userId = await this.identity.provision(profile, tokens, request.session.userId);
    } catch {
      response.redirect("/?spotify=error");
      return;
    }

    await new Promise<void>((resolve, reject) => {
      request.session.regenerate((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    request.session.userId = userId;
    await new Promise<void>((resolve, reject) => {
      request.session.save((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    try {
      await this.syncDispatcher.dispatch(userId);
    } catch (error) {
      // The Spotify connection is already complete. A queue outage should not
      // invalidate it or prevent the user from returning to the application.
      this.logger.error(`Could not dispatch Spotify sync for user ${userId}`, error);
    }

    response.redirect("/?spotify=connected");
  }

  @Get("status")
  async status(@Req() request: Request): Promise<{ connected: boolean; displayName?: string }> {
    if (!request.session.userId) return { connected: false };
    const [account, hasCredentials] = await Promise.all([
      this.accounts.findOneBy({ userId: request.session.userId }),
      this.credentials.existsBy({ userId: request.session.userId }),
    ]);
    return account && hasCredentials
      ? { connected: true, displayName: account.displayName }
      : { connected: false };
  }

  @Delete()
  async disconnect(@Req() request: Request): Promise<{ connected: false }> {
    const userId = request.session.userId;
    if (!userId) return { connected: false };

    await this.accounts.delete({ userId });
    this.tokenService.invalidate(userId);
    delete request.session.userId;
    return { connected: false };
  }

  private statesMatch(received: string, expected: string): boolean {
    const receivedBuffer = Buffer.from(received);
    const expectedBuffer = Buffer.from(expected);
    return (
      receivedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(receivedBuffer, expectedBuffer)
    );
  }
}
