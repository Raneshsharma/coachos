import express from "express";
import cors from "cors";
import { analyticsEventSchema, groupProgramSchema, nutritionSwapSchema } from "@coachos/domain";
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

  app.post("/api/clients", async (req, res) => {
    const result = await store.createClient(req.body);
    if (!result.success) {
      res.status(400).json({ message: "Invalid client payload.", issues: result.issues });
      return;
    }
    res.status(201).json(result.client);
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

  // ── Client Notes ─────────────────────────────
  app.get("/api/clients/:clientId/notes", (req, res) => {
    const client = store.listClients().find((item) => item.id === req.params.clientId);
    if (!client) { res.status(404).json({ message: "Client not found." }); return; }
    res.json(store.listClientNotes(req.params.clientId));
  });

  app.post("/api/clients/:clientId/notes", async (req, res) => {
    const client = store.listClients().find((item) => item.id === req.params.clientId);
    if (!client) { res.status(404).json({ message: "Client not found." }); return; }
    if (typeof req.body.content !== "string" || !req.body.content.trim()) {
      res.status(400).json({ message: "content is required." }); return;
    }
    const note = await store.createClientNote(req.params.clientId, req.body.content);
    res.status(201).json(note);
  });

  app.delete("/api/clients/:clientId/notes/:noteId", async (req, res) => {
    const ok = await store.deleteClientNote(req.params.clientId, req.params.noteId);
    if (!ok) { res.status(404).json({ message: "Note not found." }); return; }
    res.json({ ok: true });
  });

  // ── Client Body Metrics ─────────────────────
  app.get("/api/clients/:clientId/metrics", (req, res) => {
    const client = store.listClients().find((item) => item.id === req.params.clientId);
    if (!client) { res.status(404).json({ message: "Client not found." }); return; }
    res.json(store.listBodyMetrics(req.params.clientId));
  });

  app.post("/api/clients/:clientId/metrics", async (req, res) => {
    const client = store.listClients().find((item) => item.id === req.params.clientId);
    if (!client) { res.status(404).json({ message: "Client not found." }); return; }
    if (typeof req.body.date !== "string" || !req.body.date.trim()) {
      res.status(400).json({ message: "date is required." }); return;
    }
    const metric = await store.saveBodyMetric(req.params.clientId, {
      date: req.body.date,
      weightKg: req.body.weightKg ?? null,
      bodyFatPct: req.body.bodyFatPct ?? null,
      waistCm: req.body.waistCm ?? null
    });
    res.status(201).json(metric);
  });

  // ── Session Booking ─────────────────────────
  app.post("/api/clients/:clientId/sessions", async (req, res) => {
    const client = store.listClients().find((item) => item.id === req.params.clientId);
    if (!client) { res.status(404).json({ message: "Client not found." }); return; }
    if (typeof req.body.date !== "string" || !req.body.date.trim()) {
      res.status(400).json({ message: "date is required." }); return;
    }
    if (typeof req.body.duration !== "number" || req.body.duration <= 0) {
      res.status(400).json({ message: "duration must be a positive number." }); return;
    }
    if (req.body.type !== "virtual" && req.body.type !== "in-person") {
      res.status(400).json({ message: "type must be 'virtual' or 'in-person'." }); return;
    }
    const session = await store.createSession(req.params.clientId, {
      date: req.body.date,
      duration: req.body.duration,
      type: req.body.type,
      notes: typeof req.body.notes === "string" ? req.body.notes : undefined
    });
    res.status(201).json(session);
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

  // ── Group Programs ──────────────────────────
  app.get("/api/group-programs", (req, res) => {
    res.json(store.listGroupPrograms());
  });

  app.post("/api/group-programs", async (req, res) => {
    const result = await store.createGroupProgram(req.body);
    if (!result.success) {
      res.status(400).json({ message: "Invalid program payload." });
      return;
    }
    res.status(201).json(result.program);
  });

  app.patch("/api/group-programs/:programId", async (req, res) => {
    const result = await store.updateGroupProgram(req.params.programId, req.body);
    if (!result.success) {
      if ("notFound" in result && result.notFound) { res.status(404).json({ message: "Program not found." }); return; }
      res.status(400).json({ message: "Invalid program patch." }); return;
    }
    res.json(result.program);
  });

  app.delete("/api/group-programs/:programId", async (req, res) => {
    const ok = await store.archiveGroupProgram(req.params.programId);
    if (!ok) { res.status(404).json({ message: "Program not found." }); return; }
    res.json({ ok: true });
  });

  // ── Nutrition Swap Agent ─────────────────────
  app.post("/api/nutrition/swap", (req, res) => {
    res.json(store.suggestNutritionSwap(req.body));
  });

  app.post("/api/nutrition/swap/apply", async (req, res) => {
    const result = await store.applyNutritionSwap(req.body);
    if (!result.success) {
      res.status(400).json({ message: "Invalid swap application." }); return;
    }
    res.json(result.swap);
  });

  app.get("/api/nutrition/swaps/:planId", (req, res) => {
    res.json(store.getNutritionSwaps(req.params.planId));
  });

  // ── Exercise Library ─────────────────────
  app.get("/api/exercises", (req, res) => {
    res.json(store.listExercises({
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      bodyPart: typeof req.query.bodyPart === "string" ? req.query.bodyPart : undefined,
      equipment: typeof req.query.equipment === "string" ? req.query.equipment : undefined,
    }));
  });

  // ── Recipe Library ───────────────────────
  app.get("/api/recipes", (req, res) => {
    const food = typeof req.query.food === "string" ? req.query.food : undefined;
    res.json(store.suggestRecipe(food));
  });

  // ── Habit Tracking ────────────────────────
  app.get("/api/habits", (req, res) => {
    res.json(store.listHabits(typeof req.query.clientId === "string" ? req.query.clientId : undefined));
  });

  app.get("/api/habits/summary", (req, res) => {
    const clientId = typeof req.query.clientId === "string" ? req.query.clientId : undefined;
    if (!clientId) { res.status(400).json({ message: "clientId is required." }); return; }
    res.json(store.getHabitSummary(clientId));
  });

  app.post("/api/habits", async (req, res) => {
    if (!req.body.clientId || !req.body.title || req.body.target == null || !req.body.frequency) {
      res.status(400).json({ message: "clientId, title, target, and frequency are required." }); return;
    }
    const result = await store.createHabit(req.body);
    if (!result.success) { res.status(400).json({ message: "Invalid habit payload." }); return; }
    res.status(201).json(result.habit);
  });

  app.post("/api/habits/:habitId/complete", async (req, res) => {
    const date = typeof req.body.date === "string" ? req.body.date : new Date().toISOString().slice(0, 10);
    const result = await store.toggleHabitCompletion(req.params.habitId, date);
    res.json(result.completion);
  });

  return app;
}
