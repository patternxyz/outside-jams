import { type Request } from "express";

export function apiBaseUrl(request: Request, configured?: string): string {
  const value = configured?.trim() || `${request.protocol}://${request.get("host")}`;
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("API_BASE_URL must use http or https");
  }
  return url.origin;
}
