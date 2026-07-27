import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    spotifyOAuth?: {
      state: string;
      codeVerifier: string;
    };
  }
}
