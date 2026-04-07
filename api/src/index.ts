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
  status: "active" | "at_risk" | "trial";
  adherenceScore: number;
  monthlyPriceGbp: number;
  nextRenewalDate: string;
  goal: string;
  startDate: string;
  avatarInitials: string;
  tags: string[];
  // Extended profile fields
  healthConditions: { label: string; note: string }[];
  dailyWaterTarget: number;
  dailyStepsTarget: number;
  supplements: string[];
  nutritionCalories: number | null;
  nutritionProteinG: number | null;
  nutritionFatG: number | null;
  nutritionCarbsG: number | null;
  nutritionCoachNote: string;
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
  // Normalize Supabase status values to match frontend domain types
  const rawStatus = row.status as string;
  const status = (rawStatus === "trialing" ? "trial" : rawStatus) as ClientProfile["status"];
  return {
    id: row.id as string,
    fullName: row.full_name as string,
    email: row.email as string,
    status,
    adherenceScore: row.adherence_score as number,
    monthlyPriceGbp: row.monthly_price_gbp as number,
    nextRenewalDate: (row.next_renewal_date as string) ?? "",
    goal: (row.goal as string) ?? "",
    startDate: (row.start_date as string) ?? "",
    avatarInitials: (row.avatar_initials as string) ?? "",
    tags: (row.tags as string[]) ?? [],
    // Extended profile fields
    healthConditions: (row.health_conditions as ClientProfile["healthConditions"]) ?? [],
    dailyWaterTarget: (row.daily_water_target as number) ?? 3,
    dailyStepsTarget: (row.daily_steps_target as number) ?? 10000,
    supplements: (row.supplements as string[]) ?? [],
    nutritionCalories: (row.nutrition_calories as number | null) ?? null,
    nutritionProteinG: (row.nutrition_protein_g as number | null) ?? null,
    nutritionFatG: (row.nutrition_fat_g as number | null) ?? null,
    nutritionCarbsG: (row.nutrition_carbs_g as number | null) ?? null,
    nutritionCoachNote: (row.nutrition_coach_note as string) ?? "",
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
      waistCm: row.waist_cm as number | undefined,
      adherenceScore: (row.adherence_score as number | undefined) ?? undefined,
      notes: row.notes as string | undefined,
    },
  };
}

function mapSubscription(row: Record<string, unknown>): PaymentSubscription {
  const rawSubStatus = row.status as string;
  const subStatus = rawSubStatus === "trialing" ? "trialing" : rawSubStatus as PaymentSubscription["status"];
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    status: subStatus,
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
  const nameParts = (data.full_name ?? "Coach").split(" ");
  return {
    id: data.id,
    workspaceId: data.workspace_id ?? "ws_1",
    firstName: nameParts[0] ?? "Coach",
    lastName: nameParts.slice(1).join(" ") || "",
    email: data.email as any,
    gender: (data.gender as "male" | "female") ?? "male",
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
  const updates: Record<string, unknown> = {};
  if (patch.fullName !== undefined) updates.full_name = patch.fullName;
  if (patch.email !== undefined) updates.email = patch.email;
  if (patch.status !== undefined) updates.status = patch.status === "trial" ? "trialing" : patch.status;
  if (patch.adherenceScore !== undefined) updates.adherence_score = patch.adherenceScore;
  if (patch.monthlyPriceGbp !== undefined) updates.monthly_price_gbp = patch.monthlyPriceGbp;
  if (patch.nextRenewalDate !== undefined) updates.next_renewal_date = patch.nextRenewalDate;
  if (patch.goal !== undefined) updates.goal = patch.goal;
  if (patch.startDate !== undefined) updates.start_date = patch.startDate;
  if (patch.avatarInitials !== undefined) updates.avatar_initials = patch.avatarInitials;
  if (patch.tags !== undefined) updates.tags = patch.tags;
  if (patch.healthConditions !== undefined) updates.health_conditions = patch.healthConditions;
  if (patch.dailyWaterTarget !== undefined) updates.daily_water_target = patch.dailyWaterTarget;
  if (patch.dailyStepsTarget !== undefined) updates.daily_steps_target = patch.dailyStepsTarget;
  if (patch.supplements !== undefined) updates.supplements = patch.supplements;
  if (patch.nutritionCalories !== undefined) updates.nutrition_calories = patch.nutritionCalories;
  if (patch.nutritionProteinG !== undefined) updates.nutrition_protein_g = patch.nutritionProteinG;
  if (patch.nutritionFatG !== undefined) updates.nutrition_fat_g = patch.nutritionFatG;
  if (patch.nutritionCarbsG !== undefined) updates.nutrition_carbs_g = patch.nutritionCarbsG;
  if (patch.nutritionCoachNote !== undefined) updates.nutrition_coach_note = patch.nutritionCoachNote;

  const { data } = await supabase.from("clients").update(updates).eq("id", id).select().single();
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
      status: body.status === "trial" ? "trialing" : body.status,
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

async function submitCheckIn(body: { clientId: string; submittedAt?: string; progress: CheckIn["progress"] }) {
  const { data } = await supabase
    .from("check_ins")
    .insert({
      client_id: body.clientId,
      submitted_at: body.submittedAt ? new Date(body.submittedAt).toISOString() : new Date().toISOString(),
      weight_kg: body.progress.weightKg,
      energy_score: body.progress.energyScore,
      steps: body.progress.steps,
      waist_cm: body.progress.waistCm,
      adherence_score: body.progress.adherenceScore,
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

async function createBookedSession(body: {
  clientId: string; sessionType: "virtual" | "in-person";
  date: string; time: string; duration: number; notes: string;
}) {
  const coach = await getCoach();
  if (!coach) return null;
  const { data, error } = await supabase
    .from("booked_sessions")
    .insert({
      client_id: body.clientId,
      coach_id: coach.id,
      session_type: body.sessionType,
      session_date: body.date,
      session_time: body.time,
      duration_mins: body.duration,
      notes: body.notes ?? "",
    })
    .select()
    .single();
  if (error || !data) return null;
  return {
    id: data.id,
    clientId: data.client_id,
    coachId: data.coach_id,
    sessionType: data.session_type,
    date: data.session_date,
    time: data.session_time,
    durationMins: data.duration_mins,
    notes: data.notes,
    createdAt: data.created_at,
  };
}

async function generateProofCard(clientId: string) {
  const client = await getClient(clientId);
  if (!client) return null;
  const [metricsResult, checkInsResult] = await Promise.all([
    supabase.from("body_metrics").select("*").eq("client_id", clientId).order("measured_at", { ascending: true }),
    supabase.from("check_ins").select("*").eq("client_id", clientId).order("submitted_at", { ascending: true }),
  ]);
  const metrics = metricsResult.data ?? [];
  const checkIns = checkInsResult.data ?? [];
  const latest = metrics[metrics.length - 1] ?? null;
  const first = metrics[0] ?? null;

  let weightDelta: number | null = null;
  if (latest?.weight_kg && first?.weight_kg)
    weightDelta = +(latest.weight_kg - first.weight_kg);

  let bodyFatDelta: number | null = null;
  if (latest?.body_fat_pct && first?.body_fat_pct)
    bodyFatDelta = +(latest.body_fat_pct - first.body_fat_pct);

  const energyScores = checkIns.map((ci) => ci.energy_score).filter((e): e is number => e != null);
  const avgEnergy = energyScores.length > 0
    ? +(energyScores.reduce((a, b) => a + b, 0) / energyScores.length).toFixed(1) : null;

  const firstName = client.fullName.split(" ")[0];
  const headline = weightDelta != null
    ? weightDelta < 0
      ? `${firstName} has lost ${Math.abs(weightDelta).toFixed(1)}kg and is building serious momentum`
      : `${firstName} is building strength and consistency`
    : `${firstName} is rebuilding consistency with premium accountability`;

  const bodyParts: string[] = [];
  if (weightDelta != null) bodyParts.push(`weight change of ${weightDelta > 0 ? "+" : ""}${weightDelta.toFixed(1)}kg`);
  if (avgEnergy != null) bodyParts.push(`average energy ${avgEnergy}/10`);
  if (bodyFatDelta != null) bodyParts.push(`body fat ${bodyFatDelta > 0 ? "+" : ""}${bodyFatDelta.toFixed(1)}%`);
  const body = bodyParts.length > 0
    ? `${bodyParts.join(", ")}. This client has ${client.adherenceScore}% adherence and ${checkIns.length} check-ins with measurable progress.`
    : "Client has been onboarded and is ready for the first measurable proof milestone.";

  const stats = [
    { label: "Adherence", value: `${client.adherenceScore}%` },
    { label: "Check-ins", value: `${checkIns.length}` },
  ];
  if (weightDelta != null) stats.push({ label: "Weight change", value: `${weightDelta > 0 ? "+" : ""}${weightDelta.toFixed(1)}kg` });
  if (client.nutritionCalories != null) stats.push({ label: "Calorie target", value: `${client.nutritionCalories} kcal` });
  stats.push({ label: "Monthly value", value: `GBP ${client.monthlyPriceGbp}` });
  if (client.nextRenewalDate) stats.push({ label: "Next review", value: client.nextRenewalDate });

  return { clientId, headline, body, stats };
}

async function updateGroupProgram(programId: string, patch: {
  name?: string; description?: string; goal?: string;
  monthlyPriceGbp?: number; memberIds?: string[];
}) {
  const updates: Record<string, unknown> = {};
  if (patch.name !== undefined) updates.name = patch.name;
  if (patch.description !== undefined) updates.description = patch.description;
  if (patch.goal !== undefined) updates.goal = patch.goal;
  if (patch.monthlyPriceGbp !== undefined) updates.monthly_price_gbp = patch.monthlyPriceGbp;
  if (patch.memberIds !== undefined) updates.member_ids = patch.memberIds;
  if (Object.keys(updates).length === 0) return null;
  const { data, error } = await supabase
    .from("group_programs")
    .update(updates)
    .eq("id", programId)
    .select()
    .single();
  if (error || !data) return null;
  return {
    id: data.id,
    coachId: data.coach_id ?? "",
    title: data.name,
    description: data.description ?? "",
    goal: data.goal ?? "",
    memberIds: data.member_ids ?? [],
    monthlyPriceGbp: data.monthly_price_gbp ?? 0,
    status: data.archived ? "archived" : "active",
    createdAt: data.created_at,
  };
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

  const [plans, checkIns, messages, habits, subscription, { data: notesData }] = await Promise.all([
    supabase.from("plans").select("*").eq("client_id", clientId),
    supabase.from("check_ins").select("*").eq("client_id", clientId),
    supabase.from("messages").select("*").eq("client_id", clientId).order("sent_at"),
    supabase.from("habits").select("*").eq("client_id", clientId),
    supabase.from("subscriptions").select("*").eq("client_id", clientId).maybeSingle(),
    supabase.from("client_notes").select("*").eq("client_id", clientId).order("created_at", { ascending: false }),
  ]);

  const habitIds = (habits.data ?? []).map(h => h.id);
  const { data: completions } = habitIds.length > 0
    ? await supabase.from("habit_completions").select("*").in("habit_id", habitIds)
    : { data: [] };

  const latest = (checkIns.data ?? []).sort((a, b) =>
    (b.submitted_at ?? "").localeCompare(a.submitted_at ?? "")
  )[0] ?? null;

  return {
    client,
    plan: plans.data?.[0] ? mapPlan(plans.data[0]) : null,
    latestCheckIn: latest ? mapCheckIn(latest) : null,
    proofCard: null,
    messages: (messages.data ?? []).map((m) => ({
      id: m.id,
      sender: m.sender,
      content: m.content,
      sentAt: m.sent_at,
    })),
    habits: (habits.data ?? []).map((h) => ({
      id: h.id,
      clientId: h.client_id,
      title: h.title,
      target: h.target,
      frequency: h.frequency,
      createdAt: h.created_at,
    })),
    habitCompletions: (completions ?? []).map((c) => ({
      id: c.id,
      habitId: c.habit_id,
      date: c.date,
      completed: c.completed,
    })),
    subscription: subscription.data ? mapSubscription(subscription.data) : null,
    notes: (notesData ?? []).map((n) => ({ id: n.id, clientId: n.client_id, content: n.content, createdAt: n.created_at, updatedAt: n.updated_at })),
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
    status: (body.status === "trial" ? "trialing" : body.status) as "active" | "at_risk" | "trial",
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

app.patch("/api/plans/:planId", async (c) => {
  const planId = c.req.param("planId");
  const patch = await c.req.json<{
    title?: string;
    workouts?: string[];
    nutrition?: string[];
    explanation?: string[];
  }>();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) updates.title = patch.title;
  if (patch.workouts !== undefined) updates.workouts = patch.workouts;
  if (patch.nutrition !== undefined) updates.nutrition = patch.nutrition;
  if (patch.explanation !== undefined) updates.explanation = patch.explanation;
  const { data, error } = await supabase
    .from("plans")
    .update(updates)
    .eq("id", planId)
    .select()
    .single();
  if (error || !data) return c.json({ message: "Failed to update plan." }, 500);
  return c.json(mapPlan(data));
});

app.get("/api/check-ins", async (c) =>
  c.json(await listCheckIns({ clientId: c.req.query("clientId") }))
);

app.post("/api/check-ins", async (c) => {
  const body = await c.req.json();
  const result = await submitCheckIn(body);
  return result.success ? c.json(result) : c.json({ message: "Invalid check-in payload." }, 400);
});

app.post("/api/check-ins/:id/photo", async (c) => {
  const checkInId = c.req.param("id");
  const formData = await c.req.formData();
  const file = formData.get("photo");
  if (!file || !(file instanceof File)) return c.json({ message: "No file provided" }, 400);
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${checkInId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("progress-photos").upload(path, file);
  if (error) return c.json({ message: "Upload failed: " + error.message }, 500);
  const { data } = supabase.storage.from("progress-photos").getPublicUrl(path);
  await supabase.from("check_ins").update({ photo_url: data.publicUrl }).eq("id", checkInId);
  return c.json({ url: data.publicUrl });
});

app.get("/api/messages/:clientId", async (c) => {
  const messages = await getMessages(c.req.param("clientId"));
  return c.json(messages);
});

app.post("/api/messages", async (c) => {
  const { clientId, content } = await c.req.json();
  if (!clientId?.trim() || !content?.trim()) return c.json({ message: "clientId and content are required." }, 400);
  const coach = await getCoach();
  if (!coach) return c.json({ message: "Coach not found." }, 404);
  const { data, error } = await supabase
    .from("messages")
    .insert({ coach_id: coach.id, client_id: clientId, content: content.trim(), sender: "coach", sent_at: new Date().toISOString() })
    .select()
    .single();
  if (error) return c.json({ message: "Failed to send message." }, 500);
  return c.json({ id: data.id, sender: data.sender, content: data.content, sentAt: data.sent_at }, 201);
});

app.get("/api/clients/:clientId/notes", async (c) => {
  const { data, error } = await supabase
    .from("client_notes")
    .select("*")
    .eq("client_id", c.req.param("clientId"))
    .order("created_at", { ascending: false });
  if (error) return c.json({ message: "Failed to load notes." }, 500);
  return c.json(data.map((n) => ({ id: n.id, clientId: n.client_id, content: n.content, createdAt: n.created_at, updatedAt: n.updated_at })));
});

app.post("/api/clients/:clientId/notes", async (c) => {
  const { content } = await c.req.json();
  if (!content?.trim()) return c.json({ message: "Content is required." }, 400);
  const coach = await getCoach();
  if (!coach) return c.json({ message: "Coach not found." }, 404);
  const { data, error } = await supabase
    .from("client_notes")
    .insert({ coach_id: coach.id, client_id: c.req.param("clientId"), content: content.trim() })
    .select()
    .single();
  if (error) return c.json({ message: "Failed to create note." }, 500);
  return c.json({ id: data.id, clientId: data.client_id, content: data.content, createdAt: data.created_at, updatedAt: data.updated_at }, 201);
});

app.patch("/api/notes/:noteId", async (c) => {
  const { content } = await c.req.json();
  if (!content?.trim()) return c.json({ message: "Content is required." }, 400);
  const { data, error } = await supabase
    .from("client_notes")
    .update({ content: content.trim(), updated_at: new Date().toISOString() })
    .eq("id", c.req.param("noteId"))
    .select()
    .single();
  if (error) return c.json({ message: "Failed to update note." }, 500);
  if (!data) return c.json({ message: "Note not found." }, 404);
  return c.json({ id: data.id, clientId: data.client_id, content: data.content, createdAt: data.created_at, updatedAt: data.updated_at });
});

app.delete("/api/notes/:noteId", async (c) => {
  const { error } = await supabase.from("client_notes").delete().eq("id", c.req.param("noteId"));
  if (error) return c.json({ message: "Failed to delete note." }, 500);
  return c.json({ ok: true });
});

app.delete("/api/clients/:clientId/notes/:noteId", async (c) => {
  const { error } = await supabase
    .from("client_notes")
    .delete()
    .eq("id", c.req.param("noteId"))
    .eq("client_id", c.req.param("clientId"));
  if (error) return c.json({ message: "Failed to delete note." }, 500);
  return c.json({ ok: true });
});

app.get("/api/clients/:clientId/metrics", async (c) => {
  const { data, error } = await supabase
    .from("body_metrics")
    .select("*")
    .eq("client_id", c.req.param("clientId"))
    .order("measured_at", { ascending: true });
  if (error) return c.json({ message: "Failed to load metrics." }, 500);
  return c.json(data.map((m) => ({
    id: m.id, clientId: m.client_id, measuredAt: m.measured_at,
    weightKg: m.weight_kg ?? null, bodyFatPct: m.body_fat_pct ?? null,
    chestCm: m.chest_cm ?? null, waistCm: m.waist_cm ?? null, hipsCm: m.hips_cm ?? null,
    armCm: m.arm_cm ?? null, thighCm: m.thigh_cm ?? null,
    energyScore: m.energy_score ?? null, sleepRating: m.sleep_rating ?? null,
    notes: m.notes ?? null,
  })));
});

app.post("/api/clients/:clientId/metrics", async (c) => {
  const body = await c.req.json();
  const { data, error } = await supabase
    .from("body_metrics")
    .insert({
      client_id: c.req.param("clientId"),
      weight_kg: body.weightKg ?? null,
      body_fat_pct: body.bodyFatPct ?? null,
      chest_cm: body.chestCm ?? null,
      waist_cm: body.waistCm ?? null,
      hips_cm: body.hipsCm ?? null,
      arm_cm: body.armCm ?? null,
      thigh_cm: body.thighCm ?? null,
      energy_score: body.energyScore ?? null,
      sleep_rating: body.sleepRating ?? null,
      notes: body.notes ?? null,
    })
    .select()
    .single();
  if (error) return c.json({ message: "Failed to save metrics." }, 500);
  return c.json({ id: data.id, clientId: data.client_id, measuredAt: data.measured_at,
    weightKg: data.weight_kg ?? null, bodyFatPct: data.body_fat_pct ?? null,
    chestCm: data.chest_cm ?? null, waistCm: data.waist_cm ?? null, hipsCm: data.hips_cm ?? null,
    armCm: data.arm_cm ?? null, thighCm: data.thigh_cm ?? null,
    energyScore: data.energy_score ?? null, sleepRating: data.sleep_rating ?? null,
    notes: data.notes ?? null,
  }, 201);
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

app.patch("/api/coach/profile", async (c) => {
  const body = await c.req.json();
  const coach = await getCoach();
  if (!coach) return c.json({ message: "Coach not found." }, 404);
  const { data, error } = await supabase
    .from("coaches")
    .update({
      full_name: body.fullName ?? coach.fullName,
      avatar_initials: body.avatarInitials ?? coach.avatarInitials,
    })
    .eq("id", coach.id)
    .select()
    .single();
  if (error) return c.json({ message: "Failed to update profile." }, 500);
  return c.json({
    id: data.id, workspaceId: data.workspace_id,
    fullName: data.full_name, email: data.email,
    avatarInitials: data.avatar_initials,
  });
});

app.post("/api/admin/state/reset", async (c) =>
  c.json({ ok: true, message: "Reset not implemented — use Supabase dashboard." })
);

app.get("/api/group-programs", async (c) => c.json(await listGroupPrograms()));

app.post("/api/group-programs", async (c) => {
  const body = await c.req.json();
  return c.json(await createGroupProgram(body), 201);
});

app.patch("/api/group-programs/:programId", async (c) => {
  const body = await c.req.json();
  const result = await updateGroupProgram(c.req.param("programId"), {
    name: body.name,
    description: body.description,
    goal: body.goal,
    monthlyPriceGbp: body.monthlyPriceGbp,
    memberIds: body.memberIds,
  });
  return result ? c.json(result) : c.json({ message: "Failed to update program." }, 404);
});

app.delete("/api/group-programs/:programId", async (c) => {
  const { error } = await supabase
    .from("group_programs")
    .update({ archived: true })
    .eq("id", c.req.param("programId"));
  if (error) return c.json({ message: "Failed to archive program." }, 500);
  return c.json({ ok: true });
});

app.post("/api/clients/:clientId/sessions", async (c) => {
  const body = await c.req.json();
  if (!body.sessionType || !["virtual", "in-person"].includes(body.sessionType))
    return c.json({ message: "sessionType must be 'virtual' or 'in-person'." }, 400);
  if (!body.date?.trim()) return c.json({ message: "date is required." }, 400);
  if (!body.time?.trim()) return c.json({ message: "time is required." }, 400);
  if (typeof body.duration !== "number" || body.duration <= 0)
    return c.json({ message: "duration must be a positive number." }, 400);
  const result = await createBookedSession({
    clientId: c.req.param("clientId"),
    sessionType: body.sessionType,
    date: body.date,
    time: body.time,
    duration: body.duration,
    notes: body.notes ?? "",
  });
  return result
    ? c.json(result, 201)
    : c.json({ message: "Failed to book session." }, 500);
});

app.get("/api/proof-cards/:clientId", async (c) => {
  const result = await generateProofCard(c.req.param("clientId"));
  return result ? c.json(result) : c.json({ message: "Client not found." }, 404);
});

app.get("/api/clients/:clientId/photos", async (c) => {
  const { data, error } = await supabase
    .from("check_ins")
    .select("id, client_id, submitted_at, photo_url")
    .eq("client_id", c.req.param("clientId"))
    .not("photo_url", "is", null)
    .order("submitted_at", { ascending: true });
  if (error) return c.json({ message: "Failed to load photos." }, 500);
  return c.json(data.map((ci) => ({
    checkInId: ci.id,
    clientId: ci.client_id,
    submittedAt: ci.submitted_at,
    url: ci.photo_url,
  })));
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
