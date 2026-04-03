import express from "express";
import cors from "cors";
import { analyticsEventSchema } from "@coachos/domain";
import { DemoStore } from "./store";

export function createApp(store: DemoStore) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "coachos-api" });
  });

  app.get("/api/runtime", (_req, res) => {
    res.json(store.getRuntimeInfo());
  });

  app.get("/api/session/coach", (_req, res) => {
    res.json(store.getCoachSession());
  });

  app.get("/api/session/client/:clientId", (req, res) => {
    const session = store.getClientSession(req.params.clientId);
    if (!session) {
      res.status(404).json({ message: "Client not found." });
      return;
    }
    res.json(session);
  });

  app.get("/api/clients", (req, res) => {
    res.json(
      store.listClients({
        status: typeof req.query.status === "string" ? req.query.status : undefined,
        search: typeof req.query.search === "string" ? req.query.search : undefined
      })
    );
  });

  app.get("/api/clients/:clientId", (req, res) => {
    const client = store.listClients().find((item) => item.id === req.params.clientId);
    if (!client) {
      res.status(404).json({ message: "Client not found." });
      return;
    }
    res.json(client);
  });

  app.patch("/api/clients/:clientId", async (req, res) => {
    const result = await store.updateClient(req.params.clientId, req.body);
    if (!result.success) {
      if ("notFound" in result && result.notFound) {
        res.status(404).json({ message: "Client not found." });
        return;
      }
      res.status(400).json({ message: "Invalid client patch.", issues: result.issues });
      return;
    }
    res.json(result.client);
  });

  app.get("/api/plans", (req, res) => {
    res.json(
      store.listPlans({
        status: typeof req.query.status === "string" ? req.query.status : undefined,
        clientId: typeof req.query.clientId === "string" ? req.query.clientId : undefined
      })
    );
  });

  app.get("/api/check-ins", (req, res) => {
    res.json(
      store.listCheckIns({
        clientId: typeof req.query.clientId === "string" ? req.query.clientId : undefined
      })
    );
  });

  app.get("/api/messages/:clientId", (req, res) => {
    res.json(store.listMessages(req.params.clientId));
  });

  app.post("/api/messages", async (req, res) => {
    if (!req.body.clientId || !req.body.content || !req.body.sender) {
      res.status(400).json({ message: "Missing required message fields." });
      return;
    }
    const result = await store.sendMessage(req.body);
    res.json(result);
  });

  app.post("/api/onboarding", async (req, res) => {
    res.json(await store.updateWorkspace(req.body));
  });

  app.post("/api/import/preview", (req, res) => {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    res.json(store.previewImport(rows));
  });

  app.post("/api/import/commit", async (req, res) => {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    res.json(await store.commitImport(rows));
  });

  app.get("/api/export", (_req, res) => {
    res.json(store.exportData());
  });

  app.post("/api/admin/state/import", async (req, res) => {
    const snapshot = req.body?.data ?? req.body;
    const result = await store.restoreData(snapshot);
    if (!result.success) {
      res.status(400).json({ message: "Invalid state snapshot.", issues: result.issues });
      return;
    }
    res.json({ ok: true, state: result.state });
  });

  app.post("/api/admin/state/reset", async (_req, res) => {
    res.json({ ok: true, session: await store.resetData() });
  });

  app.post("/api/plans/generate", async (req, res) => {
    const plan = await store.generatePlan(req.body.clientId);
    if (!plan) {
      res.status(404).json({ message: "Client not found." });
      return;
    }
    res.json(plan);
  });

  app.post("/api/plans/:planId/approve", async (req, res) => {
    const plan = await store.approvePlan(req.params.planId);
    if (!plan) {
      res.status(404).json({ message: "Plan not found." });
      return;
    }
    res.json(plan);
  });

  app.post("/api/check-ins", async (req, res) => {
    const result = await store.submitCheckIn(req.body);
    if (!result.success) {
      res.status(400).json({ message: "Invalid check-in payload.", issues: result.issues });
      return;
    }
    res.json(result);
  });

  app.get("/api/dashboard/morning", async (_req, res) => {
    res.json(await store.getMorningDashboard());
  });

  app.get("/api/billing", (_req, res) => {
    res.json(store.getBillingSummary());
  });

  app.post("/api/billing/webhooks/stripe", async (req, res) => {
    const { clientId, status } = req.body as { clientId?: string; status?: "active" | "past_due" | "cancelled" };
    if (!clientId || !status) {
      res.status(400).json({ message: "clientId and status are required." });
      return;
    }
    res.json(await store.updateBilling(clientId, status));
  });

  app.get("/api/proof-cards/:clientId", async (req, res) => {
    const proofCard = await store.getProofCard(req.params.clientId);
    if (!proofCard) {
      res.status(404).json({ message: "Client not found." });
      return;
    }
    res.json(proofCard);
  });

  app.get("/api/analytics", (_req, res) => {
    res.json(store.getAnalytics());
  });

  app.post("/api/analytics", async (req, res) => {
    const result = await store.recordAnalytics(req.body);
    if (!result.success) {
      res.status(400).json({ message: "Invalid analytics event.", issues: result.issues });
      return;
    }
    res.status(201).json(result.event);
  });

  app.get("/api/analytics/schema", (_req, res) => {
    res.json({ eventNames: analyticsEventSchema.shape.name.options });
  });

  return app;
}
