/**
 * Cloudflare Workers API — self-contained, no Node.js-only imports.
 * Implements all routes directly with an in-memory store.
 * Bundle size: ~800KB (Hono only, no Express, no pg).
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { HonoType } from "hono";

// ── Domain types (re-declared to avoid pulling in the full store.ts) ──────────

interface CheckIn {
  id: string;
  clientId: string;
  submittedAt: string;
  progress: {
    weightKg?: number;
    energyScore?: number;
    steps?: number;
    notes?: string;
  };
}

interface ClientProfile {
  id: string;
  fullName: string;
  email: string;
  status: "active" | "at_risk" | "trialing" | "inactive";
  adherenceScore: number;
  monthlyPriceGbp: number;
  nextRenewalDate: string;
  goal: string;
  startDate: string;
  avatarInitials: string;
  tags: string[];
}

interface ProgramPlan {
  id: string;
  clientId: string;
  title: string;
  status: "draft" | "approved";
  latestVersion: {
    workouts: string[];
    nutrition: string[];
    explanation: string[];
  };
}

interface PaymentSubscription {
  id: string;
  clientId: string;
  status: "active" | "past_due" | "cancelled" | "trialing";
  amountGbp: number;
  renewalDate: string;
}

interface CoachWorkspace {
  id: string;
  name: string;
  brandColor: string;
  accentColor: string;
  heroMessage: string;
  stripeConnected: boolean;
}

interface CoachUser {
  id: string;
  fullName: string;
  email: string;
  avatarInitials: string;
}

interface DemoState {
  workspace: CoachWorkspace;
  coach: CoachUser;
  clients: ClientProfile[];
  plans: ProgramPlan[];
  checkIns: CheckIn[];
  subscriptions: PaymentSubscription[];
}

// ── Seed data ───────────────────────────────────────────────────────────────────

function createSeedState(): DemoState {
  return {
    workspace: {
      id: "ws_1",
      name: "CoachOS",
      brandColor: "#123f2d",
      accentColor: "#ff8757",
      heroMessage: "Elite coaching that adapts to your life.",
      stripeConnected: false,
    },
    coach: {
      id: "coach_1",
      fullName: "Alex Morgan",
      email: "alex@coachos.app",
      avatarInitials: "AM",
    },
    clients: [
      {
        id: "c_1",
        fullName: "Sophie Patel",
        email: "sophie@example.com",
        status: "active",
        adherenceScore: 87,
        monthlyPriceGbp: 149,
        nextRenewalDate: "2026-05-01",
        goal: "Lose 6kg, build strength",
        startDate: "2025-11-01",
        avatarInitials: "SP",
        tags: ["fat-loss", "strength"],
      },
      {
        id: "c_2",
        fullName: "Liam Carter",
        email: "liam@example.com",
        status: "at_risk",
        adherenceScore: 41,
        monthlyPriceGbp: 199,
        nextRenewalDate: "2026-04-15",
        goal: "Marathon prep",
        startDate: "2025-09-15",
        avatarInitials: "LC",
        tags: ["endurance", "performance"],
      },
      {
        id: "c_3",
        fullName: "Ava Thompson",
        email: "ava@example.com",
        status: "trialing",
        adherenceScore: 92,
        monthlyPriceGbp: 99,
        nextRenewalDate: "2026-04-10",
        goal: "General health",
        startDate: "2026-03-01",
        avatarInitials: "AT",
        tags: ["general-health"],
      },
    ],
    plans: [
      {
        id: "plan_1",
        clientId: "c_1",
        title: "Spring Fat-Loss Programme",
        status: "approved",
        latestVersion: {
          workouts: [
            "Upper Body Strength (Barbell)",
            "HIIT Cardio",
            "Lower Body + Core",
            "Active Recovery",
            "Full Body Conditioning",
          ],
          nutrition: [
            "Moderate deficit: 2,100 kcal",
            "High protein: 180g, moderate carbs: 150g",
            "Pre-workout window: banana + coffee",
            "Post-workout recovery meal",
            "Rest day: 1,800 kcal with 160g protein",
          ],
          explanation: [
            "Phase 1 focuses on metabolic priming and building work capacity.",
            "Protein set at 1.8g/kg to preserve lean tissue during the deficit.",
          ],
        },
      },
      {
        id: "plan_2",
        clientId: "c_2",
        title: "Marathon Build Phase 1",
        status: "draft",
        latestVersion: {
          workouts: [
            "Easy Run 8km",
            "Tempo Intervals",
            "Strength & Mobility",
            "Long Run 18km",
            "Recovery + Cross-Training",
          ],
          nutrition: [
            "High carb: 320g for training days",
            "Race day carb loading protocol",
            "Post-run protein window: 30g within 60min",
          ],
          explanation: [
            "Base building phase — 80/20 polarized training model.",
          ],
        },
      },
      {
        id: "plan_3",
        clientId: "c_3",
        title: "Trial Starter Pack",
        status: "approved",
        latestVersion: {
          workouts: ["Full Body Assessment", "Light Movement", "No plan — awaiting upgrade"],
          nutrition: ["Balanced: 2,000 kcal, 150g protein"],
          explanation: [],
        },
      },
    ],
    checkIns: [
      {
        id: "ci_1",
        clientId: "c_1",
        submittedAt: "2026-04-03T08:30:00Z",
        progress: { weightKg: 68.2, energyScore: 8, steps: 9860, notes: "Feeling strong this week!" },
      },
      {
        id: "ci_2",
        clientId: "c_2",
        submittedAt: "2026-04-03T07:15:00Z",
        progress: { weightKg: 74.1, energyScore: 4, steps: 3200, notes: "Hamstring tight, took it easy." },
      },
      {
        id: "ci_3",
        clientId: "c_3",
        submittedAt: "2026-04-02T09:00:00Z",
        progress: { weightKg: 61.5, energyScore: 9, steps: 11200 },
      },
    ],
    subscriptions: [
      { id: "sub_1", clientId: "c_1", status: "active", amountGbp: 149, renewalDate: "2026-05-01" },
      { id: "sub_2", clientId: "c_2", status: "past_due", amountGbp: 199, renewalDate: "2026-04-15" },
      { id: "sub_3", clientId: "c_3", status: "trialing", amountGbp: 99, renewalDate: "2026-04-10" },
    ],
  };
}

// ── In-memory store ────────────────────────────────────────────────────────────

class InMemoryStore {
  private state: DemoState = createSeedState();

  getState() { return this.state; }
  setState(s: DemoState) { this.state = s; }

  getCoachSession() {
    return {
      workspace: this.state.workspace,
      coach: this.state.coach,
      clients: this.state.clients,
      plans: this.state.plans,
      subscriptions: this.state.subscriptions,
    };
  }

  getClientSession(clientId: string) {
    const client = this.state.clients.find(c => c.id === clientId);
    if (!client) return null;
    const plan = this.state.plans.find(p => p.clientId === clientId) ?? null;
    const checkIns = this.state.checkIns.filter(ci => ci.clientId === clientId);
    const latest = checkIns.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0] ?? null;
    const messages: Array<{ id: string; sender: string; content: string; sentAt: string }> = [
      { id: "msg_1", sender: "coach", content: "Great work today! Keep it up.", sentAt: "2026-04-03T10:00:00Z" },
      { id: "msg_2", sender: "client", content: "Thanks! The session was tough but I loved it.", sentAt: "2026-04-03T10:15:00Z" },
    ];
    return { client, plan, latestCheckIn: latest, proofCard: null, messages };
  }

  listClients({ status, search }: { status?: string; search?: string } = {}) {
    let clients = [...this.state.clients];
    if (status) clients = clients.filter(c => c.status === status);
    if (search) {
      const q = search.toLowerCase();
      clients = clients.filter(c => c.fullName.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
    }
    return clients;
  }

  listPlans({ status, clientId }: { status?: string; clientId?: string } = {}) {
    let plans = [...this.state.plans];
    if (status) plans = plans.filter(p => p.status === status);
    if (clientId) plans = plans.filter(p => p.clientId === clientId);
    return plans;
  }

  generatePlan(clientId: string) {
    const client = this.state.clients.find(c => c.id === clientId);
    if (!client) return null;
    const existing = this.state.plans.find(p => p.clientId === clientId);
    if (existing) {
      existing.status = "draft";
      existing.latestVersion.workouts = [
        "Upper Body Hypertrophy", "LISS Cardio", "Lower Body Strength",
        "Mobility & Recovery", "Full Body Conditioning",
      ];
      existing.latestVersion.explanation = ["Auto-adjusted based on recent check-ins."];
      return existing;
    }
    const plan: ProgramPlan = {
      id: `plan_${Date.now()}`,
      clientId,
      title: `${client.goal.split(",")[0]} Programme`,
      status: "draft",
      latestVersion: {
        workouts: ["Mobility Assessment", "Strength Base", "Conditioning", "Recovery Walk", "Full Programme"],
        nutrition: ["Moderate calorie target", "High protein focus", "Timing around training"],
        explanation: ["AI-generated draft based on client profile and goals."],
      },
    };
    this.state.plans.push(plan);
    return plan;
  }

  approvePlan(planId: string) {
    const plan = this.state.plans.find(p => p.id === planId);
    if (!plan) return null;
    plan.status = "approved";
    return plan;
  }

  listCheckIns({ clientId }: { clientId?: string } = {}) {
    let cis = [...this.state.checkIns];
    if (clientId) cis = cis.filter(ci => ci.clientId === clientId);
    return cis.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }

  submitCheckIn(body: { clientId: string; progress: CheckIn["progress"] }) {
    const checkIn: CheckIn = {
      id: `ci_${Date.now()}`,
      clientId: body.clientId,
      submittedAt: new Date().toISOString(),
      progress: body.progress ?? {},
    };
    this.state.checkIns.push(checkIn);
    // Recalculate adherence
    const client = this.state.clients.find(c => c.id === body.clientId);
    if (client) {
      const all = this.state.checkIns.filter(ci => ci.clientId === body.clientId);
      client.adherenceScore = Math.min(100, Math.round((all.length / 14) * 100));
    }
    return { success: true as const, checkIn };
  }

  updateClient(clientId: string, patch: Partial<ClientProfile>) {
    const client = this.state.clients.find(c => c.id === clientId);
    if (!client) return { success: false as const, notFound: true as const };
    Object.assign(client, patch);
    return { success: true as const, client };
  }

  getBillingSummary() {
    const active = this.state.subscriptions.filter(s => s.status === "active");
    const pastDue = this.state.subscriptions.filter(s => s.status === "past_due");
    const mrr = active.reduce((sum, s) => sum + s.amountGbp, 0);
    return {
      mrrGbp: mrr,
      activeSubscriptions: active.length,
      churnRiskCount: pastDue.length,
      subscriptions: this.state.subscriptions,
    };
  }

  updateBilling(clientId: string, status: PaymentSubscription["status"]) {
    const sub = this.state.subscriptions.find(s => s.clientId === clientId);
    if (sub) sub.status = status;
    return { ok: true };
  }

  getMorningDashboard() {
    const today = new Date().toISOString().slice(0, 10);
    const checkedInToday = this.state.checkIns.filter(ci => ci.submittedAt.slice(0, 10) === today).length;
    const atRisk = this.state.clients.filter(c => c.adherenceScore < 60);
    return {
      activeClients: this.state.clients.filter(c => c.status === "active").length,
      checkedInToday,
      dueRenewals: this.state.subscriptions.filter(s => s.status === "past_due").length,
      revenueSnapshotGbp: this.state.subscriptions
        .filter(s => s.status === "active")
        .reduce((sum, s) => sum + s.amountGbp, 0),
      atRiskClients: atRisk.map(c => ({
        clientId: c.id,
        severity: c.adherenceScore < 40 ? "high" : "medium" as "high" | "medium",
        reasons: [`Adherence at ${c.adherenceScore}%`, "No check-in in 5+ days"],
        recommendedAction: "Send recovery check-in + payment nudge",
      })),
    };
  }

  getAnalytics() {
    const events = this.state.checkIns.map(ci => ({
      name: "check_in_submitted",
      actorId: ci.clientId,
      occurredAt: ci.submittedAt,
      metadata: ci.progress as Record<string, string | number | boolean>,
    }));
    return {
      events,
      summary: { totalEvents: events.length, topEvents: [{ name: "check_in_submitted", count: events.length }], lastEventAt: events[0]?.occurredAt ?? null },
    };
  }

  getRuntimeInfo() {
    return { storage: "in-memory", stateFilePath: null, services: { planGeneration: "mock", proofCards: "mock", billing: "mock" } };
  }

  updateWorkspace(body: Partial<CoachWorkspace>) {
    Object.assign(this.state.workspace, body);
    return this.state.workspace;
  }

  listGroupPrograms() { return []; }
  createGroupProgram(body: object) { return { success: true as const, program: body }; }
  updateGroupProgram(id: string, body: object) { return { success: true, program: { id, ...body }, notFound: false }; }
  archiveGroupProgram(_id: string) { return true; }

  suggestNutritionSwap(_body: object) {
    return {
      original: { name: "White Rice", calories: 200, proteinG: 4, carbsG: 45, fatG: 0.5, portion: "150g cooked" },
      suggestion: { name: "Quinoa", calories: 185, proteinG: 8, carbsG: 35, fatG: 3, portion: "150g cooked", reasoning: "Higher protein and fibre for sustained energy." },
    };
  }
  applyNutritionSwap(_body: object) { return { success: true, swap: {} }; }
  getNutritionSwaps(_planId: string) { return []; }

  listExercises(_opts: { search?: string; bodyPart?: string; equipment?: string } = {}) {
    return [
      { id: "ex_1", name: "Barbell Bench Press", bodyPart: "Chest", equipment: "Barbell", goal: "Strength", difficulty: "intermediate", instructions: "Lie flat, lower bar to mid-chest, press up." },
      { id: "ex_2", name: "Deadlift", bodyPart: "Back", equipment: "Barbell", goal: "Strength", difficulty: "intermediate", instructions: "Hip-hinge, drive through heels." },
      { id: "ex_3", name: "Barbell Back Squat", bodyPart: "Legs", equipment: "Barbell", goal: "Hypertrophy", difficulty: "intermediate", instructions: "Bar on traps, squat to depth." },
      { id: "ex_4", name: "Pull-Up", bodyPart: "Back", equipment: "Bodyweight", goal: "Strength", difficulty: "intermediate", instructions: "Overhand grip, pull chest to bar." },
      { id: "ex_5", name: "Plank", bodyPart: "Core", equipment: "Bodyweight", goal: "Endurance", difficulty: "beginner", instructions: "Forearms on floor, hold straight line." },
    ];
  }

  suggestRecipe(_food?: string) {
    return {
      id: "r_1",
      name: "High-Protein Chicken Bowl",
      ingredients: ["200g chicken breast", "150g brown rice", "100g broccoli", "1 tbsp olive oil", "Salt & pepper"],
      steps: ["Season and grill chicken.", "Cook rice according to packet.", "Steam broccoli.", "Combine in bowl.", "Drizzle with olive oil."],
      calories: 620, proteinG: 52, carbsG: 65, fatG: 12, prepTime: 10, cookTime: 25, tags: ["meal-prep", "high-protein"],
    };
  }

  listHabits(_clientId?: string) {
    return [
      { id: "h_1", clientId: "c_1", title: "Log meals in the app", target: 1, frequency: "daily", createdAt: "2026-01-01" },
      { id: "h_2", clientId: "c_1", title: "Hit 8,000 steps", target: 1, frequency: "daily", createdAt: "2026-01-01" },
      { id: "h_3", clientId: "c_2", title: "Complete weekly check-in", target: 1, frequency: "weekly", createdAt: "2026-02-01" },
    ];
  }

  getHabitSummary(clientId: string) {
    return [
      { habit: { id: "h_1", clientId, title: "Log meals in the app", target: 1, frequency: "daily", createdAt: "2026-01-01" }, streak: 5, todayDone: true, totalCompletions: 12 },
      { habit: { id: "h_2", clientId, title: "Hit 8,000 steps", target: 1, frequency: "daily", createdAt: "2026-01-01" }, streak: 3, todayDone: false, totalCompletions: 8 },
    ];
  }

  createHabit(body: { clientId: string; title: string; target: number; frequency: string }) {
    const habit = { id: `h_${Date.now()}`, clientId: body.clientId, title: body.title, target: body.target, frequency: body.frequency as "daily" | "weekly", createdAt: new Date().toISOString() };
    return { success: true, habit };
  }

  toggleHabitCompletion(habitId: string, _date: string) {
    return { completion: { habitId, completed: true, date: _date } };
  }

  exportData() { return this.state; }

  async resetData() {
    this.state = createSeedState();
    return this.getCoachSession();
  }

  restoreData(snapshot: DemoState) {
    this.state = snapshot;
    return { success: true, state: snapshot };
  }
}

// Singleton store
const store = new InMemoryStore();

// ── Hono app ───────────────────────────────────────────────────────────────────

const app = new Hono();

app.use("/*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type"],
}));

app.get("/api/health", (c) => c.json({ ok: true, service: "coachos-api" }));
app.get("/api/runtime", (c) => c.json(store.getRuntimeInfo()));

app.get("/api/session/coach", (c) => c.json(store.getCoachSession()));

app.get("/api/session/client/:clientId", (c) => {
  const s = store.getClientSession(c.req.param("clientId"));
  return s ? c.json(s) : c.json({ message: "Client not found." }, 404);
});

app.get("/api/clients", (c) =>
  c.json(store.listClients({ status: c.req.query("status"), search: c.req.query("search") }))
);

app.get("/api/clients/:clientId", (c) => {
  const client = store.listClients().find(item => item.id === c.req.param("clientId"));
  return client ? c.json(client) : c.json({ message: "Client not found." }, 404);
});

app.patch("/api/clients/:clientId", async (c) => {
  const body = await c.req.json();
  const result = store.updateClient(c.req.param("clientId"), body);
  if (!result.success) return result.notFound
    ? c.json({ message: "Client not found." }, 404)
    : c.json({ message: "Invalid client patch." }, 400);
  return c.json(result.client);
});

app.get("/api/plans", (c) =>
  c.json(store.listPlans({ status: c.req.query("status"), clientId: c.req.query("clientId") }))
);

app.post("/api/plans/generate", async (c) => {
  const { clientId } = await c.req.json<{ clientId: string }>();
  const plan = store.generatePlan(clientId);
  return plan ? c.json(plan) : c.json({ message: "Client not found." }, 404);
});

app.post("/api/plans/:planId/approve", async (c) => {
  const plan = store.approvePlan(c.req.param("planId"));
  return plan ? c.json(plan) : c.json({ message: "Plan not found." }, 404);
});

app.get("/api/check-ins", (c) =>
  c.json(store.listCheckIns({ clientId: c.req.query("clientId") }))
);

app.post("/api/check-ins", async (c) => {
  const body = await c.req.json();
  const result = store.submitCheckIn(body);
  return result.success ? c.json(result) : c.json({ message: "Invalid check-in payload." }, 400);
});

app.get("/api/messages/:clientId", (c) => {
  const session = store.getClientSession(c.req.param("clientId"));
  return c.json(session?.messages ?? []);
});

app.get("/api/dashboard/morning", (c) => c.json(store.getMorningDashboard()));
app.get("/api/billing", (c) => c.json(store.getBillingSummary()));
app.get("/api/analytics", (c) => c.json(store.getAnalytics()));
app.get("/api/export", (c) => c.json(store.exportData()));

app.post("/api/billing/webhooks/stripe", async (c) => {
  const { clientId, status } = await c.req.json<{ clientId?: string; status?: string }>();
  if (!clientId || !status) return c.json({ message: "clientId and status required." }, 400);
  return c.json(store.updateBilling(clientId, status as "active" | "past_due" | "cancelled"));
});

app.post("/api/onboarding", async (c) => c.json(store.updateWorkspace(await c.req.json())));

app.post("/api/admin/state/reset", async (c) =>
  c.json({ ok: true, session: await store.resetData() })
);

app.get("/api/group-programs", (c) => c.json(store.listGroupPrograms()));
app.post("/api/group-programs", async (c) => {
  const body = await c.req.json();
  return c.json(store.createGroupProgram(body).program, 201);
});

app.get("/api/exercises", (c) =>
  c.json(store.listExercises({ search: c.req.query("search"), bodyPart: c.req.query("bodyPart"), equipment: c.req.query("equipment") }))
);

app.get("/api/recipes", (c) => c.json(store.suggestRecipe(c.req.query("food") ?? undefined)));

app.get("/api/habits", (c) => c.json(store.listHabits(c.req.query("clientId") ?? undefined)));
app.get("/api/habits/summary", (c) => {
  const clientId = c.req.query("clientId");
  if (!clientId) return c.json({ message: "clientId is required." }, 400);
  return c.json(store.getHabitSummary(clientId));
});
app.post("/api/habits", async (c) => {
  const body = await c.req.json();
  if (!body.clientId || !body.title || body.target == null || !body.frequency)
    return c.json({ message: "clientId, title, target, and frequency required." }, 400);
  return c.json(store.createHabit(body).habit, 201);
});
app.post("/api/habits/:habitId/complete", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json(store.toggleHabitCompletion(c.req.param("habitId"), body.date ?? new Date().toISOString().slice(0, 10)));
});

app.post("/api/nutrition/swap", async (c) => c.json(store.suggestNutritionSwap(await c.req.json())));
app.post("/api/nutrition/swap/apply", async (c) => c.json(store.applyNutritionSwap(await c.req.json()).swap));

export default {
  fetch: app.fetch,
};
