import "reflect-metadata";

import path from "node:path";

import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import express, { type NextFunction, type Request, type Response } from "express";

import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const webRoot = path.resolve(__dirname, "../../web/dist");

  app.setGlobalPrefix("api");
  app.use(express.static(webRoot));
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (request.method !== "GET" || request.path === "/api" || request.path.startsWith("/api/")) {
      next();
      return;
    }

    response.sendFile(path.join(webRoot, "index.html"));
  });

  await app.listen(process.env.PORT ?? 3000, "0.0.0.0");
}

void bootstrap();
