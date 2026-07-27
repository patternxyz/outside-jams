import { type INestApplication } from "@nestjs/common";
import { type ConfigService } from "@nestjs/config";
import connectPgSimple from "connect-pg-simple";
import session from "express-session";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1_000;

export function configureSession(app: INestApplication, config: ConfigService): void {
  const PgStore = connectPgSimple(session);
  const production = config.get<string>("NODE_ENV") === "production";
  const secret = config.getOrThrow<string>("SESSION_SECRET");
  if (secret.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters");
  }

  app.use(
    session({
      name: "outside_jams_session",
      secret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      store: new PgStore({
        conObject: {
          connectionString: config.getOrThrow<string>("DATABASE_URL"),
          ssl: config.get<string>("DB_SSL") === "true",
        },
        createTableIfMissing: false,
        schemaName: "public",
        tableName: "sessions",
      }),
      cookie: {
        httpOnly: true,
        maxAge: THIRTY_DAYS_MS,
        sameSite: "lax",
        secure: production,
      },
    })
  );
}
