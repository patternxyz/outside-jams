import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { type Request } from "express";
import { OAuth2Client } from "google-auth-library";

@Injectable()
export class CloudTaskAuthGuard implements CanActivate {
  private readonly verifier = new OAuth2Client();

  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.get("authorization");
    const token = authorization?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) throw new UnauthorizedException("Cloud Task identity is required");

    try {
      const apiBaseUrl = this.config.getOrThrow<string>("API_BASE_URL").replace(/\/$/, "");
      const ticket = await this.verifier.verifyIdToken({
        audience: this.config.get<string>("CLOUD_TASKS_AUDIENCE") || apiBaseUrl,
        idToken: token,
      });
      const payload = ticket.getPayload();
      const expectedEmail = this.config.getOrThrow<string>("CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL");
      if (!payload?.email_verified || payload.email !== expectedEmail) {
        throw new UnauthorizedException("Unexpected Cloud Task identity");
      }
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException("Invalid Cloud Task identity");
    }
  }
}
