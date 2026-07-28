import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OAuth2Client } from "google-auth-library";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CloudTaskAuthGuard } from "./cloud-task-auth.guard.js";

describe("CloudTaskAuthGuard", () => {
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ get: () => undefined }) }),
  };

  afterEach(() => vi.restoreAllMocks());

  it("requires an OIDC bearer token", async () => {
    const guard = new CloudTaskAuthGuard(new ConfigService());
    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("accepts a Google-signed token for the configured task identity", async () => {
    vi.spyOn(OAuth2Client.prototype, "verifyIdToken").mockResolvedValue({
      getPayload: () => ({ email: "task@example.test", email_verified: true }),
    } as never);
    const guard = new CloudTaskAuthGuard(
      new ConfigService({
        API_BASE_URL: "https://api.example.test",
        CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL: "task@example.test",
      })
    );
    const authenticatedContext = {
      switchToHttp: () => ({
        getRequest: () => ({ get: () => "Bearer signed-token" }),
      }),
    };

    await expect(guard.canActivate(authenticatedContext as never)).resolves.toBe(true);
    expect(OAuth2Client.prototype.verifyIdToken).toHaveBeenCalledWith({
      audience: "https://api.example.test",
      idToken: "signed-token",
    });
  });
});
