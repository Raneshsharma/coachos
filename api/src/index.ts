/**
 * Cloudflare Workers API — backed by Supabase PostgreSQL.
 * All routes mirror the original in-memory API so the frontend is unchanged.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { supabase } from "./supabase";

// ── Domain types ───────────────────────────────────────────────────────────────

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

// ── DB → API shape helpers ────────────────────────────────────────────────────

function mapClient(row: Record<string, unknown>): ClientProfile {
  return {
    id: row.id as string,
    fullName: row.full_name as string,
    email: row.email as string,
    status: row.status as ClientProfile["status"],
    adherenceScore: row.adherence_score as number,
    monthlyPriceGbp: row.monthly_price_gbp as number,
    nextRenewalDate: (row.next_renewal_date as string) ?? "",
    goal: (row.goal as string) ?? "",
    startDate: (row.start_date as string) ?? "",
    avatarInitials: (row.avatar_initials as string) ?? "",
    tags: (row.tags as string[]) ?? [],
  };
}

function mapPlan(row: Record<string, unknown>): ProgramPlan {
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    title: row.title as string,
    status: row.status as ProgramPlan["status"],
    latestVersion: {
      workouts: (row.workouts as string[]) ?? [],
      nutrition: (row.nutrition as string[]) ?? [],
      explanation: (row.explanation as string[]) ?? [],
    },
  };
}

function mapCheckIn(row: Record<string, unknown>): CheckIn {
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    submittedAt: row.submitted_at as string,
    progress: {
      weightKg: row.weight_kg as number | undefined,
      energyScore: row.energy_score as number | undefined,
      steps: row.steps as number | undefined,
      notes: row.notes as string | undefined,
    },
  };
}

function mapSubscription(row: Record<string, unknown>): PaymentSubscription {
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    status: row.status as PaymentSubscription["status"],
    amountGbp: row.amount_gbp as number,
    renewalDate: (row.renewal_date as string) ?? "",
  };
}

// ── Store operations ─────────────────────────────────────────────────────────

async function getWorkspace(): Promise<CoachWorkspace | null> {
  const { data } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", "ws_1")
    .single();
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    brandColor: data.brand_color,
    accentColor: data.accent_color,
    heroMessage: data.hero_message,
    stripeConnected: data.stripe_connected,
  };
}

async function getCoach(): Promise<CoachUser | null> {
  const { data } = await supabase
    .from("coaches")
    .select("*")
    .eq("id", "coach_1")
    .single();
  if (!data) return null;
  return {
    id: data.id,
    fullName: data.full_name,
    email: data.email,
    avatarInitials: data.avatar_initials,
  };
}

async function listClients(opts: { status?: string; search?: string } = {}) {
  let q = supabase.from("clients").select("*").eq("workspace_id", "ws_1");
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.search) {
    q = q.or(`full_name.ilike.%${opts.search}%,email.ilike.%${opts.search}%`);
  }
  const { data } = await q;
  return (data ?? []).map(mapClient);
}

async function getClient(id: string) {
  const { data } = await supabase.from("clients").select("*").eq("id", id).single();
  return data ? mapClient(data) : null;
}

async function updateClient(id: string, patch: Partial<ClientProfile>) {
  const { data } = await supabase
    .from("clients")
    .update({
      full_name: patch.fullName,
      email: patch.email,
      status: patch.status,
      adherence_score: patch.adherenceScore,
      monthly_price_gbp: patch.monthlyPriceGbp,
      next_renewal_date: patch.nextRenewalDate,
      goal: patch.goal,
      start_date: patch.startDate,
      avatar_initials: patch.avatarInitials,
      tags: patch.tags,
    })
    .eq("id", id)
    .select()
    .single();
  return data ? mapClient(data) : null;
}

async function createClient(body: {
  fullName: string;
  email: string;
  goal: string;
  monthlyPriceGbp: number;
  nextRenewalDate: string;
  status: ClientProfile["status"];
}) {
  // Derive avatar initials
  const initials = body.fullName
    .split(" ")
    .map(p => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const { data } = await supabase
    .from("clients")
    .insert({
      workspace_id: "ws_1",
      full_name: body.fullName,
      email: body.email,
      goal: body.goal,
      monthly_price_gbp: body.monthlyPriceGbp,
      next_renewal_date: body.nextRenewalDate,
      status: body.status,
      adherence_score: 0,
      avatar_initials: initials,
      tags: [],
      start_date: new Date().toISOString().slice(0, 10),
    })
    .select()
    .single();

  if (!data) return null;

  // Auto-create a subscription record
  await supabase.from("subscriptions").insert({
    client_id: data.id,
    status: "active",
    amount_gbp: body.monthlyPriceGbp,
    renewal_date: body.nextRenewalDate,
  });

  return mapClient(data);
}

async function listPlans(opts: { status?: string; clientId?: string } = {}) {
  let q = supabase.from("plans").select("*");
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  const { data } = await q;
  return (data ?? []).map(mapPlan);
}

async function getPlan(id: string) {
  const { data } = await supabase.from("plans").select("*").eq("id", id).single();
  return data ? mapPlan(data) : null;
}

async function generatePlan(clientId: string) {
  const client = await getClient(clientId);
  if (!client) return null;

  const { data: existing } = await supabase
    .from("plans")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();

  if (existing) {
    const { data } = await supabase
      .from("plans")
      .update({
        status: "draft",
        workouts: ["Mobility Assessment", "Strength Base", "Conditioning", "Recovery Walk", "Full Programme"],
        explanation: ["Auto-adjusted based on recent check-ins."],
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single();
    return data ? mapPlan(data) : null;
  }

  const { data } = await supabase
    .from("plans")
    .insert({
      client_id: clientId,
      title: `${client.goal.split(",")[0]} Programme`,
      status: "draft",
      workouts: ["Mobility Assessment", "Strength Base", "Conditioning", "Recovery Walk", "Full Programme"],
      nutrition: ["Moderate calorie target", "High protein focus", "Timing around training"],
      explanation: ["AI-generated draft based on client profile and goals."],
    })
    .select()
    .single();
  return data ? mapPlan(data) : null;
}

async function approvePlan(id: string) {
  const { data } = await supabase
    .from("plans")
    .update({ status: "approved" })
    .eq("id", id)
    .select()
    .single();
  return data ? mapPlan(data) : null;
}

async function listCheckIns(opts: { clientId?: string } = {}) {
  let q = supabase.from("check_ins").select("*").order("submitted_at", { ascending: false });
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  const { data } = await q;
  return (data ?? []).map(mapCheckIn);
}

async function submitCheckIn(body: { clientId: string; progress: CheckIn["progress"] }) {
  const { data } = await supabase
    .from("check_ins")
    .insert({
      client_id: body.clientId,
      submitted_at: new Date().toISOString(),
      weight_kg: body.progress.weightKg,
      energy_score: body.progress.energyScore,
      steps: body.progress.steps,
      notes: body.progress.notes,
    })
    .select()
    .single();

  // Recalculate adherence score
  if (data) {
    const { data: allCheckIns } = await supabase
      .from("check_ins")
      .select("id")
      .eq("client_id", body.clientId);
    const count = (allCheckIns ?? []).length;
    const newScore = Math.min(100, Math.round((count / 14) * 100));
    await supabase
      .from("clients")
      .update({ adherence_score: newScore })
      .eq("id", body.clientId);
  }

  return data ? { success: true as const, checkIn: mapCheckIn(data) } : { success: false as const };
}

async function getMessages(clientId: string) {
  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("client_id", clientId)
    .order("sent_at");
  return (data ?? []).map((m) => ({
    id: m.id,
    sender: m.sender,
    content: m.content,
    sentAt: m.sent_at,
  }));
}

async function getMorningDashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const clients = await listClients();
  const { data: checkIns } = await supabase.from("check_ins").select("*");
  const { data: subs } = await supabase.from("subscriptions").select("*");

  const checkedInToday = (checkIns ?? []).filter(
    (ci) => ci.submitted_at?.slice(0, 10) === today
  ).length;

  const atRisk = clients.filter((c) => c.adherenceScore < 60);

  return {
    activeClients: clients.filter((c) => c.status === "active").length,
    checkedInToday,
    dueRenewals: (subs ?? []).filter((s) => s.status === "past_due").length,
    revenueSnapshotGbp: (subs ?? [])
      .filter((s) => s.status === "active")
      .reduce((sum, s) => sum + (s.amount_gbp ?? 0), 0),
    atRiskClients: atRisk.map((c) => ({
      clientId: c.id,
      severity: c.adherenceScore < 40 ? ("high" as const) : ("medium" as const),
      reasons: [`Adherence at ${c.adherenceScore}%`, "No check-in in 5+ days"],
      recommendedAction: "Send recovery check-in + payment nudge",
    })),
  };
}

async function getBillingSummary() {
  const { data: subs } = await supabase.from("subscriptions").select("*");
  const active = (subs ?? []).filter((s) => s.status === "active");
  const pastDue = (subs ?? []).filter((s) => s.status === "past_due");
  return {
    mrrGbp: active.reduce((sum, s) => sum + (s.amount_gbp ?? 0), 0),
    activeSubscriptions: active.length,
    churnRiskCount: pastDue.length,
    subscriptions: (subs ?? []).map(mapSubscription),
  };
}

async function updateBilling(clientId: string, status: PaymentSubscription["status"]) {
  await supabase.from("subscriptions").update({ status }).eq("client_id", clientId);
  return { ok: true };
}

async function getAnalytics() {
  const { data: checkIns } = await supabase.from("check_ins").select("*");
  const events = (checkIns ?? []).map((ci) => ({
    name: "check_in_submitted",
    actorId: ci.client_id,
    occurredAt: ci.submitted_at,
    metadata: {
      weightKg: ci.weight_kg,
      energyScore: ci.energy_score,
      steps: ci.steps,
      notes: ci.notes,
    },
  }));
  return {
    events,
    summary: {
      totalEvents: events.length,
      topEvents: [{ name: "check_in_submitted", count: events.length }],
      lastEventAt: events[0]?.occurredAt ?? null,
    },
  };
}

async function getRuntimeInfo() {
  return {
    storage: "supabase",
    supabaseUrl: "https://jmbrinamojsgfkfwgsce.supabase.co",
    services: { planGeneration: "supabase", billing: "supabase" },
  };
}

async function updateWorkspace(body: Partial<CoachWorkspace>) {
  const { data } = await supabase
    .from("workspaces")
    .update({
      name: body.name,
      brand_color: body.brandColor,
      accent_color: body.accentColor,
      hero_message: body.heroMessage,
      stripe_connected: body.stripeConnected,
    })
    .eq("id", "ws_1")
    .select()
    .single();
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    brandColor: data.brand_color,
    accentColor: data.accent_color,
    heroMessage: data.hero_message,
    stripeConnected: data.stripe_connected,
  };
}

async function listHabits(clientId?: string) {
  let q = supabase.from("habits").select("*");
  if (clientId) q = q.eq("client_id", clientId);
  const { data } = await q;
  return (data ?? []).map((h) => ({
    id: h.id,
    clientId: h.client_id,
    title: h.title,
    target: h.target,
    frequency: h.frequency,
    createdAt: h.created_at,
  }));
}

async function createHabit(body: { clientId: string; title: string; target: number; frequency: string }) {
  const { data } = await supabase
    .from("habits")
    .insert({ client_id: body.clientId, title: body.title, target: body.target, frequency: body.frequency })
    .select()
    .single();
  if (!data) return null;
  return {
    id: data.id,
    clientId: data.client_id,
    title: data.title,
    target: data.target,
    frequency: data.frequency,
    createdAt: data.created_at,
  };
}

async function toggleHabitCompletion(habitId: string, date: string) {
  const { data: existing } = await supabase
    .from("habit_completions")
    .select("*")
    .eq("habit_id", habitId)
    .eq("date", date)
    .maybeSingle();

  if (existing) {
    await supabase.from("habit_completions").delete().eq("id", existing.id);
    return { completion: { habitId, completed: false, date } };
  }

  const { data } = await supabase
    .from("habit_completions")
    .insert({ habit_id: habitId, date, completed: true })
    .select()
    .single();
  return { completion: { habitId, completed: true, date } };
}

async function listExercises(opts: { search?: string; bodyPart?: string; equipment?: string } = {}) {
  let q = supabase.from("exercises").select("*");
  if (opts.search) q = q.ilike("name", `%${opts.search}%`);
  if (opts.bodyPart) q = q.eq("body_part", opts.bodyPart);
  if (opts.equipment) q = q.eq("equipment", opts.equipment);
  const { data } = await q;
  return (data ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    bodyPart: e.body_part,
    equipment: e.equipment,
    goal: e.goal,
    difficulty: e.difficulty,
    instructions: e.instructions,
  }));
}

async function suggestRecipe(food?: string) {
  if (food) {
    const { data } = await supabase
      .from("recipes")
      .select("*")
      .ilike("name", `%${food}%`)
      .maybeSingle();
    if (data) return data;
  }
  const { data } = await supabase.from("recipes").select("*").limit(1).maybeSingle();
  return data ?? {
    id: "r_1",
    name: "High-Protein Chicken Bowl",
    ingredients: ["200g chicken breast", "150g brown rice", "100g broccoli", "1 tbsp olive oil", "Salt & pepper"],
    steps: ["Season and grill chicken.", "Cook rice according to packet.", "Steam broccoli.", "Combine in bowl.", "Drizzle with olive oil."],
    calories: 620,
    protein_g: 52,
    carbs_g: 65,
    fat_g: 12,
    prep_time: 10,
    cook_time: 25,
    tags: ["meal-prep", "high-protein"],
  };
}

async function listGroupPrograms() {
  const { data } = await supabase
    .from("group_programs")
    .select("*")
    .eq("archived", false)
    .eq("workspace_id", "ws_1");
  return data ?? [];
}

async function createGroupProgram(body: Record<string, unknown>) {
  const { data } = await supabase
    .from("group_programs")
    .insert({ ...body, workspace_id: "ws_1" })
    .select()
    .single();
  return data ?? body;
}

async function suggestNutritionSwap(_body: Record<string, unknown>) {
  return {
    original: { name: "White Rice", calories: 200, proteinG: 4, carbsG: 45, fatG: 0.5, portion: "150g cooked" },
    suggestion: {
      name: "Quinoa",
      calories: 185,
      proteinG: 8,
      carbsG: 35,
      fatG: 3,
      portion: "150g cooked",
      reasoning: "Higher protein and fibre for sustained energy.",
    },
  };
}

async function getClientSession(clientId: string) {
  const client = await getClient(clientId);
  if (!client) return null;

  const { data: plans } = await supabase.from("plans").select("*").eq("client_id", clientId);
  const { data: checkIns } = await supabase.from("check_ins").select("*").eq("client_id", clientId);
  const { data: messages } = await supabase.from("messages").select("*").eq("client_id", clientId).order("sent_at");

  const latest = (checkIns ?? []).sort((a, b) =>
    (b.submitted_at ?? "").localeCompare(a.submitted_at ?? "")
  )[0] ?? null;

  return {
    client,
    plan: plans?.[0] ? mapPlan(plans[0]) : null,
    latestCheckIn: latest ? mapCheckIn(latest) : null,
    proofCard: null,
    messages: (messages ?? []).map((m) => ({
      id: m.id,
      sender: m.sender,
      content: m.content,
      sentAt: m.sent_at,
    })),
  };
}

// ── Hono app ──────────────────────────────────────────────────────────────────

const app = new Hono();

app.use("/*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type"],
}));

app.get("/api/health", (c) => c.json({ ok: true, service: "coachos-api", db: "supabase" }));

app.get("/api/runtime", async (c) => c.json(await getRuntimeInfo()));

app.get("/api/session/coach", async (c) => {
  const [workspace, coach, clients, plans, subscriptions] = await Promise.all([
    getWorkspace(), getCoach(),
    listClients(), listPlans(), supabase.from("subscriptions").select("*"),
  ]);
  if (!workspace || !coach) return c.json({ message: "Not configured." }, 500);
  const dashboard = await getMorningDashboard();
  return c.json({
    workspace, coach, clients, plans,
    subscriptions: (subscriptions.data ?? []).map(mapSubscription),
    dashboard,
  });
});

app.get("/api/session/client/:clientId", async (c) => {
  const session = await getClientSession(c.req.param("clientId"));
  return session ? c.json(session) : c.json({ message: "Client not found." }, 404);
});

app.get("/api/clients", async (c) =>
  c.json(await listClients({ status: c.req.query("status"), search: c.req.query("search") }))
);

app.post("/api/clients", async (c) => {
  const body = await c.req.json();
  if (!body.fullName?.trim()) return c.json({ message: "Full name is required." }, 400);
  if (!body.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email))
    return c.json({ message: "A valid email is required." }, 400);
  if (!body.goal?.trim()) return c.json({ message: "Goal is required." }, 400);
  if (body.monthlyPriceGbp == null || body.monthlyPriceGbp < 0)
    return c.json({ message: "Monthly price must be a non-negative number." }, 400);

  const result = await createClient({
    fullName: body.fullName.trim(),
    email: body.email.trim().toLowerCase(),
    goal: body.goal.trim(),
    monthlyPriceGbp: Number(body.monthlyPriceGbp),
    nextRenewalDate: body.nextRenewalDate ?? new Date(Date.now() + 30 * 86400 * 1000).toISOString().slice(0, 10),
    status: body.status ?? "trialing",
  });

  return result
    ? c.json(result, 201)
    : c.json({ message: "Failed to create client." }, 500);
});

app.get("/api/clients/:clientId", async (c) => {
  const client = await getClient(c.req.param("clientId"));
  return client ? c.json(client) : c.json({ message: "Client not found." }, 404);
});

app.patch("/api/clients/:clientId", async (c) => {
  const body = await c.req.json();
  const result = await updateClient(c.req.param("clientId"), body);
  return result ? c.json(result) : c.json({ message: "Client not found." }, 404);
});

app.get("/api/plans", async (c) =>
  c.json(await listPlans({ status: c.req.query("status"), clientId: c.req.query("clientId") }))
);

app.post("/api/plans/generate", async (c) => {
  const { clientId } = await c.req.json<{ clientId: string }>();
  const plan = await generatePlan(clientId);
  return plan ? c.json(plan) : c.json({ message: "Client not found." }, 404);
});

app.post("/api/plans/:planId/approve", async (c) => {
  const plan = await approvePlan(c.req.param("planId"));
  return plan ? c.json(plan) : c.json({ message: "Plan not found." }, 404);
});

app.get("/api/check-ins", async (c) =>
  c.json(await listCheckIns({ clientId: c.req.query("clientId") }))
);

app.post("/api/check-ins", async (c) => {
  const body = await c.req.json();
  const result = await submitCheckIn(body);
  return result.success ? c.json(result) : c.json({ message: "Invalid check-in payload." }, 400);
});

app.get("/api/messages/:clientId", async (c) => {
  const messages = await getMessages(c.req.param("clientId"));
  return c.json(messages);
});

app.get("/api/dashboard/morning", async (c) => c.json(await getMorningDashboard()));
app.get("/api/billing", async (c) => c.json(await getBillingSummary()));
app.get("/api/analytics", async (c) => c.json(await getAnalytics()));

app.post("/api/billing/webhooks/stripe", async (c) => {
  const { clientId, status } = await c.req.json<{ clientId?: string; status?: string }>();
  if (!clientId || !status) return c.json({ message: "clientId and status required." }, 400);
  return c.json(await updateBilling(clientId, status as PaymentSubscription["status"]));
});

app.post("/api/onboarding", async (c) => {
  const body = await c.req.json();
  const result = await updateWorkspace(body);
  return result ? c.json(result) : c.json({ message: "Workspace not found." }, 404);
});

app.post("/api/admin/state/reset", async (c) =>
  c.json({ ok: true, message: "Reset not implemented — use Supabase dashboard." })
);

app.get("/api/group-programs", async (c) => c.json(await listGroupPrograms()));

app.post("/api/group-programs", async (c) => {
  const body = await c.req.json();
  return c.json(await createGroupProgram(body), 201);
});

app.get("/api/exercises", async (c) =>
  c.json(await listExercises({
    search: c.req.query("search") ?? undefined,
    bodyPart: c.req.query("bodyPart") ?? undefined,
    equipment: c.req.query("equipment") ?? undefined,
  }))
);

app.get("/api/recipes", async (c) => c.json(await suggestRecipe(c.req.query("food") ?? undefined)));

app.get("/api/habits", async (c) => c.json(await listHabits(c.req.query("clientId") ?? undefined)));

app.get("/api/habits/summary", async (c) => {
  const clientId = c.req.query("clientId");
  if (!clientId) return c.json({ message: "clientId is required." }, 400);
  const habits = await listHabits(clientId);
  return c.json(habits.map((h) => ({ habit: h, streak: 0, todayDone: false, totalCompletions: 0 })));
});

app.post("/api/habits", async (c) => {
  const body = await c.req.json();
  if (!body.clientId || !body.title || body.target == null || !body.frequency)
    return c.json({ message: "clientId, title, target, and frequency required." }, 400);
  const habit = await createHabit(body);
  return habit ? c.json(habit, 201) : c.json({ message: "Failed to create habit." }, 500);
});

app.post("/api/habits/:habitId/complete", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const result = await toggleHabitCompletion(
    c.req.param("habitId"),
    body.date ?? new Date().toISOString().slice(0, 10)
  );
  return c.json(result);
});

app.post("/api/nutrition/swap", async (c) => c.json(await suggestNutritionSwap(await c.req.json())));
app.post("/api/nutrition/swap/apply", async (c) => c.json({ success: true, swap: {} }));

export default { fetch: app.fetch };
