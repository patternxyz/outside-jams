export type SpotifyTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string[];
};

export type SpotifyProfile = {
  id: string;
  displayName: string;
};

export type CachedSpotifyTokens = SpotifyTokens & {
  userId: string;
  accountId: string;
};
