import * as functions from "firebase-functions";
import { createApp } from "../../apps/api/src/app";
import { createPersistentStore } from "../../apps/api/src/bootstrap";
import type { Express } from "express";

// Cache the Express app across warm Cloud Function invocations
// so in-memory state persists between requests on the same instance.
let appPromise: Promise<Express> | null = null;

function getApp(): Promise<Express> {
  if (!appPromise) {
    appPromise = createPersistentStore(process.env)
      .then((store) => createApp(store))
      .catch((err) => {
        appPromise = null; // reset so next request retries
        throw err;
      });
  }
  return appPromise;
}

// Firebase rewrites /api/** to this function.
// The full path (e.g. /api/health) is preserved, which Express matches correctly.
export const api = functions.https.onRequest(async (req, res) => {
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
});
