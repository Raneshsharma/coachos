import { createApp } from "../apps/api/src/app";
import { createPersistentStore } from "../apps/api/src/bootstrap";
import type { Express } from "express";

// Cache the app instance across warm lambda invocations.
// This is critical for InMemoryDemoStateRepository (used on Vercel without a DB)
// so that state isn't wiped on every request.
let appPromise: Promise<Express> | null = null;

function getApp(): Promise<Express> {
  if (!appPromise) {
    appPromise = createPersistentStore(process.env)
      .then((store) => createApp(store))
      .catch((err) => {
        // Reset so the next request retries initialisation
        appPromise = null;
        throw err;
      });
  }
  return appPromise;
}

export default async function handler(req: any, res: any) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (err: any) {
    console.error("[CoachOS] Fatal handler error:", err);
    res.status(500).json({
      error: "Internal Server Error",
      message: err?.message ?? "Unknown error during API initialisation"
    });
  }
}
