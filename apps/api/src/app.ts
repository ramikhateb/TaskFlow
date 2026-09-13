import cors from "cors";
import express, { type Express } from "express";
import { SHARED_PACKAGE_ID } from "@taskflow/shared";

export function createApp(): Express {
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

  return app;
}
