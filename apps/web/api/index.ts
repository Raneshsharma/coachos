import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createApp } from "../../../apps/api/src/app";
import { DemoStore } from "../../../apps/api/src/store";
import { InMemoryDemoStateRepository } from "../../../apps/api/src/store";
import { createMockServiceAdapters } from "../../../apps/api/src/services";

// Module-level singleton — persists across warm Lambda invocations within the same execution context
let _store: DemoStore | null = null;

async function getStore(): Promise<DemoStore> {
  if (!_store) {
    const repo = new InMemoryDemoStateRepository();
    _store = await DemoStore.create(repo, createMockServiceAdapters());
  }
  return _store;
}

export default async (req: VercelRequest, res: VercelResponse) => {
  const store = await getStore();
  const app = createApp(store);

  // Strip the leading /api prefix so Express routes match
  const pathname = (req.url as string | undefined) ?? "/";
  req.url = pathname.replace(/^\/api/, "") || "/";

  // Allow requests from any Vercel preview/production domain
  const origin = process.env.VERCEL_FRONTEND_URL ?? "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // Express handles the request
  app(req as never, res as never);
};
