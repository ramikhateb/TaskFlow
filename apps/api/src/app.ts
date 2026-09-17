import cors from "cors";
import express, { type Express } from "express";
import { SHARED_PACKAGE_ID } from "@taskflow/shared";
import type { Env } from "./env";
import { errorHandler } from "./middleware/errorHandler";
import { createAssignmentRoutes } from "./routes/assignmentRoutes";
import { createAuthRoutes } from "./routes/authRoutes";
import { createInboxRoutes } from "./routes/inboxRoutes";
import { createTaskRoutes } from "./routes/taskRoutes";
import { createUserRoutes } from "./routes/userRoutes";

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
  app.use("/tasks", createTaskRoutes(env));
  // Different path depth ("/:taskId/assignments...") than taskRoutes'
  // "/:id" — no route-matching ambiguity between the two routers.
  app.use("/tasks", createAssignmentRoutes(env));
  // M9: Inbox/accept/decline — a flat "/assignments" root, not nested
  // under "/tasks" (see routes/inboxRoutes.ts).
  app.use("/assignments", createInboxRoutes(env));
  app.use("/users", createUserRoutes(env));

  // Must be registered after all routes.
  app.use(errorHandler);

  return app;
}
