import { CloudTasksClient, protos } from "@google-cloud/tasks";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { SpotifySyncService } from "./spotify-sync.service.js";

@Injectable()
export class SpotifySyncDispatcher {
  private readonly client = new CloudTasksClient();
  private readonly logger = new Logger(SpotifySyncDispatcher.name);

  constructor(
    private readonly config: ConfigService,
    private readonly syncService: SpotifySyncService
  ) {}

  async dispatch(userId: string): Promise<void> {
    const nodeEnv = this.config.get<string>("NODE_ENV");
    if (nodeEnv === "development" || nodeEnv === "dev") {
      setImmediate(() => {
        void this.syncService.sync(userId).catch((error: unknown) => {
          this.logger.error(`Development Spotify sync failed for user ${userId}`, error);
        });
      });
      return;
    }

    const project = this.config.getOrThrow<string>("GCP_PROJECT_ID");
    const location = this.config.getOrThrow<string>("GCP_REGION");
    const queue = this.config.getOrThrow<string>("CLOUD_TASKS_QUEUE");
    const serviceAccountEmail = this.config.getOrThrow<string>("CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL");
    const apiBaseUrl = this.config.getOrThrow<string>("API_BASE_URL").replace(/\/$/, "");
    const audience = this.config.get<string>("CLOUD_TASKS_AUDIENCE") || apiBaseUrl;

    await this.client.createTask({
      parent: this.client.queuePath(project, location, queue),
      task: {
        httpRequest: {
          body: Buffer.from(JSON.stringify({ userId })).toString("base64"),
          headers: { "Content-Type": "application/json" },
          httpMethod: protos.google.cloud.tasks.v2.HttpMethod.POST,
          oidcToken: { audience, serviceAccountEmail },
          url: `${apiBaseUrl}/api/internal/spotify/sync`,
        },
      },
    });
  }
}
