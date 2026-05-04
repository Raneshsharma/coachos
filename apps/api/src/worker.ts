import {
  analyticsEventSchema,
  approvePlan,
  checkInSchema,
  clientProfilePatchSchema,
  clientProfileSchema,
  createDraftPlan,
  createProofCard,
  createSeedState,
  groupProgramSchema,
  nutritionSwapSchema,
  previewImport,
  summarizeMorningDashboard,
  type DemoState,
  type GroupProgram,
  type Habit,
  type HabitCompletion,
  type NutritionSwap
} from "@coachos/domain";

type Env = {
  COACHOS_STORAGE_MODE?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

type WorkerState = DemoState & {
  clientNotes?: Array<{ id: string; clientId: string; content: string; createdAt: string }>;
  bodyMetrics?: Array<{ id: string; clientId: string; date: string; weightKg: number | null; bodyFatPct: number | null; waistCm: number | null }>;
  sessions?: Array<{ id: string; clientId: string; date: string; duration: number; type: "virtual" | "in-person"; notes: string | null; createdAt: string }>;
};

let state: WorkerState = createSeedState();

type CoachOnboardingPayload = {
  workspaceName?: string;
  heroMessage?: string;
  brandColor?: string;
  accentColor?: string;
  stripeConnected?: boolean;
  coachFirstName?: string;
  coachLastName?: string;
  coachEmail?: string;
  coachGender?: "male" | "female";
  coachTypes?: string[];
};

const EXERCISE_LIBRARY = [
  { id: "ex_1", name: "Barbell Bench Press", bodyPart: "Chest", equipment: "Barbell", goal: "Strength", difficulty: "intermediate", instructions: "Lie flat on bench, lower bar to mid-chest, press up to full extension." },
  { id: "ex_2", name: "Deadlift", bodyPart: "Back", equipment: "Barbell", goal: "Strength", difficulty: "intermediate", instructions: "Hip-hinge, bar close to shins, drive through heels to stand." },
  { id: "ex_3", name: "Barbell Back Squat", bodyPart: "Legs", equipment: "Barbell", goal: "Hypertrophy", difficulty: "intermediate", instructions: "Bar on traps, squat to parallel or below, knees track toes." },
  { id: "ex_4", name: "Dumbbell Row", bodyPart: "Back", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "One hand on bench, row dumbbell to hip, squeeze lat." },
  { id: "ex_5", name: "Lateral Raise", bodyPart: "Shoulders", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Slight elbow bend, raise arms to shoulder height." },
  { id: "ex_6", name: "Plank", bodyPart: "Core", equipment: "Bodyweight", goal: "Endurance", difficulty: "beginner", instructions: "Forearms on floor, body straight line from head to heels, hold." },
  { id: "ex_7", name: "Rowing Machine", bodyPart: "Cardio", equipment: "Machine", goal: "Endurance", difficulty: "beginner", instructions: "Push with legs, then lean back, then pull handle to lower chest." },
  { id: "ex_8", name: "Goblet Squat", bodyPart: "Legs", equipment: "Kettlebell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Hold kettlebell at chest, squat deep, keep chest upright." }
] as const;

const RECIPE_LIBRARY = [
  { id: "rec_1", name: "High-Protein Overnight Oats", tags: ["breakfast", "meal-prep"], ingredients: ["80g rolled oats", "150g Greek yoghurt", "1 scoop whey protein", "150ml almond milk", "50g mixed berries"], steps: ["Mix oats, yoghurt, protein powder, and milk.", "Refrigerate overnight.", "Top with berries before serving."], calories: 520, proteinG: 42, carbsG: 55, fatG: 12, prepTime: 5, cookTime: 0 },
  { id: "rec_2", name: "Grilled Chicken & Sweet Potato Bowl", tags: ["lunch", "dinner", "high-protein"], ingredients: ["180g chicken breast", "200g sweet potato", "100g broccoli", "1 tbsp olive oil"], steps: ["Season chicken.", "Bake chicken and sweet potato.", "Steam broccoli and serve."], calories: 480, proteinG: 48, carbsG: 42, fatG: 12, prepTime: 10, cookTime: 30 },
  { id: "rec_3", name: "Salmon with Quinoa & Greens", tags: ["dinner", "omega-3", "high-protein"], ingredients: ["160g salmon fillet", "80g quinoa", "100g spinach", "Lemon wedge"], steps: ["Cook quinoa.", "Pan-sear salmon.", "Wilt spinach and serve."], calories: 580, proteinG: 45, carbsG: 38, fatG: 28, prepTime: 5, cookTime: 20 },
  { id: "rec_4", name: "Protein Pancakes", tags: ["breakfast", "high-protein"], ingredients: ["80g oats", "1 scoop protein powder", "1 egg", "100ml almond milk"], steps: ["Blend ingredients.", "Cook on medium heat.", "Flip and serve."], calories: 420, proteinG: 38, carbsG: 45, fatG: 8, prepTime: 5, cookTime: 10 }
] as const;

const SWAP_LIBRARY = [
  { name: "Grilled chicken breast (150g)", calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6, portion: "150g" },
  { name: "Greek yoghurt (150g)", calories: 100, proteinG: 17, carbsG: 6, fatG: 0, portion: "150g" },
  { name: "Brown rice (200g cooked)", calories: 220, proteinG: 5, carbsG: 46, fatG: 1.8, portion: "200g cooked" },
  { name: "Protein shake (whey, 30g)", calories: 120, proteinG: 24, carbsG: 3, fatG: 1, portion: "30g scoop" }
] as const;

function hasSupabase(env: Env) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

async function supabase<T>(env: Env, table: string, query = "", init: RequestInit = {}): Promise<T> {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}${query}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      prefer: "return=representation",
      ...init.headers
    }
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase ${table} failed ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) as T : ([] as T);
}

function postgrestIn(values: string[]) {
  return `in.(${values.map((value) => `"${value.replaceAll('"', '\\"')}"`).join(",")})`;
}

function addDaysIsoDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizeClientPayload(payload: unknown) {
  const raw = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
  return {
    ...raw,
    workspaceId: typeof raw.workspaceId === "string" && raw.workspaceId.trim() ? raw.workspaceId : state.workspace.id,
    status: raw.status === "trialing" ? "trial" : raw.status ?? "trial",
    adherenceScore: typeof raw.adherenceScore === "number" ? raw.adherenceScore : 60,
    currentPlanId: raw.currentPlanId ?? null,
    nextRenewalDate: typeof raw.nextRenewalDate === "string" && raw.nextRenewalDate.trim() ? raw.nextRenewalDate : addDaysIsoDate(30),
    lastCheckInDate: raw.lastCheckInDate ?? null
  };
}

function listExercises(url: URL) {
  const search = url.searchParams.get("search")?.trim().toLowerCase();
  const bodyPart = url.searchParams.get("bodyPart")?.trim().toLowerCase();
  const equipment = url.searchParams.get("equipment")?.trim().toLowerCase();
  return EXERCISE_LIBRARY.filter((exercise) => {
    const searchMatch = !search || exercise.name.toLowerCase().includes(search) || exercise.instructions.toLowerCase().includes(search);
    const bodyMatch = !bodyPart || bodyPart === "all" || exercise.bodyPart.toLowerCase() === bodyPart;
    const equipmentMatch = !equipment || equipment === "all" || exercise.equipment.toLowerCase() === equipment;
    return searchMatch && bodyMatch && equipmentMatch;
  });
}

function listRecipes(searchTerm?: string | null) {
  const search = searchTerm?.trim().toLowerCase();
  if (!search) return RECIPE_LIBRARY;
  return RECIPE_LIBRARY.filter((recipe) =>
    recipe.name.toLowerCase().includes(search) ||
    recipe.tags.some((tag) => tag.toLowerCase().includes(search)) ||
    recipe.ingredients.some((ingredient) => ingredient.toLowerCase().includes(search))
  );
}

function suggestRecipe(foodName?: string | null) {
  if (!foodName?.trim()) return RECIPE_LIBRARY[0];
  const food = foodName.toLowerCase();
  return [...RECIPE_LIBRARY].map((recipe) => {
    const score =
      (recipe.name.toLowerCase().includes(food) ? 3 : 0) +
      (recipe.tags.some((tag) => food.includes(tag) || tag.includes(food)) ? 2 : 0) +
      (recipe.ingredients.some((ingredient) => ingredient.toLowerCase().includes(food)) ? 1 : 0);
    return { recipe, score };
  }).sort((a, b) => b.score - a.score)[0]?.recipe ?? RECIPE_LIBRARY[0];
}

function suggestNutritionSwap(originalFood: NutritionSwap["originalFood"]) {
  const best = [...SWAP_LIBRARY].map((item) => {
    const calorieDiff = Math.abs(item.calories - originalFood.calories);
    const proteinDiff = Math.abs(item.proteinG - originalFood.proteinG);
    return { item, score: (calorieDiff <= 80 ? 10 - calorieDiff / 12 : 0) + (proteinDiff <= 15 ? 6 - proteinDiff / 3 : 0) };
  }).sort((a, b) => b.score - a.score)[0]?.item;
  return {
    original: originalFood,
    suggestion: best ? {
      ...best,
      reasoning: best.proteinG > originalFood.proteinG
        ? `Swap for ${best.name}: more protein with similar calories.`
        : `Swap for ${best.name}: similar calories with a cleaner macro balance.`
    } : null
  };
}

function getHabitSummary(clientId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const habits = (state.habits ?? []).filter((habit) => habit.clientId === clientId);
  return habits.map((habit) => {
    const completions = (state.habitCompletions ?? []).filter((completion) => completion.habitId === habit.id && completion.completed);
    let streak = 0;
    const date = new Date(today);
    while ((state.habitCompletions ?? []).some((completion) => completion.habitId === habit.id && completion.date === date.toISOString().slice(0, 10) && completion.completed)) {
      streak++;
      date.setDate(date.getDate() - 1);
    }
    return {
      habit,
      streak,
      todayDone: completions.some((completion) => completion.date === today),
      totalCompletions: completions.length
    };
  });
}

function emptyScopedState(workspaceRow: any, coachRow: any): WorkerState {
  return {
    workspace: {
      id: workspaceRow.id,
      name: workspaceRow.name,
      brandColor: workspaceRow.brand_color,
      accentColor: workspaceRow.accent_color,
      heroMessage: workspaceRow.hero_message,
      stripeConnected: workspaceRow.stripe_connected,
      parallelRunDaysLeft: workspaceRow.parallel_run_days_left
    },
    coach: {
      id: coachRow.id,
      workspaceId: coachRow.organization_id,
      firstName: coachRow.first_name,
      lastName: coachRow.last_name,
      email: coachRow.email,
      gender: coachRow.gender ?? "male"
    },
    clients: [],
    plans: [],
    checkIns: [],
    subscriptions: [],
    messages: [],
    habits: [],
    habitCompletions: [],
    analytics: []
  };
}

async function loadSupabaseState(env: Env, coachId?: string | null): Promise<WorkerState> {
  const coachQuery = coachId
    ? `?select=*&id=eq.${encodeURIComponent(coachId)}&limit=1`
    : "?select=*&order=created_at.asc&limit=1";
  const coaches = await supabase<any[]>(env, "coaches", coachQuery);
  const coachRow = coaches[0];
  if (!coachRow) return state;

  const organizations = await supabase<any[]>(env, "organizations", `?select=*&id=eq.${encodeURIComponent(coachRow.organization_id)}&limit=1`);

  const workspaceRow = organizations[0];
  if (!workspaceRow || !coachRow) return state;

  const clients = await supabase<any[]>(env, "clients", `?select=*&organization_id=eq.${encodeURIComponent(workspaceRow.id)}&order=full_name.asc`);
  const clientIds = clients.map((client) => client.id);
  if (clientIds.length === 0) {
    const [analytics] = await Promise.all([
      supabase<any[]>(env, "analytics_events", `?select=name,actor_id,occurred_at,metadata&actor_id=eq.${encodeURIComponent(coachRow.id)}&order=event_id.asc`)
    ]);
    return { ...emptyScopedState(workspaceRow, coachRow), analytics: analytics.map((row) => ({ name: row.name, actorId: row.actor_id, occurredAt: row.occurred_at, metadata: row.metadata })) };
  }

  const clientFilter = postgrestIn(clientIds);
  const [plans, checkIns, subscriptions, messages, habits, analytics] = await Promise.all([
    supabase<any[]>(env, "plans", `?select=*&client_id=${encodeURIComponent(clientFilter)}&order=id.asc`),
    supabase<any[]>(env, "check_ins", `?select=*&client_id=${encodeURIComponent(clientFilter)}&order=submitted_at.desc`),
    supabase<any[]>(env, "subscriptions", `?select=*&client_id=${encodeURIComponent(clientFilter)}&order=id.asc`),
    supabase<any[]>(env, "messages", `?select=*&client_id=${encodeURIComponent(clientFilter)}&order=sent_at.asc`),
    supabase<any[]>(env, "habits", `?select=*&client_id=${encodeURIComponent(clientFilter)}&order=created_at.asc`),
    supabase<any[]>(env, "analytics_events", `?select=name,actor_id,occurred_at,metadata&actor_id=eq.${encodeURIComponent(coachRow.id)}&order=event_id.asc`)
  ]);
  const habitIds = habits.map((habit) => habit.id);
  const habitCompletions = habitIds.length > 0
    ? await supabase<any[]>(env, "habit_completions", `?select=*&habit_id=${encodeURIComponent(postgrestIn(habitIds))}&order=date.asc`)
    : [];

  return {
    workspace: {
      id: workspaceRow.id,
      name: workspaceRow.name,
      brandColor: workspaceRow.brand_color,
      accentColor: workspaceRow.accent_color,
      heroMessage: workspaceRow.hero_message,
      stripeConnected: workspaceRow.stripe_connected,
      parallelRunDaysLeft: workspaceRow.parallel_run_days_left
    },
    coach: {
      id: coachRow.id,
      workspaceId: coachRow.organization_id,
      firstName: coachRow.first_name,
      lastName: coachRow.last_name,
      email: coachRow.email,
      gender: coachRow.gender ?? "male"
    },
    clients: clients.map((row) => ({
      id: row.id,
      workspaceId: row.organization_id,
      fullName: row.full_name,
      email: row.email,
      goal: row.goal,
      status: row.status,
      adherenceScore: row.adherence_score,
      currentPlanId: row.current_plan_id,
      monthlyPriceGbp: Number(row.monthly_price_gbp),
      nextRenewalDate: row.next_renewal_date,
      lastCheckInDate: row.last_checkin_date,
      healthConditions: row.health_conditions ?? [],
      dailyWaterTarget: row.daily_water_target ?? 3,
      dailyStepsTarget: row.daily_steps_target ?? 10000,
      supplements: row.supplements ?? [],
      nutritionCalories: row.nutrition_calories,
      nutritionProteinG: row.nutrition_protein_g,
      nutritionFatG: row.nutrition_fat_g,
      nutritionCarbsG: row.nutrition_carbs_g,
      nutritionCoachNote: row.nutrition_coach_note ?? ""
    })),
    plans: plans.map((row) => ({
      id: row.id,
      clientId: row.client_id,
      coachId: row.coach_id,
      title: row.title,
      latestVersion: row.latest_version
    })),
    checkIns: checkIns.map((row) => ({
      id: row.id,
      clientId: row.client_id,
      submittedAt: row.submitted_at,
      progress: row.progress,
      photoCount: row.photo_count
    })),
    subscriptions: subscriptions.map((row) => ({
      id: row.id,
      clientId: row.client_id,
      status: row.status,
      amountGbp: Number(row.amount_gbp),
      renewalDate: row.renewal_date
    })),
    messages: messages.map((row) => ({
      id: row.id,
      clientId: row.client_id,
      coachId: row.coach_id,
      sender: row.sender,
      content: row.content,
      sentAt: row.sent_at,
      readAt: row.read_at
    })),
    habits: habits.map((row) => ({
      id: row.id,
      clientId: row.client_id,
      title: row.title,
      target: row.target,
      frequency: row.frequency,
      createdAt: row.created_at
    })),
    habitCompletions: habitCompletions.map((row) => ({
      id: row.id,
      habitId: row.habit_id,
      date: row.date,
      completed: row.completed
    })),
    analytics: analytics.map((row) => ({
      name: row.name,
      actorId: row.actor_id,
      occurredAt: row.occurred_at,
      metadata: row.metadata
    }))
  };
}

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type",
      ...init?.headers
    }
  });
}

async function parseJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function getClient(clientId: string) {
  return state.clients.find((client) => client.id === clientId);
}

function track(name: DemoState["analytics"][number]["name"], actorId: string, metadata: Record<string, string | number | boolean>) {
  state.analytics.push({ name, actorId, occurredAt: new Date().toISOString(), metadata });
}

function listMessages(clientId: string) {
  return state.messages.filter((message) => message.clientId === clientId).sort((a, b) => a.sentAt.localeCompare(b.sentAt));
}

function billingSummary() {
  return {
    subscriptions: state.subscriptions,
    mrrGbp: state.subscriptions.filter((item) => item.status === "active").reduce((sum, item) => sum + item.amountGbp, 0),
    churnRiskCount: state.subscriptions.filter((item) => item.status === "past_due").length
  };
}

function analyticsSummary() {
  const counts = state.analytics.reduce<Record<string, number>>((acc, event) => {
    acc[event.name] = (acc[event.name] ?? 0) + 1;
    return acc;
  }, {});

  return {
    totalEvents: state.analytics.length,
    topEvents: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count })),
    lastEventAt: state.analytics.at(-1)?.occurredAt ?? null
  };
}

function createOnboardedState(body: CoachOnboardingPayload): WorkerState {
  const timestamp = Date.now();
  const workspaceId = `ws_${timestamp}`;
  const coachId = `coach_${timestamp}`;
  const workspaceName = body.workspaceName?.trim() || "My Coaching Workspace";
  const firstName = body.coachFirstName?.trim() || "Coach";
  const lastName = body.coachLastName?.trim() || "Owner";
  const email = body.coachEmail?.trim() || `coach-${timestamp}@example.com`;

  return {
    workspace: {
      id: workspaceId,
      name: workspaceName,
      brandColor: body.brandColor?.trim() || "#123f2d",
      accentColor: body.accentColor?.trim() || "#ff8757",
      heroMessage: body.heroMessage?.trim() || "Built for coaches who take their clients' results seriously.",
      stripeConnected: Boolean(body.stripeConnected),
      parallelRunDaysLeft: 14
    },
    coach: {
      id: coachId,
      workspaceId,
      firstName,
      lastName,
      email,
      gender: body.coachGender ?? "male"
    },
    clients: [],
    plans: [],
    checkIns: [],
    subscriptions: [],
    messages: [],
    habits: [],
    habitCompletions: [],
    analytics: [{
      name: "coach_onboarded",
      actorId: coachId,
      occurredAt: new Date().toISOString(),
      metadata: {
        workspaceId,
        coachTypeCount: Array.isArray(body.coachTypes) ? body.coachTypes.length : 0,
        freshWorkspace: true
      }
    }]
  };
}

async function persistOnboardedState(env: Env, nextState: WorkerState) {
  const profileId = `profile_${nextState.coach.id}`;
  await supabase(env, "organizations", "", {
    method: "POST",
    body: JSON.stringify({
      id: nextState.workspace.id,
      name: nextState.workspace.name,
      brand_color: nextState.workspace.brandColor,
      accent_color: nextState.workspace.accentColor,
      hero_message: nextState.workspace.heroMessage,
      stripe_connected: nextState.workspace.stripeConnected,
      parallel_run_days_left: nextState.workspace.parallelRunDaysLeft,
      plan: "starter",
      status: "active"
    })
  });
  await supabase(env, "profiles", "", {
    method: "POST",
    body: JSON.stringify({
      id: profileId,
      organization_id: nextState.workspace.id,
      display_name: `${nextState.coach.firstName} ${nextState.coach.lastName}`,
      email: nextState.coach.email,
      role: "owner",
      status: "active"
    })
  });
  await supabase(env, "coaches", "", {
    method: "POST",
    body: JSON.stringify({
      id: nextState.coach.id,
      organization_id: nextState.workspace.id,
      profile_id: profileId,
      first_name: nextState.coach.firstName,
      last_name: nextState.coach.lastName,
      email: nextState.coach.email,
      gender: nextState.coach.gender,
      timezone: "UTC"
    })
  });

  const metrics = [
    { id: `metric_${nextState.workspace.id}_weight`, key: "weight_kg", name: "Weight", unit: "kg", data_type: "number", aggregation_type: "latest" },
    { id: `metric_${nextState.workspace.id}_waist`, key: "waist_cm", name: "Waist", unit: "cm", data_type: "number", aggregation_type: "latest" },
    { id: `metric_${nextState.workspace.id}_steps`, key: "steps", name: "Steps", unit: "steps", data_type: "number", aggregation_type: "sum" },
    { id: `metric_${nextState.workspace.id}_energy`, key: "energy_score", name: "Energy", unit: "score", data_type: "number", aggregation_type: "average" }
  ];
  await supabase(env, "metric_definitions", "", {
    method: "POST",
    body: JSON.stringify(metrics.map((metric) => ({ ...metric, organization_id: nextState.workspace.id })))
  });

  const pageId = `page_${nextState.workspace.id}_dashboard`;
  await supabase(env, "page_definitions", "", {
    method: "POST",
    body: JSON.stringify({
      id: pageId,
      organization_id: nextState.workspace.id,
      slug: "client-dashboard",
      name: "Client Dashboard",
      page_type: "client",
      config: { default: true }
    })
  });
  await supabase(env, "page_widgets", "", {
    method: "POST",
    body: JSON.stringify(metrics.map((metric, index) => ({
      id: `widget_${nextState.workspace.id}_${metric.key}`,
      page_definition_id: pageId,
      metric_definition_id: metric.id,
      position: index,
      widget_type: "metric_card",
      config_json: { label: metric.name }
    })))
  });
  await supabase(env, "analytics_events", "", {
    method: "POST",
    body: JSON.stringify({
      name: "coach_onboarded",
      actor_id: nextState.coach.id,
      occurred_at: nextState.analytics[0].occurredAt,
      metadata: nextState.analytics[0].metadata
    })
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return json({ ok: true });
    const url = new URL(request.url);
    const path = url.pathname;
    if (hasSupabase(env)) {
      state = await loadSupabaseState(env, url.searchParams.get("coachId"));
    }

    if (path === "/api/health") return json({ ok: true, service: "coachos-api" });
    if (path === "/api/runtime") {
      return json({
        storage: env.COACHOS_STORAGE_MODE === "postgres_relational" ? "SupabasePostgresRelationalRepository" : "CloudflareWorkerInMemoryRepository",
        stateFilePath: null,
        services: { planGeneration: "worker-local", proofCards: "worker-local", billing: "worker-local" }
      });
    }
    if (path === "/api/session/coach") {
      return json({
        workspace: state.workspace,
        coach: state.coach,
        clients: state.clients,
        plans: state.plans,
        subscriptions: state.subscriptions,
        dashboard: summarizeMorningDashboard(state)
      });
    }

    const clientSession = path.match(/^\/api\/session\/client\/([^/]+)$/);
    if (clientSession && request.method === "GET") {
      const client = getClient(clientSession[1]);
      if (!client) return json({ message: "Client not found." }, { status: 404 });
      const latestCheckIn = state.checkIns.find((checkIn) => checkIn.clientId === client.id) ?? null;
      return json({
        client,
        plan: state.plans.find((plan) => plan.clientId === client.id) ?? null,
        latestCheckIn,
        proofCard: createProofCard(client, latestCheckIn ?? undefined),
        messages: listMessages(client.id)
      });
    }

    if (path === "/api/clients" && request.method === "GET") {
      const status = url.searchParams.get("status")?.toLowerCase();
      const search = url.searchParams.get("search")?.toLowerCase();
      return json(state.clients.filter((client) => {
        const statusMatch = status ? client.status === status : true;
        const searchMatch = search ? [client.fullName, client.email, client.goal].some((value) => value.toLowerCase().includes(search)) : true;
        return statusMatch && searchMatch;
      }));
    }

    if (path === "/api/clients" && request.method === "POST") {
      const parsed = clientProfileSchema.omit({ id: true }).safeParse(normalizeClientPayload(await parseJson(request)));
      if (!parsed.success) return json({ message: "Invalid client payload.", issues: parsed.error.issues }, { status: 400 });
      const client = { ...parsed.data, id: `client_${Date.now()}` };
      state.clients.push(client);
      const subscription = { id: `sub_${client.id}`, clientId: client.id, status: "trialing" as const, amountGbp: client.monthlyPriceGbp, renewalDate: client.nextRenewalDate };
      state.subscriptions.push(subscription);
      if (hasSupabase(env)) {
        await supabase(env, "profiles", "", {
          method: "POST",
          body: JSON.stringify({
            id: `profile_${client.id}`,
            organization_id: client.workspaceId,
            display_name: client.fullName,
            email: client.email,
            role: "client",
            status: "active"
          })
        });
        await supabase(env, "clients", "", {
          method: "POST",
          body: JSON.stringify({
            id: client.id,
            organization_id: client.workspaceId,
            profile_id: `profile_${client.id}`,
            full_name: client.fullName,
            email: client.email,
            goal: client.goal,
            status: client.status,
            adherence_score: client.adherenceScore,
            current_plan_id: client.currentPlanId,
            monthly_price_gbp: client.monthlyPriceGbp,
            next_renewal_date: client.nextRenewalDate,
            last_checkin_date: client.lastCheckInDate,
            health_conditions: client.healthConditions,
            daily_water_target: client.dailyWaterTarget,
            daily_steps_target: client.dailyStepsTarget,
            supplements: client.supplements,
            nutrition_calories: client.nutritionCalories,
            nutrition_protein_g: client.nutritionProteinG,
            nutrition_fat_g: client.nutritionFatG,
            nutrition_carbs_g: client.nutritionCarbsG,
            nutrition_coach_note: client.nutritionCoachNote
          })
        });
        await supabase(env, "coach_clients", "", {
          method: "POST",
          body: JSON.stringify({ coach_id: state.coach.id, client_id: client.id })
        });
        await supabase(env, "subscriptions", "", {
          method: "POST",
          body: JSON.stringify({ id: subscription.id, client_id: subscription.clientId, status: subscription.status, amount_gbp: subscription.amountGbp, renewal_date: subscription.renewalDate })
        });
      }
      track("coach_onboarded", state.coach.id, { clientCreated: client.id });
      return json(client, { status: 201 });
    }

    const clientPath = path.match(/^\/api\/clients\/([^/]+)$/);
    if (clientPath && request.method === "GET") {
      const client = getClient(clientPath[1]);
      return client ? json(client) : json({ message: "Client not found." }, { status: 404 });
    }
    if (clientPath && request.method === "PATCH") {
      const parsed = clientProfilePatchSchema.safeParse(await parseJson(request));
      if (!parsed.success) return json({ message: "Invalid client patch.", issues: parsed.error.issues }, { status: 400 });
      const index = state.clients.findIndex((client) => client.id === clientPath[1]);
      if (index < 0) return json({ message: "Client not found." }, { status: 404 });
      state.clients[index] = clientProfileSchema.parse({ ...state.clients[index], ...parsed.data });
      if (hasSupabase(env)) {
        const updated = state.clients[index];
        await supabase(env, "clients", `?id=eq.${encodeURIComponent(updated.id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            full_name: updated.fullName,
            email: updated.email,
            goal: updated.goal,
            status: updated.status,
            monthly_price_gbp: updated.monthlyPriceGbp,
            next_renewal_date: updated.nextRenewalDate,
            health_conditions: updated.healthConditions,
            daily_water_target: updated.dailyWaterTarget,
            daily_steps_target: updated.dailyStepsTarget,
            supplements: updated.supplements,
            nutrition_calories: updated.nutritionCalories,
            nutrition_protein_g: updated.nutritionProteinG,
            nutrition_fat_g: updated.nutritionFatG,
            nutrition_carbs_g: updated.nutritionCarbsG,
            nutrition_coach_note: updated.nutritionCoachNote
          })
        });
        await supabase(env, "profiles", `?id=eq.${encodeURIComponent(`profile_${updated.id}`)}`, {
          method: "PATCH",
          body: JSON.stringify({ display_name: updated.fullName, email: updated.email })
        });
      }
      return json(state.clients[index]);
    }

    const notesPath = path.match(/^\/api\/clients\/([^/]+)\/notes$/);
    if (notesPath && request.method === "GET") {
      state.clientNotes ??= [];
      return json(state.clientNotes.filter((note) => note.clientId === notesPath[1]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    }
    if (notesPath && request.method === "POST") {
      const body = await parseJson(request) as { content?: string };
      if (!body.content?.trim()) return json({ message: "content is required." }, { status: 400 });
      state.clientNotes ??= [];
      const note = { id: `note_${Date.now()}`, clientId: notesPath[1], content: body.content, createdAt: new Date().toISOString() };
      state.clientNotes.push(note);
      if (hasSupabase(env)) {
        await supabase(env, "client_notes", "", {
          method: "POST",
          body: JSON.stringify({ id: note.id, client_id: note.clientId, coach_id: state.coach.id, content: note.content, created_at: note.createdAt })
        });
      }
      return json(note, { status: 201 });
    }

    const metricsPath = path.match(/^\/api\/clients\/([^/]+)\/metrics$/);
    if (metricsPath && request.method === "GET") {
      state.bodyMetrics ??= [];
      return json(state.bodyMetrics.filter((metric) => metric.clientId === metricsPath[1]).sort((a, b) => b.date.localeCompare(a.date)));
    }
    if (metricsPath && request.method === "POST") {
      const body = await parseJson(request) as { date?: string; weightKg?: number | null; bodyFatPct?: number | null; waistCm?: number | null };
      if (!body.date?.trim()) return json({ message: "date is required." }, { status: 400 });
      state.bodyMetrics ??= [];
      const metric = { id: `metric_${Date.now()}`, clientId: metricsPath[1], date: body.date, weightKg: body.weightKg ?? null, bodyFatPct: body.bodyFatPct ?? null, waistCm: body.waistCm ?? null };
      state.bodyMetrics.push(metric);
      if (hasSupabase(env)) {
        await supabase(env, "body_metrics", "", {
          method: "POST",
          body: JSON.stringify({ id: metric.id, client_id: metric.clientId, date: metric.date, weight_kg: metric.weightKg, body_fat_pct: metric.bodyFatPct, waist_cm: metric.waistCm })
        });
      }
      return json(metric, { status: 201 });
    }

    const sessionsPath = path.match(/^\/api\/clients\/([^/]+)\/sessions$/);
    if (sessionsPath && request.method === "POST") {
      const body = await parseJson(request) as { date?: string; duration?: number; type?: "virtual" | "in-person"; notes?: string };
      if (!body.date?.trim()) return json({ message: "date is required." }, { status: 400 });
      if (!body.duration || body.duration <= 0) return json({ message: "duration must be a positive number." }, { status: 400 });
      if (body.type !== "virtual" && body.type !== "in-person") return json({ message: "type must be 'virtual' or 'in-person'." }, { status: 400 });
      state.sessions ??= [];
      const session = { id: `session_${Date.now()}`, clientId: sessionsPath[1], date: body.date, duration: body.duration, type: body.type, notes: body.notes ?? null, createdAt: new Date().toISOString() };
      state.sessions.push(session);
      if (hasSupabase(env)) {
        await supabase(env, "sessions", "", {
          method: "POST",
          body: JSON.stringify({ id: session.id, client_id: session.clientId, coach_id: state.coach.id, date: session.date, duration: session.duration, type: session.type, notes: session.notes, created_at: session.createdAt })
        });
      }
      return json(session, { status: 201 });
    }

    if (path === "/api/plans" && request.method === "GET") {
      const status = url.searchParams.get("status");
      const clientId = url.searchParams.get("clientId");
      return json(state.plans.filter((plan) => (!status || plan.latestVersion.status === status) && (!clientId || plan.clientId === clientId)));
    }
    if (path === "/api/plans/generate" && request.method === "POST") {
      const body = await parseJson(request) as { clientId?: string };
      const client = body.clientId ? getClient(body.clientId) : null;
      if (!client) return json({ message: "Client not found." }, { status: 404 });
      const plan = createDraftPlan(client, state.coach.id);
      state.plans = [...state.plans.filter((item) => item.clientId !== client.id), plan];
      client.currentPlanId = plan.id;
      if (hasSupabase(env)) {
        await supabase(env, "plans", "?on_conflict=id", {
          method: "POST",
          headers: { prefer: "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify({ id: plan.id, client_id: plan.clientId, coach_id: plan.coachId, title: plan.title, latest_version: plan.latestVersion })
        });
        await supabase(env, "clients", `?id=eq.${encodeURIComponent(client.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ current_plan_id: plan.id })
        });
      }
      track("plan_generated", state.coach.id, { clientId: client.id });
      return json(plan);
    }
    const approvePath = path.match(/^\/api\/plans\/([^/]+)\/approve$/);
    if (approvePath && request.method === "POST") {
      const plan = state.plans.find((item) => item.id === approvePath[1]);
      if (!plan) return json({ message: "Plan not found." }, { status: 404 });
      const approved = approvePlan(plan);
      state.plans = state.plans.map((item) => item.id === approved.id ? approved : item);
      if (hasSupabase(env)) {
        await supabase(env, "plans", `?id=eq.${encodeURIComponent(approved.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ latest_version: approved.latestVersion })
        });
      }
      return json(approved);
    }
    const planPatchPath = path.match(/^\/api\/plans\/([^/]+)$/);
    if (planPatchPath && request.method === "PATCH") {
      const body = await parseJson(request) as { title?: string; workouts?: string[]; nutrition?: string[]; explanation?: string[] };
      const plan = state.plans.find((item) => item.id === planPatchPath[1]);
      if (!plan) return json({ message: "Plan not found." }, { status: 404 });
      const updated = {
        ...plan,
        title: body.title?.trim() || plan.title,
        latestVersion: {
          ...plan.latestVersion,
          workouts: Array.isArray(body.workouts) ? body.workouts : plan.latestVersion.workouts,
          nutrition: Array.isArray(body.nutrition) ? body.nutrition : plan.latestVersion.nutrition,
          explanation: Array.isArray(body.explanation) ? body.explanation : plan.latestVersion.explanation,
          updatedAt: new Date().toISOString()
        }
      };
      state.plans = state.plans.map((item) => item.id === updated.id ? updated : item);
      if (hasSupabase(env)) {
        await supabase(env, "plans", `?id=eq.${encodeURIComponent(updated.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ title: updated.title, latest_version: updated.latestVersion })
        });
      }
      track("plan_adapted", state.coach.id, { planId: updated.id });
      return json(updated);
    }

    if (path === "/api/check-ins" && request.method === "GET") {
      const clientId = url.searchParams.get("clientId");
      return json(state.checkIns.filter((checkIn) => clientId ? checkIn.clientId === clientId : true));
    }
    if (path === "/api/check-ins" && request.method === "POST") {
      const raw = await parseJson(request) as Record<string, unknown>;
      const parsed = checkInSchema.safeParse({
        id: typeof raw.id === "string" ? raw.id : `checkin_${Date.now()}`,
        submittedAt: typeof raw.submittedAt === "string" ? raw.submittedAt : new Date().toISOString(),
        photoCount: typeof raw.photoCount === "number" ? raw.photoCount : 0,
        ...raw
      });
      if (!parsed.success) return json({ message: "Invalid check-in payload.", issues: parsed.error.issues }, { status: 400 });
      state.checkIns = [parsed.data, ...state.checkIns.filter((item) => item.id !== parsed.data.id)];
      if (hasSupabase(env)) {
        await supabase(env, "check_ins", "?on_conflict=id", {
          method: "POST",
          headers: { prefer: "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify({ id: parsed.data.id, client_id: parsed.data.clientId, submitted_at: parsed.data.submittedAt, progress: parsed.data.progress, photo_count: parsed.data.photoCount })
        });
      }
      track("client_checkin_completed", parsed.data.clientId, { photos: parsed.data.photoCount });
      return json({ success: true, id: parsed.data.id, checkIn: parsed.data, dashboard: summarizeMorningDashboard(state) });
    }
    if (path.match(/^\/api\/check-ins\/([^/]+)\/photo$/) && request.method === "POST") {
      return json({ ok: true });
    }

    const messagesPath = path.match(/^\/api\/messages\/([^/]+)$/);
    if (messagesPath && request.method === "GET") return json(listMessages(messagesPath[1]));
    if (path === "/api/messages" && request.method === "POST") {
      const body = await parseJson(request) as { clientId?: string; content?: string; sender?: "coach" | "client" };
      if (!body.clientId || !body.content || !body.sender) return json({ message: "Missing required message fields." }, { status: 400 });
      const message = { id: `msg_${Date.now()}`, clientId: body.clientId, coachId: state.coach.id, sender: body.sender, content: body.content, sentAt: new Date().toISOString(), readAt: null };
      state.messages.push(message);
      if (hasSupabase(env)) {
        await supabase(env, "messages", "", {
          method: "POST",
          body: JSON.stringify({ id: message.id, client_id: message.clientId, coach_id: message.coachId, sender: message.sender, content: message.content, sent_at: message.sentAt, read_at: message.readAt })
        });
      }
      return json({ success: true, message });
    }

    if (path === "/api/dashboard/morning") {
      track("morning_dashboard_opened", state.coach.id, { source: "web" });
      return json(summarizeMorningDashboard(state));
    }
    if (path === "/api/billing") return json(billingSummary());
    if (path === "/api/billing/webhooks/stripe" && request.method === "POST") {
      const body = await parseJson(request) as { clientId?: string; status?: "active" | "past_due" | "cancelled" };
      if (!body.clientId || !body.status) return json({ message: "clientId and status are required." }, { status: 400 });
      state.subscriptions = state.subscriptions.map((subscription) => subscription.clientId === body.clientId ? { ...subscription, status: body.status! } : subscription);
      if (hasSupabase(env)) {
        await supabase(env, "subscriptions", `?client_id=eq.${encodeURIComponent(body.clientId)}`, {
          method: "PATCH",
          body: JSON.stringify({ status: body.status })
        });
      }
      track("payment_processed", body.clientId, { status: body.status });
      return json(billingSummary());
    }
    if (path === "/api/analytics") return json({ events: state.analytics, summary: analyticsSummary() });
    if (path === "/api/analytics/schema") return json({ eventNames: analyticsEventSchema.shape.name.options });
    if (path === "/api/analytics" && request.method === "POST") {
      const parsed = analyticsEventSchema.safeParse(await parseJson(request));
      if (!parsed.success) return json({ message: "Invalid analytics event.", issues: parsed.error.issues }, { status: 400 });
      state.analytics.push(parsed.data);
      return json(parsed.data, { status: 201 });
    }

    const proofPath = path.match(/^\/api\/proof-cards\/([^/]+)$/);
    if (proofPath) {
      const client = getClient(proofPath[1]);
      if (!client) return json({ message: "Client not found." }, { status: 404 });
      return json(createProofCard(client, state.checkIns.find((checkIn) => checkIn.clientId === client.id)));
    }

    if (path === "/api/import/preview" && request.method === "POST") {
      const body = await parseJson(request) as { rows?: unknown[] };
      return json(previewImport((Array.isArray(body.rows) ? body.rows : []) as never[]));
    }
    if (path === "/api/export") return json({ exportedAt: new Date().toISOString(), parallelRunDaysLeft: state.workspace.parallelRunDaysLeft, data: state });
    if (path === "/api/admin/state/reset" && request.method === "POST") return json({ ok: true, session: { workspace: state.workspace, coach: state.coach, clients: state.clients, plans: state.plans, subscriptions: state.subscriptions, dashboard: summarizeMorningDashboard(state) } });

    if (path === "/api/group-programs" && request.method === "GET") return json(state.groupPrograms ?? []);
    if (path === "/api/group-programs" && request.method === "POST") {
      const parsed = groupProgramSchema.safeParse(await parseJson(request));
      if (!parsed.success) return json({ message: "Invalid program payload." }, { status: 400 });
      state.groupPrograms = [...(state.groupPrograms ?? []), parsed.data];
      if (hasSupabase(env)) {
        await supabase(env, "group_programs", "", {
          method: "POST",
          body: JSON.stringify({ id: parsed.data.id, organization_id: state.workspace.id, coach_id: parsed.data.coachId, title: parsed.data.title, description: parsed.data.description, goal: parsed.data.goal, member_ids: parsed.data.memberIds, monthly_price_gbp: parsed.data.monthlyPriceGbp, status: parsed.data.status, created_at: parsed.data.createdAt })
        });
      }
      return json(parsed.data, { status: 201 });
    }
    const groupPatch = path.match(/^\/api\/group-programs\/([^/]+)$/);
    if (groupPatch && request.method === "PATCH") {
      state.groupPrograms ??= [];
      const existing = state.groupPrograms.find((item) => item.id === groupPatch[1]);
      if (!existing) return json({ message: "Program not found." }, { status: 404 });
      const merged = groupProgramSchema.safeParse({ ...existing, ...((await parseJson(request)) as Partial<GroupProgram>) });
      if (!merged.success) return json({ message: "Invalid program patch." }, { status: 400 });
      state.groupPrograms = state.groupPrograms.map((item) => item.id === groupPatch[1] ? merged.data : item);
      if (hasSupabase(env)) {
        await supabase(env, "group_programs", `?id=eq.${encodeURIComponent(groupPatch[1])}`, {
          method: "PATCH",
          body: JSON.stringify({ title: merged.data.title, description: merged.data.description, goal: merged.data.goal, member_ids: merged.data.memberIds, monthly_price_gbp: merged.data.monthlyPriceGbp, status: merged.data.status })
        });
      }
      return json(merged.data);
    }
    if (groupPatch && request.method === "DELETE") {
      state.groupPrograms = (state.groupPrograms ?? []).map((item) => item.id === groupPatch[1] ? { ...item, status: "archived" } : item);
      return json({ ok: true });
    }

    if (path === "/api/habits" && request.method === "GET") {
      const clientId = url.searchParams.get("clientId");
      return json((state.habits ?? []).filter((habit) => clientId ? habit.clientId === clientId : true));
    }
    if (path === "/api/habits" && request.method === "POST") {
      const body = await parseJson(request) as { clientId?: string; title?: string; target?: number; frequency?: "daily" | "weekly" };
      if (!body.clientId || !body.title || body.target == null || !body.frequency) return json({ message: "clientId, title, target, and frequency are required." }, { status: 400 });
      const habit: Habit = { id: `habit_${Date.now()}`, clientId: body.clientId, title: body.title, target: body.target, frequency: body.frequency, createdAt: new Date().toISOString() };
      state.habits = [...(state.habits ?? []), habit];
      if (hasSupabase(env)) {
        await supabase(env, "habits", "", {
          method: "POST",
          body: JSON.stringify({ id: habit.id, client_id: habit.clientId, title: habit.title, target: habit.target, frequency: habit.frequency, created_at: habit.createdAt })
        });
      }
      return json(habit, { status: 201 });
    }
    if (path === "/api/habits/summary") {
      const clientId = url.searchParams.get("clientId");
      if (!clientId) return json({ message: "clientId is required." }, { status: 400 });
      return json(getHabitSummary(clientId));
    }
    const completePath = path.match(/^\/api\/habits\/([^/]+)\/complete$/);
    if (completePath && request.method === "POST") {
      const body = await parseJson(request) as { date?: string };
      const completion: HabitCompletion = { id: `hc_${Date.now()}`, habitId: completePath[1], date: body.date ?? new Date().toISOString().slice(0, 10), completed: true };
      state.habitCompletions = [...(state.habitCompletions ?? []), completion];
      if (hasSupabase(env)) {
        await supabase(env, "habit_completions", "?on_conflict=habit_id,date", {
          method: "POST",
          headers: { prefer: "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify({ id: completion.id, habit_id: completion.habitId, date: completion.date, completed: completion.completed })
        });
      }
      return json(completion);
    }

    if (path === "/api/nutrition/swap") {
      const body = await parseJson(request) as { originalFood?: NutritionSwap["originalFood"] };
      return body.originalFood ? json(suggestNutritionSwap(body.originalFood)) : json({ original: null, suggestion: null });
    }
    if (path === "/api/nutrition/swap/apply" && request.method === "POST") {
      const body = await parseJson(request) as { planId: string; suggestion: NutritionSwap["swapSuggestion"]; originalFood: NutritionSwap["originalFood"] };
      const parsed = nutritionSwapSchema.safeParse({ id: `swap_${Date.now()}`, planId: body.planId, originalFood: body.originalFood, swapSuggestion: body.suggestion, appliedAt: new Date().toISOString() });
      if (!parsed.success) return json({ message: "Invalid swap application." }, { status: 400 });
      state.nutritionSwaps = [...(state.nutritionSwaps ?? []), parsed.data];
      if (hasSupabase(env)) {
        await supabase(env, "nutrition_swaps", "", {
          method: "POST",
          body: JSON.stringify({ id: parsed.data.id, plan_id: parsed.data.planId, original_food: parsed.data.originalFood, swap_suggestion: parsed.data.swapSuggestion, applied_at: parsed.data.appliedAt })
        });
      }
      return json(parsed.data);
    }
    const swapsPath = path.match(/^\/api\/nutrition\/swaps\/([^/]+)$/);
    if (swapsPath) return json((state.nutritionSwaps ?? []).filter((swap) => swap.planId === swapsPath[1]));

    if (path === "/api/exercises") return json(listExercises(url));
    if (path === "/api/recipes") return json(url.searchParams.has("food") ? suggestRecipe(url.searchParams.get("food")) : listRecipes(url.searchParams.get("search")));
    if (path === "/api/onboarding/coach" && request.method === "POST") {
      const body = await parseJson(request) as CoachOnboardingPayload;
      if (!body.workspaceName?.trim() || !body.coachFirstName?.trim() || !body.coachLastName?.trim() || !body.coachEmail?.includes("@")) {
        return json({ message: "workspaceName, coachFirstName, coachLastName, and coachEmail are required." }, { status: 400 });
      }
      const nextState = createOnboardedState(body);
      if (hasSupabase(env)) {
        await persistOnboardedState(env, nextState);
      }
      state = nextState;
      return json({
        coachId: state.coach.id,
        workspaceId: state.workspace.id,
        session: {
          workspace: state.workspace,
          coach: state.coach,
          clients: state.clients,
          plans: state.plans,
          subscriptions: state.subscriptions,
          dashboard: summarizeMorningDashboard(state)
        }
      }, { status: 201 });
    }
    if (path === "/api/onboarding" && request.method === "POST") {
      Object.assign(state.workspace, await parseJson(request));
      if (hasSupabase(env)) {
        await supabase(env, "organizations", `?id=eq.${encodeURIComponent(state.workspace.id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: state.workspace.name,
            brand_color: state.workspace.brandColor,
            accent_color: state.workspace.accentColor,
            hero_message: state.workspace.heroMessage,
            stripe_connected: state.workspace.stripeConnected
          })
        });
      }
      return json(state.workspace);
    }

    return json({ message: "Not found." }, { status: 404 });
  }
};
