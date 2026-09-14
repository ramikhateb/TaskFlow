import cors from "cors";
import express, { type Express } from "express";
import { SHARED_PACKAGE_ID } from "@taskflow/shared";
import type { Env } from "./env";
import { errorHandler } from "./middleware/errorHandler";
import { createAuthRoutes } from "./routes/authRoutes";

export function createApp(env: Env): Express {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      sharedPackage: SHARED_PACKAGE_ID,
      timestamp: new Date().toISOString(),
    });
  });

  app.use("/auth", createAuthRoutes(env));

  // Must be registered after all routes.
  app.use(errorHandler);

  return app;
}
