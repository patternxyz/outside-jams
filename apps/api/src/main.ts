import "reflect-metadata";

import path from "node:path";

import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import express, { type NextFunction, type Request, type Response } from "express";

import { AppModule } from "./app.module.js";
import { configureSession } from "./session/session.middleware.js";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const webRoot = path.resolve(__dirname, "../../web/dist");

  if (config.get<string>("TRUST_PROXY") === "true") {
    app.set("trust proxy", 1);
  }
  configureSession(app, config);

  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    })
  );
  app.use(express.static(webRoot));
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (request.method !== "GET" || request.path === "/api" || request.path.startsWith("/api/")) {
      next();
      return;
    }

    response.sendFile(path.join(webRoot, "index.html"));
  });

  await app.listen(config.get<string>("PORT") ?? 3000, "0.0.0.0");
}

void bootstrap();
