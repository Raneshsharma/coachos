import { z } from "zod";

export const coachWorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  brandColor: z.string(),
  accentColor: z.string(),
  heroMessage: z.string(),
  stripeConnected: z.boolean(),
  parallelRunDaysLeft: z.number().int().nonnegative()
});

export const coachUserSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.email()
});

export const clientProfileSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  fullName: z.string(),
  email: z.email(),
  goal: z.string(),
  status: z.enum(["active", "at_risk", "trial"]),
  adherenceScore: z.number().min(0).max(100),
  currentPlanId: z.string().nullable(),
  monthlyPriceGbp: z.number().positive(),
  nextRenewalDate: z.string(),
  lastCheckInDate: z.string().nullable()
});

export const clientProfilePatchSchema = z
  .object({
    goal: z.string().min(3).optional(),
    status: z.enum(["active", "at_risk", "trial"]).optional(),
    monthlyPriceGbp: z.number().positive().optional(),
    nextRenewalDate: z.string().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one client field must be provided."
  });

export const progressMetricSchema = z.object({
  weightKg: z.number().nullable(),
  energyScore: z.number().min(1).max(10),
  steps: z.number().int().nonnegative(),
  waistCm: z.number().nullable(),
  adherenceScore: z.number().int().min(0).max(100).nullable(),
  notes: z.string()
});

export const checkInSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  submittedAt: z.string(),
  progress: progressMetricSchema,
  photoCount: z.number().int().nonnegative()
});

export const planVersionSchema = z.object({
  id: z.string(),
  planId: z.string(),
  versionNumber: z.number().int().positive(),
  status: z.enum(["draft", "approved"]),
  explanation: z.array(z.string()),
  workouts: z.array(z.string()),
  nutrition: z.array(z.string()),
  updatedAt: z.string()
});

export const programPlanSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  coachId: z.string(),
  title: z.string(),
  latestVersion: planVersionSchema
});

export const paymentSubscriptionSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  status: z.enum(["active", "past_due", "trialing", "cancelled"]),
  amountGbp: z.number().positive(),
  renewalDate: z.string()
});

export const riskAlertSchema = z.object({
  clientId: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  reasons: z.array(z.string()),
  recommendedAction: z.string()
});

export const proofCardSchema = z.object({
  clientId: z.string(),
  headline: z.string(),
  body: z.string(),
  stats: z.array(z.object({ label: z.string(), value: z.string() }))
});

export const messageSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  coachId: z.string(),
  sender: z.enum(["coach", "client"]),
  content: z.string(),
  sentAt: z.string(),
  readAt: z.string().nullable()
});

export const importRowSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  goal: z.string().min(3),
  monthlyPriceGbp: z.coerce.number().positive()
});

export const groupProgramSchema = z.object({
  id: z.string(),
  coachId: z.string(),
  title: z.string(),
  description: z.string(),
  goal: z.string(),
  memberIds: z.array(z.string()),
  monthlyPriceGbp: z.number().nonnegative(),
  status: z.enum(["active", "archived", "upcoming"]),
  createdAt: z.string()
});

export const habitSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  title: z.string(),
  target: z.number().int().positive(),
  frequency: z.enum(["daily", "weekly"]),
  createdAt: z.string()
});

export const habitCompletionSchema = z.object({
  id: z.string(),
  habitId: z.string(),
  date: z.string(),
  completed: z.boolean()
});

export const nutritionSwapSchema = z.object({
  id: z.string(),
  planId: z.string(),
  originalFood: z.object({
    name: z.string(),
    calories: z.number().int().nonnegative(),
    proteinG: z.number(),
    carbsG: z.number(),
    fatG: z.number(),
    portion: z.string()
  }),
  swapSuggestion: z.object({
    name: z.string(),
    calories: z.number().int().nonnegative(),
    proteinG: z.number(),
    carbsG: z.number(),
    fatG: z.number(),
    portion: z.string(),
    reasoning: z.string()
  }),
  appliedAt: z.string().nullable()
});

export const analyticsEventSchema = z.object({
  name: z.enum([
    "coach_onboarded",
    "client_imported",
    "plan_generated",
    "plan_override_by_coach",
    "client_checkin_completed",
    "payment_processed",
    "morning_dashboard_opened",
    "proof_card_generated",
    "proof_card_shared",
    "plan_adapted",
    "churn_alert_triggered",
    "group_program_created"
  ]),
  actorId: z.string(),
  occurredAt: z.string(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
});

export const demoStateSchema = z.object({
  workspace: coachWorkspaceSchema,
  coach: coachUserSchema,
  clients: z.array(clientProfileSchema),
  plans: z.array(programPlanSchema),
  checkIns: z.array(checkInSchema),
  subscriptions: z.array(paymentSubscriptionSchema),
  analytics: z.array(analyticsEventSchema),
  messages: z.array(messageSchema),
  groupPrograms: z.array(groupProgramSchema).optional(),
  nutritionSwaps: z.array(nutritionSwapSchema).optional(),
  habits: z.array(habitSchema).optional(),
  habitCompletions: z.array(habitCompletionSchema).optional()
});

export type CoachWorkspace = z.infer<typeof coachWorkspaceSchema>;
export type CoachUser = z.infer<typeof coachUserSchema>;
export type ClientProfile = z.infer<typeof clientProfileSchema>;
export type ClientProfilePatch = z.infer<typeof clientProfilePatchSchema>;
export type ProgramPlan = z.infer<typeof programPlanSchema>;
export type PlanVersion = z.infer<typeof planVersionSchema>;
export type CheckIn = z.infer<typeof checkInSchema>;
export type PaymentSubscription = z.infer<typeof paymentSubscriptionSchema>;
export type RiskAlert = z.infer<typeof riskAlertSchema>;
export type ProofCard = z.infer<typeof proofCardSchema>;
export type ImportRow = z.infer<typeof importRowSchema>;
export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;
export type Message = z.infer<typeof messageSchema>;
export type GroupProgram = z.infer<typeof groupProgramSchema>;
export type NutritionSwap = z.infer<typeof nutritionSwapSchema>;
export type Habit = z.infer<typeof habitSchema>;
export type HabitCompletion = z.infer<typeof habitCompletionSchema>;

export type DemoState = z.infer<typeof demoStateSchema>;

const today = new Date("2026-04-03T09:00:00.000Z");

export function createSeedState(): DemoState {
  const workspace: CoachWorkspace = {
    id: "ws_uk_1",
    name: "Thrive by Jake",
    brandColor: "#123f2d",
    accentColor: "#ff8757",
    heroMessage: "Built for coaches who take their clients' results seriously.",
    stripeConnected: true,
    parallelRunDaysLeft: 5
  };

  const coach: CoachUser = {
    id: "coach_1",
    workspaceId: workspace.id,
    firstName: "Jake",
    lastName: "Morgan",
    email: "jake@coachos.demo"
  };

  const clients: ClientProfile[] = [
    {
      id: "client_1",
      workspaceId: workspace.id,
      fullName: "Sophie Patel",
      email: "sophie@example.com",
      goal: "Lose 8kg while rebuilding training consistency",
      status: "active",
      adherenceScore: 84,
      currentPlanId: "plan_1",
      monthlyPriceGbp: 199,
      nextRenewalDate: "2026-04-10",
      lastCheckInDate: "2026-04-02"
    },
    {
      id: "client_2",
      workspaceId: workspace.id,
      fullName: "Liam Carter",
      email: "liam@example.com",
      goal: "Drop body fat for summer while keeping strength",
      status: "at_risk",
      adherenceScore: 42,
      currentPlanId: "plan_2",
      monthlyPriceGbp: 149,
      nextRenewalDate: "2026-04-05",
      lastCheckInDate: "2026-03-29"
    },
    {
      id: "client_3",
      workspaceId: workspace.id,
      fullName: "Ava Thompson",
      email: "ava@example.com",
      goal: "Return to training after pregnancy with low-pressure routines",
      status: "trial",
      adherenceScore: 71,
      currentPlanId: null,
      monthlyPriceGbp: 129,
      nextRenewalDate: "2026-04-18",
      lastCheckInDate: null
    }
  ];

  const plans: ProgramPlan[] = [
    {
      id: "plan_1",
      clientId: "client_1",
      coachId: coach.id,
      title: "Sophie Fat Loss Reset",
      latestVersion: {
        id: "plan_1_v2",
        planId: "plan_1",
        versionNumber: 2,
        status: "approved",
        explanation: [
          "Training volume stayed high because Sophie hit 5 of 6 sessions last week.",
          "Calories remain moderate deficit after energy score improved to 7/10."
        ],
        workouts: [
          "3 gym sessions focused on lower-body strength and upper-body pull volume",
          "2 incline-walk cardio blocks at 25 minutes",
          "Daily step target: 9,000"
        ],
        nutrition: [
          "Calories: 1,850 per day",
          "Protein: 135g minimum",
          "Weekend meal out: 1 flexible meal, no calorie banking"
        ],
        updatedAt: "2026-04-02T08:00:00.000Z"
      }
    },
    {
      id: "plan_2",
      clientId: "client_2",
      coachId: coach.id,
      title: "Liam Compliance Rescue",
      latestVersion: {
        id: "plan_2_v1",
        planId: "plan_2",
        versionNumber: 1,
        status: "draft",
        explanation: [
          "Risk score is high because Liam missed 2 check-ins and logged low energy.",
          "The draft lowers complexity to rebuild adherence before pushing intensity."
        ],
        workouts: [
          "2 full-body sessions instead of 4 split sessions",
          "10-minute daily walk after lunch",
          "1 optional weekend conditioning block"
        ],
        nutrition: [
          "Calories: 2,100 per day",
          "Protein: 160g minimum",
          "Replace two takeaway lunches with prepared wraps"
        ],
        updatedAt: "2026-04-03T07:45:00.000Z"
      }
    }
  ];

  const checkIns: CheckIn[] = [
    {
      id: "checkin_1",
      clientId: "client_1",
      submittedAt: "2026-04-02T07:30:00.000Z",
      progress: {
        weightKg: 73.4,
        energyScore: 7,
        steps: 10220,
        waistCm: 78,
        adherenceScore: 86,
        notes: "Felt good all week and hit every session."
      },
      photoCount: 2
    },
    {
      id: "checkin_2",
      clientId: "client_2",
      submittedAt: "2026-03-29T08:00:00.000Z",
      progress: {
        weightKg: 92.1,
        energyScore: 4,
        steps: 4100,
        waistCm: null,
        adherenceScore: 38,
        notes: "Travel week. Missed sessions and meals were messy."
      },
      photoCount: 0
    }
  ];

  const subscriptions: PaymentSubscription[] = clients.map((client) => ({
    id: `sub_${client.id}`,
    clientId: client.id,
    status: client.id === "client_2" ? "past_due" : client.status === "trial" ? "trialing" : "active",
    amountGbp: client.monthlyPriceGbp,
    renewalDate: client.nextRenewalDate
  }));

  return {
    workspace,
    coach,
    clients,
    plans,
    checkIns,
    subscriptions,
    groupPrograms: [],
    nutritionSwaps: [],
    habits: [
      { id: "habit_1", clientId: "client_1", title: "Log meals in the app", target: 1, frequency: "daily", createdAt: "2026-04-01T00:00:00.000Z" },
      { id: "habit_2", clientId: "client_1", title: "Hit 8,000 steps", target: 8000, frequency: "daily", createdAt: "2026-04-01T00:00:00.000Z" },
      { id: "habit_3", clientId: "client_1", title: "Complete weekly check-in", target: 1, frequency: "weekly", createdAt: "2026-04-01T00:00:00.000Z" },
      { id: "habit_4", clientId: "client_2", title: "Log meals in the app", target: 1, frequency: "daily", createdAt: "2026-04-01T00:00:00.000Z" },
      { id: "habit_5", clientId: "client_2", title: "Hit 5,000 steps", target: 5000, frequency: "daily", createdAt: "2026-04-01T00:00:00.000Z" },
      { id: "habit_6", clientId: "client_2", title: "Submit check-in on Friday", target: 1, frequency: "weekly", createdAt: "2026-04-01T00:00:00.000Z" },
      { id: "habit_7", clientId: "client_3", title: "Log meals in the app", target: 1, frequency: "daily", createdAt: "2026-04-01T00:00:00.000Z" },
      { id: "habit_8", clientId: "client_3", title: "Complete a workout", target: 3, frequency: "weekly", createdAt: "2026-04-01T00:00:00.000Z" },
    ],
    habitCompletions: [
      // client_1 — mostly complete
      { id: "hc_1", habitId: "habit_1", date: "2026-04-01", completed: true },
      { id: "hc_2", habitId: "habit_2", date: "2026-04-01", completed: true },
      { id: "hc_3", habitId: "habit_1", date: "2026-04-02", completed: true },
      { id: "hc_4", habitId: "habit_2", date: "2026-04-02", completed: true },
      { id: "hc_5", habitId: "habit_1", date: "2026-04-03", completed: true },
      { id: "hc_6", habitId: "habit_2", date: "2026-04-03", completed: false },
      // client_2 — struggling
      { id: "hc_7", habitId: "habit_4", date: "2026-04-01", completed: false },
      { id: "hc_8", habitId: "habit_5", date: "2026-04-01", completed: true },
    ],
    messages: [
      {
        id: "msg_1",
        clientId: "client_1",
        coachId: coach.id,
        sender: "coach",
        content: "Hey Sophie, let's crush the nutrition goals this week!",
        sentAt: "2026-04-03T08:00:00.000Z",
        readAt: "2026-04-03T08:30:00.000Z"
      },
      {
        id: "msg_2",
        clientId: "client_1",
        coachId: coach.id,
        sender: "client",
        content: "On it! Just prepared my meals.",
        sentAt: "2026-04-03T08:45:00.000Z",
        readAt: "2026-04-03T09:00:00.000Z"
      }
    ],
    analytics: [
      {
        name: "coach_onboarded",
        actorId: coach.id,
        occurredAt: today.toISOString(),
        metadata: { workspace: workspace.name }
      }
    ]
  };
}

export function scoreClientRisk(client: ClientProfile, checkIn?: CheckIn, subscription?: PaymentSubscription): RiskAlert | null {
  const reasons: string[] = [];

  if (!client.lastCheckInDate) {
    reasons.push("No client check-in received yet");
  } else {
    const daysSinceCheckIn = Math.floor(
      (today.getTime() - new Date(client.lastCheckInDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceCheckIn >= 5) {
      reasons.push(`${daysSinceCheckIn} days since the last check-in`);
    }
  }

  if (client.adherenceScore < 50) {
    reasons.push(`Adherence score down to ${client.adherenceScore}%`);
  }

  if (checkIn && checkIn.progress.energyScore <= 4) {
    reasons.push(`Energy dropped to ${checkIn.progress.energyScore}/10`);
  }

  if (subscription?.status === "past_due") {
    reasons.push("Subscription payment needs attention");
  }

  if (!reasons.length) {
    return null;
  }

  return {
    clientId: client.id,
    severity: reasons.length >= 3 ? "high" : reasons.length === 2 ? "medium" : "low",
    reasons,
    recommendedAction:
      reasons.some((reason) => reason.includes("payment"))
        ? "Send a recovery message and trigger dunning follow-up."
        : "Send a one-tap encouragement nudge and simplify next week’s plan."
  };
}

export function summarizeMorningDashboard(state: DemoState) {
  const riskAlerts = state.clients
    .map((client) =>
      scoreClientRisk(
        client,
        state.checkIns.find((checkIn) => checkIn.clientId === client.id),
        state.subscriptions.find((subscription) => subscription.clientId === client.id)
      )
    )
    .filter((alert): alert is RiskAlert => Boolean(alert));

  return {
    date: today.toISOString(),
    activeClients: state.clients.filter((client) => client.status !== "trial").length,
    checkedInToday: state.checkIns.filter((checkIn) => checkIn.submittedAt.slice(0, 10) === "2026-04-03").length,
    dueRenewals: state.subscriptions.filter((subscription) => new Date(subscription.renewalDate) <= new Date("2026-04-10")).length,
    atRiskClients: riskAlerts,
    revenueSnapshotGbp: state.subscriptions
      .filter((subscription) => subscription.status === "active")
      .reduce((total, subscription) => total + subscription.amountGbp, 0)
  };
}

export function previewImport(rows: ImportRow[]) {
  const parsed = rows.map((row, index) => {
    const result = importRowSchema.safeParse(row);
    return {
      row: index + 1,
      success: result.success,
      data: result.success ? result.data : null,
      issues: result.success ? [] : result.error.issues.map((issue) => issue.message)
    };
  });

  return {
    validRows: parsed.filter((row) => row.success).length,
    invalidRows: parsed.filter((row) => !row.success).length,
    parsed
  };
}

export function createDraftPlan(client: ClientProfile, coachId: string): ProgramPlan {
  const riskLevel = client.adherenceScore < 50 ? "recovery" : "growth";
  const workouts =
    riskLevel === "recovery"
      ? [
          "2 simplified full-body sessions with 5 exercises each",
          "Daily 8,000-step target",
          "1 mobility recovery block on Sunday"
        ]
      : [
          "3 progressive overload strength sessions",
          "2 zone-2 cardio blocks",
          "Daily 9,000-step target"
        ];

  const nutrition =
    riskLevel === "recovery"
      ? [
          "Use a repeatable breakfast and lunch template for five days",
          "Protein floor: 150g",
          "One coached meal prep block each Sunday"
        ]
      : [
          "Moderate calorie deficit aligned to fat-loss phase",
          "Protein floor: 135g",
          "One flexible meal each weekend with no rebound restriction"
        ];

  return {
    id: `plan_${client.id}`,
    clientId: client.id,
    coachId,
    title: `${client.fullName.split(" ")[0]} Momentum Plan`,
    latestVersion: {
      id: `plan_${client.id}_v1`,
      planId: `plan_${client.id}`,
      versionNumber: 1,
      status: "draft",
      explanation: [
        `Draft built for ${client.goal.toLowerCase()}.`,
        riskLevel === "recovery"
          ? "Plan complexity reduced because adherence and/or check-ins have dropped."
          : "Plan keeps momentum high because the client is showing consistent adherence."
      ],
      workouts,
      nutrition,
      updatedAt: today.toISOString()
    }
  };
}

export function approvePlan(plan: ProgramPlan): ProgramPlan {
  return {
    ...plan,
    latestVersion: {
      ...plan.latestVersion,
      status: "approved",
      versionNumber: plan.latestVersion.versionNumber + 1,
      id: `${plan.id}_v${plan.latestVersion.versionNumber + 1}`,
      updatedAt: today.toISOString()
    }
  };
}

export function createProofCard(client: ClientProfile, latestCheckIn?: CheckIn): ProofCard {
  return {
    clientId: client.id,
    headline: `${client.fullName.split(" ")[0]} is rebuilding consistency with premium accountability`,
    body: latestCheckIn
      ? `Energy is ${latestCheckIn.progress.energyScore}/10, steps reached ${latestCheckIn.progress.steps.toLocaleString()}, and the coach now has a clean progress trail ready for sharing.`
      : "Client has been onboarded and is ready for the first measurable proof milestone.",
    stats: [
      { label: "Adherence", value: `${client.adherenceScore}%` },
      { label: "Monthly value", value: `£${client.monthlyPriceGbp}` },
      { label: "Next review", value: client.nextRenewalDate }
    ]
  };
}

export function validateAnalyticsEvent(event: AnalyticsEvent) {
  return analyticsEventSchema.parse(event);
}
