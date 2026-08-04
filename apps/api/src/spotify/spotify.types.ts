export type SpotifyTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string[];
};

export type SpotifyProfile = {
  id: string;
  displayName: string;
  image: string | null;
};

export type SpotifyArtist = {
  id: string;
  name: string | null;
};

export type SpotifySavedTrack = {
  trackId: string;
  artists: SpotifyArtist[];
};

export type CachedSpotifyTokens = SpotifyTokens & {
  userId: string;
  accountId: string;
};
