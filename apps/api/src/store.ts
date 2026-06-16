import {
  approvePlan,
  analyticsEventSchema,
  checkInSchema,
  clientProfilePatchSchema,
  clientProfileSchema,
  createSeedState,
  demoStateSchema,
  groupProgramSchema,
  nutritionSwapSchema,
  previewImport,
  summarizeMorningDashboard,
  type AnalyticsEvent,
  type DemoState,
  type GroupProgram,
  type Habit,
  type HabitCompletion,
  type NutritionSwap
} from "@coachos/domain";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { createMockServiceAdapters, type DemoServiceAdapters } from "./services";

// Extended state type — adds optional arrays for notes, metrics, and sessions
// that are not in the shared domain package's DemoState.
type ExtendedDemoState = DemoState & {
  clientNotes?: ClientNote[];
  bodyMetrics?: BodyMetric[];
  sessions?: Session[];
};

export const clientNoteSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  content: z.string(),
  createdAt: z.string()
});

export const bodyMetricSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  date: z.string(),
  weightKg: z.number().nullable().default(null),
  bodyFatPct: z.number().nullable().default(null),
  waistCm: z.number().nullable().default(null)
});

export const sessionSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  date: z.string(),
  duration: z.number().int().positive(),
  type: z.enum(["virtual", "in-person"]),
  notes: z.string().nullable().default(null),
  createdAt: z.string()
});

export type ClientNote = z.infer<typeof clientNoteSchema>;
export type BodyMetric = z.infer<typeof bodyMetricSchema>;
export type Session = z.infer<typeof sessionSchema>;

export interface DemoStateRepository {
  load(): Promise<DemoState>;
  save(state: DemoState): Promise<void>;
  createSeedState(): DemoState;
  describe(): {
    storage: string;
    stateFilePath: string | null;
  };
}

export class InMemoryDemoStateRepository implements DemoStateRepository {
  private state: DemoState;

  constructor(initialState: DemoState = createSeedState()) {
    this.state = initialState;
  }

  async load() {
    return this.state;
  }

  async save(state: DemoState) {
    this.state = state;
  }

  createSeedState() {
    return createSeedState();
  }

  describe() {
    return {
      storage: "InMemoryDemoStateRepository",
      stateFilePath: null
    };
  }
}

export class JsonFileDemoStateRepository implements DemoStateRepository {
  constructor(
    private readonly filePath: string,
    private readonly seedFactory: () => DemoState = createSeedState
  ) {}

  async load() {
    if (!fs.existsSync(this.filePath)) {
      const seeded = this.seedFactory();
      await this.save(seeded);
      return seeded;
    }

    const raw = fs.readFileSync(this.filePath, "utf8");
    return JSON.parse(raw) as DemoState;
  }

  async save(state: DemoState) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2), "utf8");
  }

  createSeedState() {
    return this.seedFactory();
  }

  describe() {
    return {
      storage: "JsonFileDemoStateRepository",
      stateFilePath: this.filePath
    };
  }
}

export function getDefaultStateFilePath() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "..", ".data", "coachos-state.json");
}

export class PostgresDemoStateRepository implements DemoStateRepository {
  constructor(
    private readonly connectionString: string,
    private readonly seedFactory: () => DemoState = createSeedState
  ) {}

  private createPool() {
    return new Pool({
      connectionString: this.connectionString,
      max: 1
    });
  }

  private async ensureSchema(pool: Pool) {
    await pool.query(`
      create table if not exists coachos_app_state (
        id text primary key,
        snapshot jsonb not null,
        updated_at timestamptz not null default now()
      )
    `);
  }

  async load() {
    const pool = this.createPool();
    try {
      await this.ensureSchema(pool);
      const result = await pool.query(
        "select snapshot from coachos_app_state where id = $1",
        ["singleton"]
      );
      if (result.rowCount && result.rows[0]?.snapshot) {
        return demoStateSchema.parse(result.rows[0].snapshot);
      }

      const seeded = this.seedFactory();
      await this.save(seeded);
      return seeded;
    } finally {
      await pool.end();
    }
  }

  async save(state: DemoState) {
    const pool = this.createPool();
    try {
      await this.ensureSchema(pool);
      await pool.query(
        `
          insert into coachos_app_state (id, snapshot, updated_at)
          values ($1, $2::jsonb, now())
          on conflict (id) do update
          set snapshot = excluded.snapshot,
              updated_at = excluded.updated_at
        `,
        ["singleton", JSON.stringify(state)]
      );
    } finally {
      await pool.end();
    }
  }

  createSeedState() {
    return this.seedFactory();
  }

  describe() {
    return {
      storage: "PostgresDemoStateRepository",
      stateFilePath: null
    };
  }
}

export class PostgresRelationalDemoStateRepository implements DemoStateRepository {
  constructor(
    private readonly connectionString: string,
    private readonly seedFactory: () => DemoState = createSeedState
  ) {}

  private createPool() {
    return new Pool({
      connectionString: this.connectionString,
      max: 1
    });
  }

  private async ensureSchema(pool: Pool) {
    await pool.query(`
      create table if not exists coachos_workspace (
        id text primary key,
        name text not null,
        brand_color text not null,
        accent_color text not null,
        hero_message text not null,
        stripe_connected boolean not null,
        parallel_run_days_left integer not null
      );

      create table if not exists coachos_coach_user (
        id text primary key,
        workspace_id text not null references coachos_workspace(id) on delete cascade,
        first_name text not null,
        last_name text not null,
        email text not null
      );

      create table if not exists coachos_client_profile (
        id text primary key,
        workspace_id text not null references coachos_workspace(id) on delete cascade,
        full_name text not null,
        email text not null,
        goal text not null,
        status text not null,
        adherence_score integer not null,
        current_plan_id text null,
        monthly_price_usd numeric not null,
        next_renewal_date text not null,
        last_checkin_date text null
      );

      create table if not exists coachos_program_plan (
        id text primary key,
        client_id text not null references coachos_client_profile(id) on delete cascade,
        coach_id text not null references coachos_coach_user(id) on delete cascade,
        title text not null,
        latest_version jsonb not null
      );

      create table if not exists coachos_checkin (
        id text primary key,
        client_id text not null references coachos_client_profile(id) on delete cascade,
        submitted_at text not null,
        progress jsonb not null,
        photo_count integer not null
      );

      create table if not exists coachos_subscription (
        id text primary key,
        client_id text not null references coachos_client_profile(id) on delete cascade,
        status text not null,
        amount_usd numeric not null,
        renewal_date text not null
      );

      create table if not exists coachos_analytics_event (
        event_id bigserial primary key,
        name text not null,
        actor_id text not null,
        occurred_at text not null,
        metadata jsonb not null
      );
    `);
  }

  async load() {
    const pool = this.createPool();
    try {
      await this.ensureSchema(pool);

      const workspaceResult = await pool.query("select * from coachos_workspace limit 1");
      if (!workspaceResult.rowCount) {
        const seeded = this.seedFactory();
        await this.save(seeded);
        return seeded;
      }

      const workspaceRow = workspaceResult.rows[0];
      const coachRow = (await pool.query("select * from coachos_coach_user limit 1")).rows[0];
      const clientRows = (await pool.query("select * from coachos_client_profile order by full_name asc")).rows;
      const planRows = (await pool.query("select * from coachos_program_plan order by id asc")).rows;
      const checkInRows = (await pool.query("select * from coachos_checkin order by submitted_at desc")).rows;
      const subscriptionRows = (await pool.query("select * from coachos_subscription order by id asc")).rows;
      const analyticsRows = (await pool.query("select name, actor_id, occurred_at, metadata from coachos_analytics_event order by event_id asc")).rows;

      return demoStateSchema.parse({
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
          workspaceId: coachRow.workspace_id,
          firstName: coachRow.first_name,
          lastName: coachRow.last_name,
          email: coachRow.email
        },
        clients: clientRows.map((row) => ({
          id: row.id,
          workspaceId: row.workspace_id,
          fullName: row.full_name,
          email: row.email,
          goal: row.goal,
          status: row.status,
          adherenceScore: row.adherence_score,
          currentPlanId: row.current_plan_id,
          monthlyPriceUsd: Number(row.monthly_price_usd),
          nextRenewalDate: row.next_renewal_date,
          lastCheckInDate: row.last_checkin_date
        })),
        plans: planRows.map((row) => ({
          id: row.id,
          clientId: row.client_id,
          coachId: row.coach_id,
          title: row.title,
          latestVersion: row.latest_version
        })),
        checkIns: checkInRows.map((row) => ({
          id: row.id,
          clientId: row.client_id,
          submittedAt: row.submitted_at,
          progress: row.progress,
          photoCount: row.photo_count
        })),
        subscriptions: subscriptionRows.map((row) => ({
          id: row.id,
          clientId: row.client_id,
          status: row.status,
          amountUsd: Number(row.amount_usd),
          renewalDate: row.renewal_date
        })),
        analytics: analyticsRows.map((row) => ({
          name: row.name,
          actorId: row.actor_id,
          occurredAt: row.occurred_at,
          metadata: row.metadata
        }))
      });
    } finally {
      await pool.end();
    }
  }

  async save(state: DemoState) {
    const pool = this.createPool();
    try {
      await this.ensureSchema(pool);
      await pool.query("begin");

      await pool.query("delete from coachos_analytics_event");
      await pool.query("delete from coachos_subscription");
      await pool.query("delete from coachos_checkin");
      await pool.query("delete from coachos_program_plan");
      await pool.query("delete from coachos_client_profile");
      await pool.query("delete from coachos_coach_user");
      await pool.query("delete from coachos_workspace");

      await pool.query(
        `
          insert into coachos_workspace
            (id, name, brand_color, accent_color, hero_message, stripe_connected, parallel_run_days_left)
          values ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          state.workspace.id,
          state.workspace.name,
          state.workspace.brandColor,
          state.workspace.accentColor,
          state.workspace.heroMessage,
          state.workspace.stripeConnected,
          state.workspace.parallelRunDaysLeft
        ]
      );

      await pool.query(
        `
          insert into coachos_coach_user
            (id, workspace_id, first_name, last_name, email)
          values ($1, $2, $3, $4, $5)
        `,
        [
          state.coach.id,
          state.coach.workspaceId,
          state.coach.firstName,
          state.coach.lastName,
          state.coach.email
        ]
      );

      for (const client of state.clients) {
        await pool.query(
          `
            insert into coachos_client_profile
              (id, workspace_id, full_name, email, goal, status, adherence_score, current_plan_id, monthly_price_usd, next_renewal_date, last_checkin_date)
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          `,
          [
            client.id,
            client.workspaceId,
            client.fullName,
            client.email,
            client.goal,
            client.status,
            client.adherenceScore,
            client.currentPlanId,
            client.monthlyPriceUsd,
            client.nextRenewalDate,
            client.lastCheckInDate
          ]
        );
      }

      for (const plan of state.plans) {
        await pool.query(
          `
            insert into coachos_program_plan
              (id, client_id, coach_id, title, latest_version)
            values ($1, $2, $3, $4, $5::jsonb)
          `,
          [plan.id, plan.clientId, plan.coachId, plan.title, JSON.stringify(plan.latestVersion)]
        );
      }

      for (const checkIn of state.checkIns) {
        await pool.query(
          `
            insert into coachos_checkin
              (id, client_id, submitted_at, progress, photo_count)
            values ($1, $2, $3, $4::jsonb, $5)
          `,
          [checkIn.id, checkIn.clientId, checkIn.submittedAt, JSON.stringify(checkIn.progress), checkIn.photoCount]
        );
      }

      for (const subscription of state.subscriptions) {
        await pool.query(
          `
            insert into coachos_subscription
              (id, client_id, status, amount_usd, renewal_date)
            values ($1, $2, $3, $4, $5)
          `,
          [subscription.id, subscription.clientId, subscription.status, subscription.amountUsd, subscription.renewalDate]
        );
      }

      for (const event of state.analytics) {
        await pool.query(
          `
            insert into coachos_analytics_event
              (name, actor_id, occurred_at, metadata)
            values ($1, $2, $3, $4::jsonb)
          `,
          [event.name, event.actorId, event.occurredAt, JSON.stringify(event.metadata)]
        );
      }

      await pool.query("commit");
    } catch (error) {
      await pool.query("rollback");
      throw error;
    } finally {
      await pool.end();
    }
  }

  createSeedState() {
    return this.seedFactory();
  }

  describe() {
    return {
      storage: "PostgresRelationalDemoStateRepository",
      stateFilePath: null
    };
  }
}

export class DemoStore {
  private state: ExtendedDemoState;

  private constructor(
    private readonly repository: DemoStateRepository = new InMemoryDemoStateRepository(),
    private readonly adapters: DemoServiceAdapters = createMockServiceAdapters(),
    initialState?: DemoState
  ) {
    this.state = initialState ?? createSeedState();
  }

  static async create(
    repository: DemoStateRepository = new InMemoryDemoStateRepository(),
    adapters: DemoServiceAdapters = createMockServiceAdapters()
  ) {
    const initialState = await repository.load();
    return new DemoStore(repository, adapters, initialState);
  }

  getState(): ExtendedDemoState {
    return this.state;
  }

  getRuntimeInfo() {
    return {
      ...this.repository.describe(),
      services: {
        planGeneration: this.adapters.planGeneration.name,
        proofCards: this.adapters.proofCards.name,
        billing: this.adapters.billing.name
      }
    };
  }

  private async commit() {
    await this.repository.save(this.state);
  }

  async track(name: AnalyticsEvent["name"], actorId: string, metadata: Record<string, string | number | boolean>) {
    this.state.analytics.push({
      name,
      actorId,
      occurredAt: new Date().toISOString(),
      metadata
    });
    await this.commit();
  }

  async updateWorkspace(payload: Partial<DemoState["workspace"]>) {
    this.state.workspace = {
      ...this.state.workspace,
      ...payload,
      stripeConnected: Boolean(payload.stripeConnected ?? this.state.workspace.stripeConnected)
    };
    await this.track("coach_onboarded", this.state.coach.id, { updated: true });
    return this.state.workspace;
  }

  previewImport(rows: unknown[]) {
    return previewImport(rows as never[]);
  }

  async commitImport(rows: unknown[]) {
    const preview = this.previewImport(rows);
    const imported = preview.parsed
      .filter((row) => row.success && row.data)
      .map((row, index) =>
        clientProfileSchema.parse({
          id: `client_import_${this.state.clients.length + index + 1}`,
          workspaceId: this.state.workspace.id,
          fullName: row.data!.name,
          email: row.data!.email,
          goal: row.data!.goal,
          status: "trial",
          adherenceScore: 60,
          currentPlanId: null,
          monthlyPriceUsd: row.data!.monthlyPriceUsd,
          nextRenewalDate: "2026-04-24",
          lastCheckInDate: null
        })
      );

    this.state.clients = [...this.state.clients, ...imported];
    this.state.subscriptions = [
      ...this.state.subscriptions,
      ...imported.map((client) => this.adapters.billing.createImportedSubscription(client))
    ];
    await this.track("client_imported", this.state.coach.id, { count: imported.length });

    return { importedCount: imported.length, imported, preview };
  }

  exportData() {
    return {
      exportedAt: new Date().toISOString(),
      parallelRunDaysLeft: this.state.workspace.parallelRunDaysLeft,
      data: this.state
    };
  }

  async restoreData(snapshot: unknown) {
    const parsed = demoStateSchema.safeParse(snapshot);
    if (!parsed.success) {
      return { success: false as const, issues: parsed.error.issues };
    }

    this.state = parsed.data;
    await this.commit();
    await this.track("coach_onboarded", this.state.coach.id, { restored: true });
    return { success: true as const, state: this.state };
  }

  async resetData() {
    this.state = this.repository.createSeedState();
    await this.commit();
    await this.track("coach_onboarded", this.state.coach.id, { reset: true });
    return this.getCoachSession();
  }

  async generatePlan(clientId: string) {
    const client = this.state.clients.find((item) => item.id === clientId);
    if (!client) {
      return null;
    }

    const plan = await this.adapters.planGeneration.generateDraft(client, this.state.coach.id);
    this.state.plans = [...this.state.plans.filter((item) => item.clientId !== client.id), plan];
    this.state.clients = this.state.clients.map((item) =>
      item.id === client.id ? { ...item, currentPlanId: plan.id } : item
    );
    await this.track("plan_generated", this.state.coach.id, { clientId: client.id });
    return plan;
  }

  async approvePlan(planId: string) {
    const plan = this.state.plans.find((item) => item.id === planId);
    if (!plan) {
      return null;
    }

    const approved = approvePlan(plan);
    this.state.plans = this.state.plans.map((item) => (item.id === approved.id ? approved : item));
    await this.track("plan_override_by_coach", this.state.coach.id, { planId: approved.id, manualApproval: true });
    return approved;
  }

  async submitCheckIn(payload: unknown) {
    const parsed = checkInSchema.safeParse(payload);
    if (!parsed.success) {
      return { success: false as const, issues: parsed.error.issues };
    }

    this.state.checkIns = [parsed.data, ...this.state.checkIns.filter((item) => item.id !== parsed.data.id)];
    this.state.clients = this.state.clients.map((client) =>
      client.id === parsed.data.clientId
        ? {
            ...client,
            lastCheckInDate: parsed.data.submittedAt.slice(0, 10),
            adherenceScore: Math.min(100, Math.max(35, parsed.data.progress.steps >= 8000 ? client.adherenceScore + 4 : client.adherenceScore - 6)),
            status: parsed.data.progress.energyScore <= 4 ? "at_risk" : "active"
          }
        : client
    );
    await this.track("client_checkin_completed", parsed.data.clientId, { photos: parsed.data.photoCount });

    return {
      success: true as const,
      checkIn: parsed.data,
      dashboard: summarizeMorningDashboard(this.state)
    };
  }

  getCoachSession() {
    return {
      workspace: this.state.workspace,
      coach: this.state.coach,
      clients: this.state.clients,
      plans: this.state.plans,
      subscriptions: this.state.subscriptions,
      dashboard: summarizeMorningDashboard(this.state)
    };
  }

  listClients(filters?: { status?: string; search?: string }) {
    const status = filters?.status?.trim().toLowerCase();
    const search = filters?.search?.trim().toLowerCase();

    return this.state.clients.filter((client) => {
      const statusMatch = status ? client.status === status : true;
      const searchMatch = search
        ? [client.fullName, client.email, client.goal].some((value) => value.toLowerCase().includes(search))
        : true;
      return statusMatch && searchMatch;
    });
  }

  listPlans(filters?: { status?: string; clientId?: string }) {
    const status = filters?.status?.trim().toLowerCase();
    const clientId = filters?.clientId?.trim();

    return this.state.plans.filter((plan) => {
      const statusMatch = status ? plan.latestVersion.status === status : true;
      const clientMatch = clientId ? plan.clientId === clientId : true;
      return statusMatch && clientMatch;
    });
  }

  listCheckIns(filters?: { clientId?: string }) {
    const clientId = filters?.clientId?.trim();
    return this.state.checkIns.filter((checkIn) => (clientId ? checkIn.clientId === clientId : true));
  }

  listMessages(clientId: string) {
    if (!this.state.messages) this.state.messages = [];
    return this.state.messages.filter((msg) => msg.clientId === clientId).sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
  }

  async sendMessage(payload: { clientId: string; content: string; sender: "coach" | "client" }) {
    if (!this.state.messages) this.state.messages = [];
    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      clientId: payload.clientId,
      coachId: this.state.coach.id,
      sender: payload.sender,
      content: payload.content,
      sentAt: new Date().toISOString(),
      readAt: null
    };
    
    this.state.messages.push(message);
    await this.commit();
    return { success: true as const, message };
  }

  // ── Client CRUD ─────────────────────────────────────────────────────────────
  async createClient(payload: unknown) {
    const parsed = clientProfileSchema.omit({ id: true }).safeParse(payload);
    if (!parsed.success) {
      return { success: false as const, issues: parsed.error.issues };
    }

    const client = {
      ...parsed.data,
      id: `client_${Date.now()}_${Math.random().toString(36).substring(7)}`
    };
    this.state.clients = [...this.state.clients, client];
    await this.commit();
    await this.track("coach_onboarded", this.state.coach.id, { clientCreated: client.id });
    return { success: true as const, client };
  }

  // ── Client Notes ────────────────────────────────────────────────────────────
  listClientNotes(clientId: string) {
    if (!this.state.clientNotes) this.state.clientNotes = [];
    return this.state.clientNotes.filter((n) => n.clientId === clientId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createClientNote(clientId: string, content: string) {
    if (!this.state.clientNotes) this.state.clientNotes = [];
    const note = {
      id: `note_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      clientId,
      content,
      createdAt: new Date().toISOString()
    };
    this.state.clientNotes = [...this.state.clientNotes, note];
    await this.commit();
    await this.track("coach_onboarded", this.state.coach.id, { noteCreated: note.id });
    return note;
  }

  async deleteClientNote(clientId: string, noteId: string) {
    if (!this.state.clientNotes) return false;
    const existing = this.state.clientNotes.find((n) => n.id === noteId && n.clientId === clientId);
    if (!existing) return false;
    this.state.clientNotes = this.state.clientNotes.filter((n) => n.id !== noteId);
    await this.commit();
    return true;
  }

  // ── Client Body Metrics ──────────────────────────────────────────────────────
  listBodyMetrics(clientId: string) {
    if (!this.state.bodyMetrics) this.state.bodyMetrics = [];
    return this.state.bodyMetrics
      .filter((m) => m.clientId === clientId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  async saveBodyMetric(clientId: string, payload: { date: string; weightKg?: number | null; bodyFatPct?: number | null; waistCm?: number | null }) {
    if (!this.state.bodyMetrics) this.state.bodyMetrics = [];
    const metric = {
      id: `metric_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      clientId,
      date: payload.date,
      weightKg: payload.weightKg ?? null,
      bodyFatPct: payload.bodyFatPct ?? null,
      waistCm: payload.waistCm ?? null
    };
    this.state.bodyMetrics = [...this.state.bodyMetrics, metric];
    await this.commit();
    return metric;
  }

  // ── Session Booking ────────────────────────────────────────────────────────
  async createSession(clientId: string, payload: { date: string; duration: number; type: "virtual" | "in-person"; notes?: string }) {
    if (!this.state.sessions) this.state.sessions = [];
    const session: Session = {
      id: `session_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      clientId,
      date: payload.date,
      duration: payload.duration,
      type: payload.type,
      notes: payload.notes ?? null,
      createdAt: new Date().toISOString()
    };
    this.state.sessions = [...this.state.sessions, session];
    await this.commit();
    await this.track("coach_onboarded", this.state.coach.id, { sessionCreated: session.id });
    return session;
  }


  async updateClient(clientId: string, patch: unknown) {
    const parsed = clientProfilePatchSchema.safeParse(patch);
    if (!parsed.success) {
      return { success: false as const, issues: parsed.error.issues };
    }

    const existing = this.state.clients.find((client) => client.id === clientId);
    if (!existing) {
      return { success: false as const, notFound: true };
    }

    const updated = clientProfileSchema.parse({
      ...existing,
      ...parsed.data
    });

    this.state.clients = this.state.clients.map((client) => (client.id === clientId ? updated : client));
    this.state.subscriptions = this.state.subscriptions.map((subscription) =>
      subscription.clientId === clientId
        ? {
            ...subscription,
            amountUsd: updated.monthlyPriceUsd,
            renewalDate: updated.nextRenewalDate
          }
        : subscription
    );
    await this.commit();
    await this.track("coach_onboarded", this.state.coach.id, { clientUpdated: clientId });

    return { success: true as const, client: updated };
  }

  getClientSession(clientId: string) {
    const client = this.state.clients.find((item) => item.id === clientId);
    if (!client) {
      return null;
    }

    return {
      client,
      plan: this.state.plans.find((plan) => plan.clientId === client.id) ?? null,
      latestCheckIn: this.state.checkIns.find((checkIn) => checkIn.clientId === client.id) ?? null,
      proofCard: this.adapters.proofCards.build(client, this.state.checkIns.find((checkIn) => checkIn.clientId === client.id)),
      messages: this.listMessages(client.id)
    };
  }

  async getMorningDashboard() {
    await this.track("morning_dashboard_opened", this.state.coach.id, { source: "web" });
    return summarizeMorningDashboard(this.state);
  }

  getBillingSummary() {
    return this.adapters.billing.summarize(this.state.subscriptions);
  }

  async updateBilling(clientId: string, status: "active" | "past_due" | "cancelled") {
    this.state.subscriptions = this.adapters.billing.applyWebhookUpdate(this.state.subscriptions, clientId, status);
    await this.track("payment_processed", clientId, { status });
    return { ok: true, subscriptions: this.state.subscriptions };
  }

  async getProofCard(clientId: string) {
    const client = this.state.clients.find((item) => item.id === clientId);
    if (!client) {
      return null;
    }

    const proofCard = this.adapters.proofCards.build(
      client,
      this.state.checkIns.find((checkIn) => checkIn.clientId === client.id)
    );
    await this.track("proof_card_generated", this.state.coach.id, { clientId: client.id });
    return proofCard;
  }

  getAnalytics() {
    return { events: this.state.analytics, summary: summarizeAnalytics(this.state.analytics) };
  }

  async recordAnalytics(event: unknown) {
    const parsed = analyticsEventSchema.safeParse(event);
    if (!parsed.success) {
      return { success: false as const, issues: parsed.error.issues };
    }

    this.state.analytics.push(parsed.data);
    await this.commit();
    return { success: true as const, event: parsed.data };
  }

  // ── Group Programs ────────────────────────────────────────────────────
  listGroupPrograms() {
    if (!this.state.groupPrograms) this.state.groupPrograms = [];
    return this.state.groupPrograms;
  }

  async createGroupProgram(payload: unknown) {
    const parsed = groupProgramSchema.safeParse(payload);
    if (!parsed.success) {
      return { success: false as const, issues: parsed.error.issues };
    }
    if (!this.state.groupPrograms) this.state.groupPrograms = [];
    this.state.groupPrograms = [...this.state.groupPrograms, parsed.data];
    await this.track("group_program_created", parsed.data.coachId, { programId: parsed.data.id, title: parsed.data.title });
    return { success: true as const, program: parsed.data };
  }

  async updateGroupProgram(programId: string, patch: unknown) {
    if (!this.state.groupPrograms) this.state.groupPrograms = [];
    const existing = this.state.groupPrograms.find(p => p.id === programId);
    if (!existing) return { success: false as const, notFound: true as const };

    const merged = groupProgramSchema.safeParse({ ...existing, ...(patch as Partial<GroupProgram>) });
    if (!merged.success) return { success: false as const, issues: merged.error.issues };

    this.state.groupPrograms = this.state.groupPrograms.map(p => p.id === programId ? merged.data : p);
    await this.commit();
    return { success: true as const, program: merged.data };
  }

  async archiveGroupProgram(programId: string) {
    if (!this.state.groupPrograms) return false;
    const existing = this.state.groupPrograms.find(p => p.id === programId);
    if (!existing) return false;
    this.state.groupPrograms = this.state.groupPrograms.map(p => p.id === programId ? { ...p, status: "archived" as const } : p);
    await this.commit();
    return true;
  }

  // ── Nutrition Swap Agent ─────────────────────────────────────────────
  private readonly SWAP_LIBRARY: Array<{ name: string; calories: number; proteinG: number; carbsG: number; fatG: number; portion: string; tags: string[] }> = [
    { name: "Grilled chicken breast (150g)", calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6, portion: "150g", tags: ["chicken", "protein", "lean"] },
    { name: "Salmon fillet (150g)", calories: 280, proteinG: 30, carbsG: 0, fatG: 17, portion: "150g", tags: ["fish", "omega3", "protein"] },
    { name: "Greek yoghurt (150g)", calories: 100, proteinG: 17, carbsG: 6, fatG: 0, portion: "150g", tags: ["dairy", "protein", "probiotic"] },
    { name: "Oats with berries (80g)", calories: 290, proteinG: 9, carbsG: 52, fatG: 5, portion: "80g dry", tags: ["carbs", "fibre", "breakfast"] },
    { name: "Brown rice (200g cooked)", calories: 220, proteinG: 5, carbsG: 46, fatG: 1.8, portion: "200g cooked", tags: ["carbs", "wholegrain", "rice"] },
    { name: "Sweet potato (200g)", calories: 172, proteinG: 3, carbsG: 40, fatG: 0.4, portion: "200g", tags: ["carbs", "fibre", "vegetable"] },
    { name: "Egg white omelette (4 eggs)", calories: 68, proteinG: 14, carbsG: 1, fatG: 0.8, portion: "4 egg whites", tags: ["egg", "protein", "lowfat"] },
    { name: "Turkey mince (150g)", calories: 135, proteinG: 27, carbsG: 0, fatG: 2, portion: "150g", tags: ["meat", "protein", "lean"] },
    { name: "Cottage cheese (150g)", calories: 98, proteinG: 11, carbsG: 3.4, fatG: 4.3, portion: "150g", tags: ["dairy", "protein", "lowcal"] },
    { name: "Avocado (half)", calories: 160, proteinG: 2, carbsG: 9, fatG: 15, portion: "half", tags: ["fat", "creamy", "vegetable"] },
    { name: "Quinoa (200g cooked)", calories: 222, proteinG: 8, carbsG: 39, fatG: 3.6, portion: "200g cooked", tags: ["carbs", "protein", "wholegrain"] },
    { name: "Protein shake (whey, 30g)", calories: 120, proteinG: 24, carbsG: 3, fatG: 1, portion: "30g scoop", tags: ["protein", "supplement", "shake"] },
  ];

  suggestNutritionSwap(payload: { planId: string; originalFood: { name: string; calories: number; proteinG: number; carbsG: number; fatG: number; portion: string } }) {
    const { originalFood } = payload;
    const targetCalories = originalFood.calories;
    const targetProtein = originalFood.proteinG;

    // Find best swap: close calories but ideally better protein density
    const scored = this.SWAP_LIBRARY.map(item => {
      const calorieDiff = Math.abs(item.calories - targetCalories);
      const proteinDiff = Math.abs(item.proteinG - targetProtein);
      const score = (calorieDiff <= 50 ? 10 - calorieDiff / 10 : 0) + (proteinDiff <= 10 ? 5 - proteinDiff / 3 : 0);
      return { item, score };
    }).sort((a, b) => b.score - a.score);

    const best = scored[0]?.item;
    if (!best) return { original: originalFood, suggestion: null };

    return {
      original: originalFood,
      suggestion: {
        ...best,
        reasoning: best.proteinG > originalFood.proteinG
          ? `Swap for ${best.name} — ${best.proteinG}g protein (vs ${originalFood.proteinG}g) with similar calories.`
          : `Swap for ${best.name} — similar calories with better macro balance.`,
      }
    };
  }

  async applyNutritionSwap(payload: { planId: string; swapId?: string; suggestion: NutritionSwap["swapSuggestion"]; originalFood: NutritionSwap["originalFood"] }) {
    const swap: NutritionSwap = {
      id: `swap_${Date.now()}`,
      planId: payload.planId,
      originalFood: payload.originalFood,
      swapSuggestion: payload.suggestion,
      appliedAt: new Date().toISOString()
    };
    if (!this.state.nutritionSwaps) this.state.nutritionSwaps = [];
    this.state.nutritionSwaps = [...this.state.nutritionSwaps, swap];
    await this.commit();
    return { success: true as const, swap };
  }

  getNutritionSwaps(planId: string) {
    if (!this.state.nutritionSwaps) return [];
    return this.state.nutritionSwaps.filter(s => s.planId === planId);
  }

  // ── Exercise Library ────────────────────────────────────────────────
  private readonly EXERCISE_LIBRARY: Array<{ id: string; name: string; bodyPart: string; equipment: string; goal: string; difficulty: "beginner"|"intermediate"|"advanced"; instructions: string }> = [
    // ── Chest (ex_1 – ex_25) ──
    { id: "ex_1", name: "Barbell Bench Press", bodyPart: "Chest", equipment: "Barbell", goal: "Strength", difficulty: "intermediate", instructions: "Lie flat on bench, grip bar slightly wider than shoulder-width, lower to mid-chest, press up to full extension." },
    { id: "ex_2", name: "Dumbbell Bench Press", bodyPart: "Chest", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Lie flat with dumbbells at chest level, press up until arms are fully extended, lower with control." },
    { id: "ex_3", name: "Incline Barbell Press", bodyPart: "Chest", equipment: "Barbell", goal: "Strength", difficulty: "intermediate", instructions: "Set bench to 30-45°, lower bar to upper chest, press up to lockout focusing on upper pec contraction." },
    { id: "ex_4", name: "Incline Dumbbell Press", bodyPart: "Chest", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Bench at 30-45°, dumbbells at shoulder height, press upward and slightly inward at the top." },
    { id: "ex_5", name: "Decline Barbell Press", bodyPart: "Chest", equipment: "Barbell", goal: "Strength", difficulty: "intermediate", instructions: "Secure legs on decline bench, lower bar to lower sternum, press up driving through palms." },
    { id: "ex_6", name: "Decline Dumbbell Press", bodyPart: "Chest", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "intermediate", instructions: "On decline bench, press dumbbells from lower chest upward, squeeze at lockout." },
    { id: "ex_7", name: "Dumbbell Flyes", bodyPart: "Chest", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Lie flat, arms extended above chest with slight elbow bend, lower arms out to sides in an arc, squeeze chest to return." },
    { id: "ex_8", name: "Cable Crossover", bodyPart: "Chest", equipment: "Cable", goal: "Hypertrophy", difficulty: "intermediate", instructions: "Set pulleys high, step forward, bring hands together in an arc in front of chest, squeeze and slowly release." },
    { id: "ex_9", name: "Low Cable Crossover", bodyPart: "Chest", equipment: "Cable", goal: "Hypertrophy", difficulty: "intermediate", instructions: "Set pulleys low, pull cables upward in an arc, meet hands at upper chest, squeeze upper pecs." },
    { id: "ex_10", name: "Pec Deck Machine", bodyPart: "Chest", equipment: "Machine", goal: "Hypertrophy", difficulty: "beginner", instructions: "Sit with back flat against pad, bring handles together in front of chest, squeeze pecs, return slowly." },
    { id: "ex_11", name: "Push-Up", bodyPart: "Chest", equipment: "Bodyweight", goal: "Endurance", difficulty: "beginner", instructions: "Hands shoulder-width, body straight, lower chest to floor, push back up fully." },
    { id: "ex_12", name: "Weighted Push-Up", bodyPart: "Chest", equipment: "Bodyweight", goal: "Strength", difficulty: "intermediate", instructions: "Place weight plate on upper back, perform push-up with full range of motion, maintain tight core." },
    { id: "ex_13", name: "Diamond Push-Up", bodyPart: "Chest", equipment: "Bodyweight", goal: "Strength", difficulty: "intermediate", instructions: "Hands together forming a diamond shape under chest, lower while keeping elbows close to body, push up." },
    { id: "ex_14", name: "Wide-Grip Push-Up", bodyPart: "Chest", equipment: "Bodyweight", goal: "Endurance", difficulty: "beginner", instructions: "Hands wider than shoulder-width, lower chest to floor, emphasize outer chest contraction." },
    { id: "ex_15", name: "Decline Push-Up", bodyPart: "Chest", equipment: "Bodyweight", goal: "Strength", difficulty: "intermediate", instructions: "Feet elevated on bench, hands on floor, lower chest to ground, push up targeting upper chest." },
    { id: "ex_16", name: "Smith Machine Bench Press", bodyPart: "Chest", equipment: "Machine", goal: "Hypertrophy", difficulty: "beginner", instructions: "Position bench under bar, grip bar and unhook, lower to chest along fixed path, press up." },
    { id: "ex_17", name: "Machine Chest Press", bodyPart: "Chest", equipment: "Machine", goal: "Hypertrophy", difficulty: "beginner", instructions: "Sit upright, grip handles at chest level, press forward to full extension, return slowly." },
    { id: "ex_18", name: "Floor Press", bodyPart: "Chest", equipment: "Barbell", goal: "Strength", difficulty: "intermediate", instructions: "Lie on floor with knees bent, press barbell from chest to lockout, pause at bottom when triceps touch floor." },
    { id: "ex_19", name: "Svend Press", bodyPart: "Chest", equipment: "Plate", goal: "Hypertrophy", difficulty: "beginner", instructions: "Hold two plates together between palms at chest height, press straight out while squeezing plates, return." },
    { id: "ex_20", name: "Landmine Chest Press", bodyPart: "Chest", equipment: "Barbell", goal: "Strength", difficulty: "intermediate", instructions: "Anchor one end of barbell in landmine, kneel and press the other end upward and forward, squeeze chest." },
    { id: "ex_21", name: "Single-Arm Dumbbell Bench Press", bodyPart: "Chest", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "intermediate", instructions: "Lie flat holding one dumbbell, brace core to resist rotation, press up while staying stable." },
    { id: "ex_22", name: "Cable Chest Press", bodyPart: "Chest", equipment: "Cable", goal: "Hypertrophy", difficulty: "beginner", instructions: "Set pulleys at chest height, grab handles, step forward and press directly out, squeeze pecs at full extension." },
    { id: "ex_23", name: "Band-Resisted Push-Up", bodyPart: "Chest", equipment: "Band", goal: "Hypertrophy", difficulty: "intermediate", instructions: "Wrap resistance band across back and hold ends under palms, perform push-up against band tension." },
    { id: "ex_24", name: "Guillotine Press", bodyPart: "Chest", equipment: "Barbell", goal: "Hypertrophy", difficulty: "advanced", instructions: "Lower barbell to neck/throat level instead of chest, driving through upper chest on the press — use lighter weight." },
    { id: "ex_25", name: "Chest Dip", bodyPart: "Chest", equipment: "Bodyweight", goal: "Strength", difficulty: "intermediate", instructions: "On parallel bars, lean torso forward, lower until upper arms are parallel to floor, press up emphasizing chest." },

    // ── Back (ex_26 – ex_50) ──
    { id: "ex_26", name: "Deadlift", bodyPart: "Back", equipment: "Barbell", goal: "Strength", difficulty: "intermediate", instructions: "Feet hip-width, bar over mid-foot, hinge at hips, grip bar, drive through heels to standing, lock out hips and knees." },
    { id: "ex_27", name: "Pull-Up", bodyPart: "Back", equipment: "Bodyweight", goal: "Strength", difficulty: "intermediate", instructions: "Overhand grip wider than shoulders, hang fully, pull chest to bar, lower with control to full extension." },
    { id: "ex_28", name: "Chin-Up", bodyPart: "Back", equipment: "Bodyweight", goal: "Hypertrophy", difficulty: "intermediate", instructions: "Underhand grip shoulder-width, pull chin over bar, squeeze lats and biceps, lower slowly." },
    { id: "ex_29", name: "Lat Pulldown", bodyPart: "Back", equipment: "Cable", goal: "Hypertrophy", difficulty: "beginner", instructions: "Wide overhand grip on bar, lean back slightly, pull bar to upper chest, squeeze shoulder blades, return smoothly." },
    { id: "ex_30", name: "Close-Grip Lat Pulldown", bodyPart: "Back", equipment: "Cable", goal: "Hypertrophy", difficulty: "beginner", instructions: "Use V-bar attachment, pull handles to upper chest, squeeze lower lats, control the release." },
    { id: "ex_31", name: "Single-Arm Dumbbell Row", bodyPart: "Back", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "One hand and knee on bench, row dumbbell from full hang to hip, squeeze lat, lower with control." },
    { id: "ex_32", name: "Barbell Row", bodyPart: "Back", equipment: "Barbell", goal: "Strength", difficulty: "intermediate", instructions: "Hinge forward with flat back, grip bar slightly wider than shoulder-width, pull bar to lower ribcage, squeeze, lower." },
    { id: "ex_33", name: "Pendlay Row", bodyPart: "Back", equipment: "Barbell", goal: "Strength", difficulty: "advanced", instructions: "Bar starts on floor each rep, back parallel to floor, explosively pull bar to lower sternum, return bar to floor." },
    { id: "ex_34", name: "T-Bar Row", bodyPart: "Back", equipment: "Machine", goal: "Hypertrophy", difficulty: "intermediate", instructions: "Straddle the T-bar platform, grip handles, pull bar to chest while keeping back flat, squeeze, lower." },
    { id: "ex_35", name: "Seated Cable Row", bodyPart: "Back", equipment: "Cable", goal: "Hypertrophy", difficulty: "beginner", instructions: "Sit with feet braced, pull handle to abdomen, squeeze shoulder blades together, return under control." },
    { id: "ex_36", name: "Underhand Seated Row", bodyPart: "Back", equipment: "Cable", goal: "Hypertrophy", difficulty: "beginner", instructions: "Use underhand grip on V-bar, pull to lower abdomen emphasizing lower lat contraction." },
    { id: "ex_37", name: "Straight-Arm Pulldown", bodyPart: "Back", equipment: "Cable", goal: "Hypertrophy", difficulty: "beginner", instructions: "Grip straight bar overhand, arms extended, pull bar down to thighs in an arc while keeping arms straight." },
    { id: "ex_38", name: "Dumbbell Pullover", bodyPart: "Back", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "intermediate", instructions: "Lie across bench with only upper back supported, lower dumbbell behind head with slight elbow bend, pull back over chest." },
    { id: "ex_39", name: "Inverted Row", bodyPart: "Back", equipment: "Bodyweight", goal: "Hypertrophy", difficulty: "beginner", instructions: "Set barbell at waist height in rack, hang under bar with body straight, pull chest to bar, squeeze upper back." },
    { id: "ex_40", name: "Renegade Row", bodyPart: "Back", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "intermediate", instructions: "Start in plank position holding dumbbells, row one dumbbell to hip while stabilizing with the other arm, alternate." },
    { id: "ex_41", name: "Meadow Row", bodyPart: "Back", equipment: "Barbell", goal: "Hypertrophy", difficulty: "intermediate", instructions: "Anchor one end of barbell, stand sideways, row the free end with one arm, squeeze lat at peak contraction." },
    { id: "ex_42", name: "Kroc Row", bodyPart: "Back", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "advanced", instructions: "Heavy single-arm dumbbell row with some body English, focus on high-rep volume with controlled negative." },
    { id: "ex_43", name: "Rack Pull", bodyPart: "Back", equipment: "Barbell", goal: "Strength", difficulty: "advanced", instructions: "Set barbell on safety pins just below knee height, deadlift from this shortened range emphasizing upper back and traps." },
    { id: "ex_44", name: "Good Morning", bodyPart: "Back", equipment: "Barbell", goal: "Strength", difficulty: "intermediate", instructions: "Bar on upper back, soft knees, hinge forward at hips until torso is nearly parallel to floor, return to standing." },
    { id: "ex_45", name: "Hyperextension", bodyPart: "Back", equipment: "Machine", goal: "Endurance", difficulty: "beginner", instructions: "On hyperextension bench, hinge at waist and lower torso, raise back up using lower back and glutes to full extension." },
    { id: "ex_46", name: "TRX Row", bodyPart: "Back", equipment: "TRX", goal: "Hypertrophy", difficulty: "beginner", instructions: "Hold TRX handles, lean back with arms extended, pull chest to handles while keeping body straight, squeeze back." },
    { id: "ex_47", name: "Band Pull-Apart", bodyPart: "Back", equipment: "Band", goal: "Endurance", difficulty: "beginner", instructions: "Hold resistance band with arms extended in front, pull band apart until it touches chest, squeeze rear delts and rhomboids." },
    { id: "ex_48", name: "Reverse Pec Deck", bodyPart: "Back", equipment: "Machine", goal: "Hypertrophy", difficulty: "beginner", instructions: "Sit facing the pad, grip handles, pull arms backward squeezing rear delts and upper back, return slowly." },
    { id: "ex_49", name: "Snatch-Grip Deadlift", bodyPart: "Back", equipment: "Barbell", goal: "Strength", difficulty: "advanced", instructions: "Use wide snatch grip, deadlift from floor with increased range of motion, emphasizing upper back and traps." },
    { id: "ex_50", name: "Single-Arm Cable Row", bodyPart: "Back", equipment: "Cable", goal: "Hypertrophy", difficulty: "beginner", instructions: "Attach single handle to low cable, row to hip while rotating torso slightly, squeeze lat at peak." },

    // ── Legs (ex_51 – ex_75) ──
    { id: "ex_51", name: "Barbell Back Squat", bodyPart: "Legs", equipment: "Barbell", goal: "Strength", difficulty: "intermediate", instructions: "Bar on upper traps, feet shoulder-width, squat to parallel or below, knees track over toes, drive up through heels." },
    { id: "ex_52", name: "Front Squat", bodyPart: "Legs", equipment: "Barbell", goal: "Strength", difficulty: "advanced", instructions: "Bar rests on front delts, elbows high, squat down while keeping torso upright, drive up through whole foot." },
    { id: "ex_53", name: "Goblet Squat", bodyPart: "Legs", equipment: "Kettlebell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Hold kettlebell at chest with both hands, squat deep while keeping chest up, drive through heels to stand." },
    { id: "ex_54", name: "Bulgarian Split Squat", bodyPart: "Legs", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "intermediate", instructions: "Back foot elevated on bench, dumbbells at sides, lower until front thigh is parallel, drive up through front heel." },
    { id: "ex_55", name: "Walking Lunge", bodyPart: "Legs", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Dumbbells at sides, step forward into lunge, back knee nearly touches floor, push off front foot to next lunge." },
    { id: "ex_56", name: "Reverse Lunge", bodyPart: "Legs", equipment: "Bodyweight", goal: "Hypertrophy", difficulty: "beginner", instructions: "Step backward into lunge, both knees at 90°, push off back foot to return to standing, alternate legs." },
    { id: "ex_57", name: "Leg Press", bodyPart: "Legs", equipment: "Machine", goal: "Hypertrophy", difficulty: "beginner", instructions: "Feet shoulder-width on platform, lower sled until knees reach 90°, press to near-lockout without locking knees." },
    { id: "ex_58", name: "Hack Squat", bodyPart: "Legs", equipment: "Machine", goal: "Hypertrophy", difficulty: "intermediate", instructions: "Shoulders under pads, feet on platform, lower until thighs are parallel or below, press up through whole foot." },
    { id: "ex_59", name: "Romanian Deadlift", bodyPart: "Legs", equipment: "Barbell", goal: "Strength", difficulty: "intermediate", instructions: "Soft knees, barbell at hip level, hinge hips backward keeping bar close to legs, feel hamstring stretch, return." },
    { id: "ex_60", name: "Leg Extension", bodyPart: "Legs", equipment: "Machine", goal: "Hypertrophy", difficulty: "beginner", instructions: "Sit with knees aligned to machine pivot, extend legs fully squeezing quads at the top, lower with control." },
    { id: "ex_61", name: "Lying Leg Curl", bodyPart: "Legs", equipment: "Machine", goal: "Hypertrophy", difficulty: "beginner", instructions: "Lie face down with pad behind ankles, curl legs up squeezing hamstrings, lower slowly to full extension." },
    { id: "ex_62", name: "Seated Leg Curl", bodyPart: "Legs", equipment: "Machine", goal: "Hypertrophy", difficulty: "beginner", instructions: "Sit with pad on lower thighs, curl legs down squeezing hamstrings, return under control." },
    { id: "ex_63", name: "Standing Calf Raise", bodyPart: "Legs", equipment: "Machine", goal: "Hypertrophy", difficulty: "beginner", instructions: "Shoulders under pads, balls of feet on platform, rise onto toes squeezing calves, lower heels below platform for full stretch." },
    { id: "ex_64", name: "Seated Calf Raise", bodyPart: "Legs", equipment: "Machine", goal: "Hypertrophy", difficulty: "beginner", instructions: "Pad on knees, balls of feet on platform, press up onto toes targeting soleus, lower for full stretch." },
    { id: "ex_65", name: "Glute Bridge", bodyPart: "Legs", equipment: "Bodyweight", goal: "Hypertrophy", difficulty: "beginner", instructions: "Lie on back, knees bent, feet flat, drive hips up squeezing glutes at top, hold briefly, lower." },
    { id: "ex_66", name: "Barbell Hip Thrust", bodyPart: "Legs", equipment: "Barbell", goal: "Hypertrophy", difficulty: "intermediate", instructions: "Upper back on bench, barbell across hips, drive hips up until torso is parallel to floor, squeeze glutes at top." },
    { id: "ex_67", name: "Sumo Deadlift", bodyPart: "Legs", equipment: "Barbell", goal: "Strength", difficulty: "intermediate", instructions: "Wide stance, toes pointed out, grip bar inside knees, drive through heels while keeping chest up to lockout." },
    { id: "ex_68", name: "Single-Leg Press", bodyPart: "Legs", equipment: "Machine", goal: "Hypertrophy", difficulty: "intermediate", instructions: "One foot centered on platform, lower sled to 90°, press up with single leg, control the descent." },
    { id: "ex_69", name: "Step-Up", bodyPart: "Legs", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Dumbbells at sides, step onto box or bench 18-24\" high, drive through leading leg, step down and repeat." },
    { id: "ex_70", name: "Wall Sit", bodyPart: "Legs", equipment: "Bodyweight", goal: "Endurance", difficulty: "beginner", instructions: "Back flat against wall, slide down until thighs are parallel to floor, hold position for target time." },
    { id: "ex_71", name: "Sissy Squat", bodyPart: "Legs", equipment: "Bodyweight", goal: "Hypertrophy", difficulty: "advanced", instructions: "Stand on toes, knees travel forward while hips stay extended, lower until thighs are near parallel, drive back up." },
    { id: "ex_72", name: "Nordic Hamstring Curl", bodyPart: "Legs", equipment: "Bodyweight", goal: "Strength", difficulty: "advanced", instructions: "Kneel with ankles secured, slowly lower torso toward floor resisting with hamstrings, use arms to catch if needed." },
    { id: "ex_73", name: "Single-Leg Calf Raise", bodyPart: "Legs", equipment: "Bodyweight", goal: "Hypertrophy", difficulty: "beginner", instructions: "Stand on one foot on edge of step, rise onto toes squeezing calf, lower heel below platform level, repeat." },
    { id: "ex_74", name: "Pistol Squat", bodyPart: "Legs", equipment: "Bodyweight", goal: "Strength", difficulty: "advanced", instructions: "Stand on one leg, extend other leg forward, squat down as low as possible on standing leg, drive back up." },
    { id: "ex_75", name: "Lateral Lunge", bodyPart: "Legs", equipment: "Bodyweight", goal: "Mobility", difficulty: "beginner", instructions: "Step wide to the side, bend the stepping knee while keeping the other leg straight, push off to return to center." },

    // ── Shoulders (ex_76 – ex_100) ──
    { id: "ex_76", name: "Overhead Press", bodyPart: "Shoulders", equipment: "Barbell", goal: "Strength", difficulty: "intermediate", instructions: "Bar at clavicle level, grip just outside shoulders, press bar overhead to full lockout, lower under control." },
    { id: "ex_77", name: "Seated Dumbbell Press", bodyPart: "Shoulders", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Sit with back support, dumbbells at shoulder height, press up until arms are fully extended, lower slowly." },
    { id: "ex_78", name: "Arnold Press", bodyPart: "Shoulders", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "intermediate", instructions: "Start with dumbbells at chest, palms facing you, rotate palms outward while pressing overhead, reverse on descent." },
    { id: "ex_79", name: "Lateral Raise", bodyPart: "Shoulders", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Slight forward lean, arms at sides with slight elbow bend, raise dumbbells to shoulder height, lower with control." },
    { id: "ex_80", name: "Front Raise", bodyPart: "Shoulders", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Dumbbells at thighs, palms facing down, raise one or both arms to shoulder height in front, lower slowly." },
    { id: "ex_81", name: "Bent-Over Rear Delt Flye", bodyPart: "Shoulders", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Hinge forward with flat back, dumbbells hang beneath chest, raise arms out to sides squeezing rear delts, lower." },
    { id: "ex_82", name: "Upright Row", bodyPart: "Shoulders", equipment: "Barbell", goal: "Hypertrophy", difficulty: "intermediate", instructions: "Close grip on barbell, pull bar up along body to chin level with elbows leading, lower under control." },
    { id: "ex_83", name: "Machine Shoulder Press", bodyPart: "Shoulders", equipment: "Machine", goal: "Hypertrophy", difficulty: "beginner", instructions: "Sit upright, grip handles at shoulder height, press upward to full extension, return slowly." },
    { id: "ex_84", name: "Cable Lateral Raise", bodyPart: "Shoulders", equipment: "Cable", goal: "Hypertrophy", difficulty: "beginner", instructions: "Low pulley, single handle, stand sideways to machine, raise arm to side against cable resistance, squeeze at top." },
    { id: "ex_85", name: "Landmine Press", bodyPart: "Shoulders", equipment: "Barbell", goal: "Strength", difficulty: "intermediate", instructions: "Anchor barbell in landmine, kneel or stand, press the free end overhead with one or both hands, control the descent." },
    { id: "ex_86", name: "Push Press", bodyPart: "Shoulders", equipment: "Barbell", goal: "Power", difficulty: "intermediate", instructions: "Bar at clavicles, dip slightly at the knees, explosively drive up while pressing bar overhead, lock out arms." },
    { id: "ex_87", name: "Cable Rear Delt Flye", bodyPart: "Shoulders", equipment: "Cable", goal: "Hypertrophy", difficulty: "beginner", instructions: "High pulleys, cross arms to grab opposite handles, pull arms out and back squeezing rear delts, return." },
    { id: "ex_88", name: "Pike Push-Up", bodyPart: "Shoulders", equipment: "Bodyweight", goal: "Strength", difficulty: "intermediate", instructions: "Start in downward dog position, lower head toward floor by bending elbows, push back up emphasizing shoulder drive." },
    { id: "ex_89", name: "Plate Front Raise", bodyPart: "Shoulders", equipment: "Plate", goal: "Hypertrophy", difficulty: "beginner", instructions: "Hold weight plate with both hands at thighs, raise plate to shoulder height keeping arms straight, lower slowly." },
    { id: "ex_90", name: "Cuban Press", bodyPart: "Shoulders", equipment: "Dumbbell", goal: "Mobility", difficulty: "beginner", instructions: "Slight forward lean, external rotation from elbows, then press dumbbells overhead — combines rotation and press." },
    { id: "ex_91", name: "Seated Rear Delt Machine", bodyPart: "Shoulders", equipment: "Machine", goal: "Hypertrophy", difficulty: "beginner", instructions: "Sit facing the pad, grip handles with arms crossed or straight, pull back squeezing rear delts, return slowly." },
    { id: "ex_92", name: "Dumbbell Y-Raise", bodyPart: "Shoulders", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Lie face down on incline bench, arms hanging straight, raise dumbbells up and out in a Y shape, squeeze upper back." },
    { id: "ex_93", name: "Scaption Raise", bodyPart: "Shoulders", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Raise dumbbells at 30° angle from front (scapular plane), thumbs up, to shoulder height, lower with control." },
    { id: "ex_94", name: "Handstand Push-Up", bodyPart: "Shoulders", equipment: "Bodyweight", goal: "Strength", difficulty: "advanced", instructions: "Kick up to handstand against wall, lower head to floor by bending elbows, press back up to full arm extension." },
    { id: "ex_95", name: "Barbell Shrug", bodyPart: "Shoulders", equipment: "Barbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Hold barbell at hip level with overhand grip, shrug shoulders straight up toward ears, squeeze at top, lower." },
    { id: "ex_96", name: "Dumbbell Shrug", bodyPart: "Shoulders", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Dumbbells at sides, arms straight, shrug shoulders up as high as possible, hold briefly at top, lower slowly." },
    { id: "ex_97", name: "Behind-the-Back Shrug", bodyPart: "Shoulders", equipment: "Barbell", goal: "Hypertrophy", difficulty: "intermediate", instructions: "Hold barbell behind your back at hip level, shrug shoulders backward and up, squeeze traps fully." },
    { id: "ex_98", name: "Face Pull", bodyPart: "Shoulders", equipment: "Cable", goal: "Strength", difficulty: "beginner", instructions: "High pulley with rope attachment, pull rope toward face while externally rotating, squeeze rear delts and upper back." },
    { id: "ex_99", name: "Prone Y-Raise", bodyPart: "Shoulders", equipment: "Bodyweight", goal: "Endurance", difficulty: "beginner", instructions: "Lie face down, arms extended overhead in Y position, lift arms and chest off floor, squeeze upper back, lower." },
    { id: "ex_100", name: "Cable Upright Row", bodyPart: "Shoulders", equipment: "Cable", goal: "Hypertrophy", difficulty: "beginner", instructions: "Short straight bar on low pulley, pull up along body with elbows leading to chin height, lower under control." },

    // ── Arms (ex_101 – ex_125) ──
    { id: "ex_101", name: "Barbell Curl", bodyPart: "Arms", equipment: "Barbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Grip barbell shoulder-width, elbows at sides, curl bar to shoulders squeezing biceps, lower under control." },
    { id: "ex_102", name: "Dumbbell Curl", bodyPart: "Arms", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Dumbbells at sides, palms forward, curl weights up while keeping elbows fixed, squeeze at top, lower slowly." },
    { id: "ex_103", name: "Hammer Curl", bodyPart: "Arms", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Neutral grip (palms facing each other), curl dumbbells up while keeping wrists locked, squeeze brachialis, lower." },
    { id: "ex_104", name: "Preacher Curl", bodyPart: "Arms", equipment: "Barbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Arms on preacher pad, curl barbell up, squeeze biceps at top while keeping upper arms in contact with pad." },
    { id: "ex_105", name: "Concentration Curl", bodyPart: "Arms", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Seated, elbow braced against inner thigh, curl dumbbell up, squeeze bicep at peak contraction, lower slowly." },
    { id: "ex_106", name: "Incline Dumbbell Curl", bodyPart: "Arms", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Sit on incline bench (45°), arms hang straight down, curl dumbbells up for a deep bicep stretch and contraction." },
    { id: "ex_107", name: "Cable Curl", bodyPart: "Arms", equipment: "Cable", goal: "Hypertrophy", difficulty: "beginner", instructions: "Straight bar on low pulley, elbows fixed at sides, curl bar to shoulders against constant cable tension." },
    { id: "ex_108", name: "Spider Curl", bodyPart: "Arms", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "intermediate", instructions: "Lie face down on incline bench, arms hang straight, curl dumbbells up squeezing biceps against gravity." },
    { id: "ex_109", name: "Reverse Curl", bodyPart: "Arms", equipment: "Barbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Overhand grip on barbell, curl bar up while keeping wrists straight, squeeze forearms and brachialis, lower." },
    { id: "ex_110", name: "Zottman Curl", bodyPart: "Arms", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "intermediate", instructions: "Curl up with palms facing up, rotate to palms down at the top, lower with palms down (eccentric focus on forearms)." },
    { id: "ex_111", name: "Tricep Dip", bodyPart: "Arms", equipment: "Bodyweight", goal: "Hypertrophy", difficulty: "intermediate", instructions: "Hands on bench behind you, legs extended, lower body until upper arms are parallel to floor, press back up." },
    { id: "ex_112", name: "Parallel Bar Dip", bodyPart: "Arms", equipment: "Bodyweight", goal: "Strength", difficulty: "intermediate", instructions: "On parallel bars, keep torso upright, lower until upper arms are parallel, press up squeezing triceps." },
    { id: "ex_113", name: "Close-Grip Bench Press", bodyPart: "Arms", equipment: "Barbell", goal: "Strength", difficulty: "intermediate", instructions: "Grip barbell shoulder-width or narrower, lower to lower chest with elbows close to body, press up emphasizing triceps." },
    { id: "ex_114", name: "Skull Crusher", bodyPart: "Arms", equipment: "Barbell", goal: "Hypertrophy", difficulty: "intermediate", instructions: "Lie on bench, hold barbell above face, lower bar toward forehead by bending elbows, extend arms to lockout." },
    { id: "ex_115", name: "Tricep Pushdown", bodyPart: "Arms", equipment: "Cable", goal: "Hypertrophy", difficulty: "beginner", instructions: "Straight bar on high pulley, elbows fixed at sides, press bar down to full arm extension squeezing triceps, return." },
    { id: "ex_116", name: "Rope Pushdown", bodyPart: "Arms", equipment: "Cable", goal: "Hypertrophy", difficulty: "beginner", instructions: "Rope attachment on high pulley, press down and spread rope ends apart at the bottom, squeeze triceps." },
    { id: "ex_117", name: "Overhead Tricep Extension", bodyPart: "Arms", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Seated or standing, hold dumbbell overhead with both hands, lower behind head, extend arms to lockout." },
    { id: "ex_118", name: "Tricep Kickback", bodyPart: "Arms", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Hinge forward with flat back, upper arm parallel to torso, extend dumbbell backward squeezing tricep, return." },
    { id: "ex_119", name: "Diamond Push-Up", bodyPart: "Arms", equipment: "Bodyweight", goal: "Strength", difficulty: "intermediate", instructions: "Hands together under chest forming diamond, lower body while keeping elbows tight, push up focusing on triceps." },
    { id: "ex_120", name: "JM Press", bodyPart: "Arms", equipment: "Barbell", goal: "Strength", difficulty: "advanced", instructions: "Hybrid between close-grip bench and skull crusher — lower bar toward chin while keeping elbows slightly forward, press up." },
    { id: "ex_121", name: "Wrist Curl", bodyPart: "Arms", equipment: "Barbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Seated with forearms on thighs, wrists over knees, curl barbell up using only wrists, lower for full stretch." },
    { id: "ex_122", name: "Reverse Wrist Curl", bodyPart: "Arms", equipment: "Barbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Seated with forearms on thighs, overhand grip, extend wrists upward against resistance, lower slowly." },
    { id: "ex_123", name: "Pinwheel Curl", bodyPart: "Arms", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Dumbbells at sides with neutral grip, curl one dumbbell across body toward opposite shoulder, alternate sides." },
    { id: "ex_124", name: "Drag Curl", bodyPart: "Arms", equipment: "Barbell", goal: "Hypertrophy", difficulty: "intermediate", instructions: "Pull barbell up along torso keeping elbows back (no forward elbow movement), squeeze biceps at top, lower." },
    { id: "ex_125", name: "Band Tricep Pushdown", bodyPart: "Arms", equipment: "Band", goal: "Hypertrophy", difficulty: "beginner", instructions: "Anchor resistance band overhead, grip band ends, press down extending arms fully, squeeze triceps, return." },

    // ── Core (ex_126 – ex_150) ──
    { id: "ex_126", name: "Plank", bodyPart: "Core", equipment: "Bodyweight", goal: "Endurance", difficulty: "beginner", instructions: "Forearms on floor, elbows under shoulders, body forms straight line from head to heels, brace core and hold." },
    { id: "ex_127", name: "Side Plank", bodyPart: "Core", equipment: "Bodyweight", goal: "Endurance", difficulty: "beginner", instructions: "Lie on one side, stack feet, prop on forearm, lift hips until body forms straight line, hold position." },
    { id: "ex_128", name: "Dead Bug", bodyPart: "Core", equipment: "Bodyweight", goal: "Mobility", difficulty: "beginner", instructions: "Lie on back, arms extended up and knees at 90°, slowly lower opposite arm and leg while keeping back flat, return." },
    { id: "ex_129", name: "Bird Dog", bodyPart: "Core", equipment: "Bodyweight", goal: "Mobility", difficulty: "beginner", instructions: "On all fours, extend opposite arm and leg simultaneously while keeping core braced and hips level, hold briefly." },
    { id: "ex_130", name: "Hanging Leg Raise", bodyPart: "Core", equipment: "Bodyweight", goal: "Strength", difficulty: "advanced", instructions: "Hang from pull-up bar, raise legs straight until parallel to floor or higher, lower with control, no swing." },
    { id: "ex_131", name: "Hanging Knee Raise", bodyPart: "Core", equipment: "Bodyweight", goal: "Strength", difficulty: "intermediate", instructions: "Hang from bar, bring knees up toward chest while curling pelvis, squeeze lower abs, lower slowly." },
    { id: "ex_132", name: "Ab Rollout", bodyPart: "Core", equipment: "Ab Wheel", goal: "Strength", difficulty: "advanced", instructions: "Kneel holding ab wheel, roll forward keeping core tight, extend as far as possible without arching back, roll back." },
    { id: "ex_133", name: "Cable Crunch", bodyPart: "Core", equipment: "Cable", goal: "Hypertrophy", difficulty: "intermediate", instructions: "Kneel facing high pulley with rope attachment, crunch down bringing elbows toward knees, squeeze abs, return." },
    { id: "ex_134", name: "Russian Twist", bodyPart: "Core", equipment: "Bodyweight", goal: "Hypertrophy", difficulty: "beginner", instructions: "Seated with knees bent, lean back slightly, rotate torso side to side while keeping feet off ground for added challenge." },
    { id: "ex_135", name: "Bicycle Crunch", bodyPart: "Core", equipment: "Bodyweight", goal: "Endurance", difficulty: "beginner", instructions: "Lie on back, hands behind head, bring opposite elbow to knee while extending other leg in pedaling motion." },
    { id: "ex_136", name: "Lying Leg Raise", bodyPart: "Core", equipment: "Bodyweight", goal: "Hypertrophy", difficulty: "beginner", instructions: "Lie flat on back, legs straight, raise legs to 90° while keeping lower back pressed into floor, lower slowly." },
    { id: "ex_137", name: "Flutter Kick", bodyPart: "Core", equipment: "Bodyweight", goal: "Endurance", difficulty: "beginner", instructions: "Lie on back, legs extended and slightly raised, alternate kicking legs up and down in small rapid motions." },
    { id: "ex_138", name: "Scissor Kick", bodyPart: "Core", equipment: "Bodyweight", goal: "Endurance", difficulty: "beginner", instructions: "Lie on back, legs raised, cross legs over each other in scissor motion, keep core engaged and back flat." },
    { id: "ex_139", name: "Toes-To-Bar", bodyPart: "Core", equipment: "Bodyweight", goal: "Strength", difficulty: "advanced", instructions: "Hang from bar, raise toes all the way to touch the bar while keeping legs straight, lower with control." },
    { id: "ex_140", name: "V-Up", bodyPart: "Core", equipment: "Bodyweight", goal: "Strength", difficulty: "intermediate", instructions: "Lie flat, simultaneously raise upper body and legs forming V shape, touch toes if possible, lower with control." },
    { id: "ex_141", name: "Reverse Crunch", bodyPart: "Core", equipment: "Bodyweight", goal: "Hypertrophy", difficulty: "beginner", instructions: "Lie on back, knees bent, curl hips off floor toward ribcage squeezing lower abs, lower slowly." },
    { id: "ex_142", name: "Mountain Climber", bodyPart: "Core", equipment: "Bodyweight", goal: "Endurance", difficulty: "beginner", instructions: "Start in plank, drive one knee toward chest, rapidly alternate legs while keeping hips low and core engaged." },
    { id: "ex_143", name: "Swiss Ball Crunch", bodyPart: "Core", equipment: "Swiss Ball", goal: "Hypertrophy", difficulty: "beginner", instructions: "Sit on Swiss ball, walk feet forward until lower back is on ball, crunch upward squeezing upper abs, lower." },
    { id: "ex_144", name: "Pallof Press", bodyPart: "Core", equipment: "Cable", goal: "Strength", difficulty: "beginner", instructions: "Stand sideways to cable at chest height, press handle straight out resisting rotation, hold and return." },
    { id: "ex_145", name: "Woodchopper", bodyPart: "Core", equipment: "Cable", goal: "Strength", difficulty: "beginner", instructions: "Set pulley high, grip handle with both hands, pull diagonally across body in a chopping motion, return." },
    { id: "ex_146", name: "Superman Hold", bodyPart: "Core", equipment: "Bodyweight", goal: "Endurance", difficulty: "beginner", instructions: "Lie face down, arms and legs extended, simultaneously lift arms, chest, and legs off floor, squeeze lower back, hold." },
    { id: "ex_147", name: "Hollow Body Hold", bodyPart: "Core", equipment: "Bodyweight", goal: "Endurance", difficulty: "intermediate", instructions: "Lie on back, press lower back into floor, raise arms and legs slightly off ground, hold position while breathing." },
    { id: "ex_148", name: "L-Sit", bodyPart: "Core", equipment: "Bodyweight", goal: "Strength", difficulty: "advanced", instructions: "On parallel bars or floor, press down and lift legs straight out forming L-shape, hold position." },
    { id: "ex_149", name: "Dragon Flag", bodyPart: "Core", equipment: "Bodyweight", goal: "Strength", difficulty: "advanced", instructions: "Lie on bench gripping behind head, raise body in straight line from shoulders to toes, lower under control." },
    { id: "ex_150", name: "Heel Tap", bodyPart: "Core", equipment: "Bodyweight", goal: "Endurance", difficulty: "beginner", instructions: "Lie on back, knees bent, feet flat, reach side to side touching each heel alternately, keep upper back off floor." },

    // ── Cardio (ex_151 – ex_175) ──
    { id: "ex_151", name: "Treadmill Running", bodyPart: "Cardio", equipment: "Machine", goal: "Endurance", difficulty: "beginner", instructions: "Set treadmill to desired speed, maintain upright posture, land midfoot, keep steady breathing rhythm for target duration." },
    { id: "ex_152", name: "Rowing Machine", bodyPart: "Cardio", equipment: "Machine", goal: "Endurance", difficulty: "beginner", instructions: "Push with legs first, then lean back slightly, pull handle to lower chest, reverse sequence to recover." },
    { id: "ex_153", name: "Battle Ropes", bodyPart: "Cardio", equipment: "Ropes", goal: "Endurance", difficulty: "intermediate", instructions: "Athletic stance, grip rope ends, perform alternating or double-arm waves with maximal effort in 30-second intervals." },
    { id: "ex_154", name: "Jump Rope", bodyPart: "Cardio", equipment: "Jump Rope", goal: "Endurance", difficulty: "beginner", instructions: "Hold rope handles at hip height, rotate wrists to swing rope, hop slightly as rope passes under feet, maintain rhythm." },
    { id: "ex_155", name: "Stationary Cycling", bodyPart: "Cardio", equipment: "Machine", goal: "Endurance", difficulty: "beginner", instructions: "Adjust seat to hip height, maintain 80-100 RPM cadence, adjust resistance for target intensity, keep upper body stable." },
    { id: "ex_156", name: "Elliptical", bodyPart: "Cardio", equipment: "Machine", goal: "Endurance", difficulty: "beginner", instructions: "Stand upright on pedals, grip handles, move in smooth elliptical motion, maintain steady pace for target duration." },
    { id: "ex_157", name: "StairMaster", bodyPart: "Cardio", equipment: "Machine", goal: "Endurance", difficulty: "beginner", instructions: "Step onto machine, maintain upright posture without leaning on rails, climb at steady pace for target duration." },
    { id: "ex_158", name: "Sprint Intervals", bodyPart: "Cardio", equipment: "Bodyweight", goal: "Power", difficulty: "advanced", instructions: "Sprint at maximum effort for 20-30 seconds, walk or jog for 60-90 seconds recovery, repeat for 8-12 rounds." },
    { id: "ex_159", name: "High Knees", bodyPart: "Cardio", equipment: "Bodyweight", goal: "Endurance", difficulty: "beginner", instructions: "Run in place driving knees up to hip height with rapid alternating leg movement, pump arms." },
    { id: "ex_160", name: "Butt Kicks", bodyPart: "Cardio", equipment: "Bodyweight", goal: "Endurance", difficulty: "beginner", instructions: "Jog in place kicking heels up toward glutes with each stride, maintain quick pace while pumping arms." },
    { id: "ex_161", name: "Burpees", bodyPart: "Cardio", equipment: "Bodyweight", goal: "Endurance", difficulty: "intermediate", instructions: "From standing, squat down, kick feet back to plank, do a push-up, jump feet forward, explosively jump up reaching overhead." },
    { id: "ex_162", name: "Jumping Jacks", bodyPart: "Cardio", equipment: "Bodyweight", goal: "Endurance", difficulty: "beginner", instructions: "Stand with feet together and arms at sides, jump spreading legs while raising arms overhead, return to start." },
    { id: "ex_163", name: "Box Jump", bodyPart: "Cardio", equipment: "Box", goal: "Power", difficulty: "intermediate", instructions: "Stand facing box, dip slightly, explode upward landing softly on box with both feet, step down and reset." },
    { id: "ex_164", name: "Skater Hops", bodyPart: "Cardio", equipment: "Bodyweight", goal: "Endurance", difficulty: "beginner", instructions: "Jump laterally to one side landing on outside foot, swing other leg behind, immediately hop to other side." },
    { id: "ex_165", name: "Tuck Jumps", bodyPart: "Cardio", equipment: "Bodyweight", goal: "Power", difficulty: "intermediate", instructions: "Stand with feet hip-width, jump up explosively while tucking knees toward chest, land softly and immediately repeat." },
    { id: "ex_166", name: "Swimming Laps", bodyPart: "Cardio", equipment: "Other", goal: "Endurance", difficulty: "intermediate", instructions: "Swim freestyle or breaststroke at a steady pace, focus on bilateral breathing, maintain consistent stroke rate." },
    { id: "ex_167", name: "Incline Walking", bodyPart: "Cardio", equipment: "Machine", goal: "Endurance", difficulty: "beginner", instructions: "Set treadmill incline to 8-15%, walk at brisk pace (4-6 km/h) without holding rails, maintain upright posture." },
    { id: "ex_168", name: "Shadow Boxing", bodyPart: "Cardio", equipment: "Bodyweight", goal: "Endurance", difficulty: "beginner", instructions: "Boxing stance, throw jab-cross-hook combinations while moving, keep light on feet for 2-3 minute rounds." },
    { id: "ex_169", name: "Assault Bike", bodyPart: "Cardio", equipment: "Machine", goal: "Endurance", difficulty: "intermediate", instructions: "Pedal with arms and legs, use full-body effort, maintain target RPM for interval or steady-state sessions." },
    { id: "ex_170", name: "Long Distance Run", bodyPart: "Cardio", equipment: "Bodyweight", goal: "Endurance", difficulty: "intermediate", instructions: "Run at a conversational pace for extended duration (5+ km), focus on consistent breathing and efficient stride." },
    { id: "ex_171", name: "Hill Sprints", bodyPart: "Cardio", equipment: "Bodyweight", goal: "Power", difficulty: "advanced", instructions: "Find a moderate to steep hill, sprint up at max effort for 10-15 seconds, walk down to recover, repeat." },
    { id: "ex_172", name: "Jump Squats", bodyPart: "Cardio", equipment: "Bodyweight", goal: "Power", difficulty: "intermediate", instructions: "Squat down, explosively jump up reaching for the ceiling, land softly back into squat position and immediately repeat." },
    { id: "ex_173", name: "Speed Skaters", bodyPart: "Cardio", equipment: "Bodyweight", goal: "Endurance", difficulty: "beginner", instructions: "Large lateral bounds from side to side, landing on one foot while reaching opposite hand toward floor, maintain speed." },
    { id: "ex_174", name: "Lateral Shuffle", bodyPart: "Cardio", equipment: "Bodyweight", goal: "Endurance", difficulty: "beginner", instructions: "Athletic stance, shuffle sideways without crossing feet, stay low, cover 5-10 meters each direction rapidly." },
    { id: "ex_175", name: "Plank Jacks", bodyPart: "Cardio", equipment: "Bodyweight", goal: "Endurance", difficulty: "beginner", instructions: "Start in plank position, jump feet apart and together like a horizontal jumping jack while keeping core tight." },

    // ── Full Body (ex_176 – ex_200) ──
    { id: "ex_176", name: "Turkish Get-Up", bodyPart: "Full Body", equipment: "Kettlebell", goal: "Mobility", difficulty: "advanced", instructions: "Lie on back holding kettlebell overhead, progress through stages to standing while keeping weight locked out, reverse the movement." },
    { id: "ex_177", name: "Kettlebell Swing", bodyPart: "Full Body", equipment: "Kettlebell", goal: "Power", difficulty: "intermediate", instructions: "Hinge at hips, swing kettlebell between legs, explosively drive hips forward swinging bell to chest height, let it float back." },
    { id: "ex_178", name: "Clean and Jerk", bodyPart: "Full Body", equipment: "Barbell", goal: "Power", difficulty: "advanced", instructions: "Pull barbell from floor to shoulders (clean), then dip and drive barbell overhead (jerk), lock out arms." },
    { id: "ex_179", name: "Barbell Snatch", bodyPart: "Full Body", equipment: "Barbell", goal: "Power", difficulty: "advanced", instructions: "Wide grip, pull barbell from floor to overhead in one explosive motion, catch in overhead squat position, stand." },
    { id: "ex_180", name: "Dumbbell Snatch", bodyPart: "Full Body", equipment: "Dumbbell", goal: "Power", difficulty: "intermediate", instructions: "Start with dumbbell between feet, explosively pull upward and catch overhead in one motion, stand up fully." },
    { id: "ex_181", name: "Power Clean", bodyPart: "Full Body", equipment: "Barbell", goal: "Power", difficulty: "intermediate", instructions: "Pull barbell from floor, catch it at shoulder height in a quarter-squat position, stand up to finish." },
    { id: "ex_182", name: "Thruster", bodyPart: "Full Body", equipment: "Barbell", goal: "Power", difficulty: "intermediate", instructions: "Barbell at front rack, squat down, drive up and press bar overhead in one continuous explosive movement." },
    { id: "ex_183", name: "Burpee Over Barbell", bodyPart: "Full Body", equipment: "Barbell", goal: "Endurance", difficulty: "intermediate", instructions: "Perform burpee beside barbell, then lateral jump over bar, repeat from other side alternating directions." },
    { id: "ex_184", name: "Farmer's Walk", bodyPart: "Full Body", equipment: "Dumbbell", goal: "Strength", difficulty: "beginner", instructions: "Hold heavy dumbbells or kettlebells at sides, walk forward with upright posture and engaged core for time or distance." },
    { id: "ex_185", name: "Bear Crawl", bodyPart: "Full Body", equipment: "Bodyweight", goal: "Mobility", difficulty: "beginner", instructions: "On all fours with knees slightly off floor, crawl forward using opposite arm and leg, keep hips low and core tight." },
    { id: "ex_186", name: "Inchworm", bodyPart: "Full Body", equipment: "Bodyweight", goal: "Mobility", difficulty: "beginner", instructions: "From standing, reach down, walk hands forward to plank position, walk feet forward to meet hands, stand up and repeat." },
    { id: "ex_187", name: "Kettlebell Clean", bodyPart: "Full Body", equipment: "Kettlebell", goal: "Power", difficulty: "intermediate", instructions: "Start with kettlebell between feet, drive through hips to pull bell up, catch in rack position at shoulder, stand tall." },
    { id: "ex_188", name: "Dumbbell Thruster", bodyPart: "Full Body", equipment: "Dumbbell", goal: "Power", difficulty: "intermediate", instructions: "Dumbbells at shoulders, squat down, explode up while pressing dumbbells overhead to full lockout." },
    { id: "ex_189", name: "Man Maker", bodyPart: "Full Body", equipment: "Dumbbell", goal: "Endurance", difficulty: "advanced", instructions: "From standing, drop to renegade row (each arm), jump feet forward, clean dumbbells and thruster overhead — one rep." },
    { id: "ex_190", name: "Devil Press", bodyPart: "Full Body", equipment: "Dumbbell", goal: "Endurance", difficulty: "advanced", instructions: "Start with dumbbells on floor, burpee down, jump feet in, snatch or clean and press both dumbbells overhead." },
    { id: "ex_191", name: "Sandbag Carry", bodyPart: "Full Body", equipment: "Other", goal: "Strength", difficulty: "intermediate", instructions: "Lift sandbag onto shoulders or bear-hug, walk for distance with upright posture, bracing core throughout." },
    { id: "ex_192", name: "Sled Push", bodyPart: "Full Body", equipment: "Other", goal: "Power", difficulty: "intermediate", instructions: "Lean into sled with arms extended, drive forward with powerful leg drive, keep body at 45° angle, push for distance." },
    { id: "ex_193", name: "Sled Pull", bodyPart: "Full Body", equipment: "Other", goal: "Strength", difficulty: "intermediate", instructions: "Grip sled straps or rope, walk backward pulling sled, maintain upright posture and steady pace for target distance." },
    { id: "ex_194", name: "Medicine Ball Slam", bodyPart: "Full Body", equipment: "Medicine Ball", goal: "Power", difficulty: "beginner", instructions: "Hold medicine ball overhead, explosively slam it to the floor while squatting down, catch on bounce and repeat." },
    { id: "ex_195", name: "Medicine Ball Overhead Throw", bodyPart: "Full Body", equipment: "Medicine Ball", goal: "Power", difficulty: "intermediate", instructions: "Hold ball overhead, take one step forward and throw ball forcefully against wall or to partner, catch and repeat." },
    { id: "ex_196", name: "Box Jump Over", bodyPart: "Full Body", equipment: "Box", goal: "Power", difficulty: "intermediate", instructions: "Jump onto box with both feet, step or jump off the other side, turn around and repeat in opposite direction." },
    { id: "ex_197", name: "Burpee Box Jump", bodyPart: "Full Body", equipment: "Box", goal: "Power", difficulty: "advanced", instructions: "Perform burpee in front of box, then explosively jump onto box with both feet, step down and repeat." },
    { id: "ex_198", name: "Double Kettlebell Clean and Press", bodyPart: "Full Body", equipment: "Kettlebell", goal: "Power", difficulty: "advanced", instructions: "Clean two kettlebells to rack position simultaneously, then press both overhead to lockout, lower with control." },
    { id: "ex_199", name: "Tire Flip", bodyPart: "Full Body", equipment: "Other", goal: "Power", difficulty: "advanced", instructions: "Squat down gripping bottom of tire, drive through legs and hips to lift and push tire over, repeat for distance." },
    { id: "ex_200", name: "Wall Ball", bodyPart: "Full Body", equipment: "Medicine Ball", goal: "Endurance", difficulty: "intermediate", instructions: "Hold ball at chest, squat down, explode up throwing ball to target on wall, catch and immediately squat again." },
  ];

  listExercises(filters?: { search?: string; bodyPart?: string; equipment?: string }) {
    const search = filters?.search?.trim().toLowerCase();
    const bodyPart = filters?.bodyPart?.trim();
    const equipment = filters?.equipment?.trim();

    return this.EXERCISE_LIBRARY.filter(ex => {
      const searchMatch = !search || ex.name.toLowerCase().includes(search) || ex.instructions.toLowerCase().includes(search);
      const bodyMatch = !bodyPart || bodyPart === "all" || ex.bodyPart.toLowerCase() === bodyPart.toLowerCase();
      const equipMatch = !equipment || equipment === "all" || ex.equipment.toLowerCase() === equipment.toLowerCase();
      return searchMatch && bodyMatch && equipMatch;
    });
  }

  // ── Recipe Library ─────────────────────────────────────────────────
  private readonly RECIPE_LIBRARY: Array<{ id: string; name: string; ingredients: string[]; steps: string[]; calories: number; proteinG: number; carbsG: number; fatG: number; prepTime: number; cookTime: number; tags: string[] }> = [
    {
      id: "rec_1", name: "High-Protein Overnight Oats", tags: ["breakfast", "meal-prep"],
      ingredients: ["80g rolled oats", "150g Greek yoghurt", "1 scoop whey protein (30g)", "150ml almond milk", "50g mixed berries", "1 tsp honey"],
      steps: ["Mix oats, yoghurt, protein powder, and milk in a jar.", "Refrigerate overnight (or at least 4 hours).", "Top with berries and honey before serving."],
      calories: 520, proteinG: 42, carbsG: 55, fatG: 12, prepTime: 5, cookTime: 0
    },
    {
      id: "rec_2", name: "Grilled Chicken & Sweet Potato Bowl", tags: ["lunch", "dinner", "high-protein"],
      ingredients: ["180g chicken breast", "200g sweet potato", "100g broccoli", "1 tbsp olive oil", "Salt, pepper, paprika"],
      steps: ["Season chicken with paprika, salt, pepper.", "Bake chicken at 200°C for 20–25 min.", "Cube sweet potato and roast alongside chicken.", "Steam broccoli, drizzle with olive oil."],
      calories: 480, proteinG: 48, carbsG: 42, fatG: 12, prepTime: 10, cookTime: 30
    },
    {
      id: "rec_3", name: "Salmon with Quinoa & Greens", tags: ["dinner", "omega-3", "high-protein"],
      ingredients: ["160g salmon fillet", "80g quinoa", "100g spinach", "1 tbsp olive oil", "Lemon wedge", "Salt & pepper"],
      steps: ["Rinse quinoa and cook in 2x volume water for 15 min.", "Pan-sear salmon skin-side down 4 min per side.", "Wilt spinach in same pan with olive oil.", "Serve quinoa with salmon and greens, squeeze lemon."],
      calories: 580, proteinG: 45, carbsG: 38, fatG: 28, prepTime: 5, cookTime: 20
    },
    {
      id: "rec_4", name: "Turkey Mince & Brown Rice Stir-Fry", tags: ["lunch", "dinner", "high-protein"],
      ingredients: ["150g turkey mince", "100g cooked brown rice", "100g mixed peppers", "50g edamame", "1 tbsp soy sauce", "1 tsp sesame oil"],
      steps: ["Brown turkey mince in a hot pan.", "Add sliced peppers and stir-fry 3 min.", "Add rice and edamame, season with soy sauce.", "Finish with sesame oil."],
      calories: 450, proteinG: 40, carbsG: 40, fatG: 12, prepTime: 10, cookTime: 15
    },
    {
      id: "rec_5", name: "Protein Pancakes", tags: ["breakfast", "high-protein"],
      ingredients: ["80g oats blended", "1 scoop vanilla protein powder (30g)", "1 whole egg + 2 whites", "100ml almond milk", "1 tsp baking powder"],
      steps: ["Blend all ingredients into a smooth batter.", "Cook on medium heat with light oil spray.", "Flip when bubbles appear, cook 2 min per side."],
      calories: 420, proteinG: 38, carbsG: 45, fatG: 8, prepTime: 5, cookTime: 10
    },
    {
      id: "rec_6", name: "Greek Yoghurt & Avocado Power Bowl", tags: ["breakfast", "snack"],
      ingredients: ["200g Greek yoghurt", "Half avocado", "30g granola", "50g banana slices", "1 tsp chia seeds"],
      steps: ["Spoon yoghurt into a bowl.", "Slice avocado and layer on top.", "Add granola, banana, and chia seeds."],
      calories: 460, proteinG: 28, carbsG: 42, fatG: 20, prepTime: 5, cookTime: 0
    },
    {
      id: "rec_7", name: "Cottage Cheese & Fruit Snack Plate", tags: ["snack", "high-protein"],
      ingredients: ["200g cottage cheese", "1 small apple", "20g almonds", "Cinnamon"],
      steps: ["Spoon cottage cheese into a bowl.", "Slice apple, dust with cinnamon.", "Serve with almonds."],
      calories: 320, proteinG: 28, carbsG: 25, fatG: 12, prepTime: 3, cookTime: 0
    },
    {
      id: "rec_8", name: "Egg White Omelette with Veg", tags: ["breakfast", "low-fat"],
      ingredients: ["6 egg whites", "50g spinach", "50g mushrooms", "30g feta cheese", "Salt, pepper, herbs"],
      steps: ["Whisk egg whites with salt and pepper.", "Pour into non-stick pan over medium heat.", "Add spinach, mushrooms, and feta.", "Fold and serve when set."],
      calories: 180, proteinG: 24, carbsG: 5, fatG: 6, prepTime: 5, cookTime: 8
    },
    {
      id: "rec_9", name: "Chicken & Quinoa Meal Prep Boxes", tags: ["meal-prep", "lunch", "high-protein"],
      ingredients: ["160g chicken breast", "80g quinoa", "80g roasted vegetables", "100g mixed leaf", "1 tbsp tahini dressing"],
      steps: ["Cook quinoa (2:1 water, 15 min).", "Grill chicken with herbs.", "Roast vegetables at 200°C for 20 min.", "Divide into containers with leafy greens. Drizzle tahini."],
      calories: 520, proteinG: 50, carbsG: 40, fatG: 15, prepTime: 15, cookTime: 25
    },
    {
      id: "rec_10", name: "Protein Shake Smoothie", tags: ["post-workout", "snack"],
      ingredients: ["1 scoop whey protein (30g)", "250ml semi-skimmed milk", "1 banana", "30g oats", "1 tbsp peanut butter"],
      steps: ["Add all ingredients to a blender.", "Blend until smooth.", "Drink within 30 minutes of training."],
      calories: 450, proteinG: 38, carbsG: 50, fatG: 12, prepTime: 3, cookTime: 0
    },
  ];

  suggestRecipe(foodName?: string) {
    if (!foodName) return this.RECIPE_LIBRARY[0];

    const foodLower = foodName.toLowerCase();
    // Match by food name or tags
    const scored = this.RECIPE_LIBRARY.map(recipe => {
      const nameMatch = recipe.name.toLowerCase().includes(foodLower) ? 3 : 0;
      const tagMatch = recipe.tags.some(tag => foodLower.includes(tag) || tag.includes(foodLower)) ? 2 : 0;
      const ingredientMatch = recipe.ingredients.some(ing => foodLower.includes(ing.split(" ")[1] ?? "") || ing.toLowerCase().includes(foodLower)) ? 1 : 0;
      return { recipe, score: nameMatch + tagMatch + ingredientMatch };
    }).sort((a, b) => b.score - a.score);

    return scored[0]?.recipe ?? this.RECIPE_LIBRARY[0];
  }

  // ── Habit Tracking ─────────────────────────────────────────────────
  listHabits(clientId?: string): Habit[] {
    if (!this.state.habits) this.state.habits = [];
    if (!clientId) return this.state.habits;
    return this.state.habits.filter(h => h.clientId === clientId);
  }

  async createHabit(payload: { clientId: string; title: string; target: number; frequency: "daily" | "weekly" }): Promise<{ success: true; habit: Habit } | { success: false; issues: unknown[] }> {
    if (!this.state.habits) this.state.habits = [];
    const habit: Habit = {
      id: `habit_${Date.now()}`,
      clientId: payload.clientId,
      title: payload.title,
      target: payload.target,
      frequency: payload.frequency,
      createdAt: new Date().toISOString()
    };
    this.state.habits = [...this.state.habits, habit];
    await this.commit();
    return { success: true, habit };
  }

  async toggleHabitCompletion(habitId: string, date: string): Promise<{ success: true; completion: HabitCompletion }> {
    if (!this.state.habitCompletions) this.state.habitCompletions = [];
    const existing = this.state.habitCompletions.find(hc => hc.habitId === habitId && hc.date === date);
    if (existing) {
      this.state.habitCompletions = this.state.habitCompletions.map(hc =>
        hc.id === existing.id ? { ...hc, completed: !hc.completed } : hc
      );
      const updated = this.state.habitCompletions.find(hc => hc.id === existing.id)!;
      await this.commit();
      return { success: true, completion: updated };
    } else {
      const completion: HabitCompletion = {
        id: `hc_${Date.now()}`,
        habitId,
        date,
        completed: true
      };
      this.state.habitCompletions = [...this.state.habitCompletions, completion];
      await this.commit();
      return { success: true, completion };
    }
  }

  getHabitSummary(clientId: string) {
    const today = new Date().toISOString().slice(0, 10);
    const habits = this.listHabits(clientId);
    if (!this.state.habitCompletions) this.state.habitCompletions = [];

    return habits.map(habit => {
      const completions = this.state.habitCompletions!.filter(hc => hc.habitId === habit.id && hc.completed);

      // Streak: consecutive days backwards from today
      let streak = 0;
      const date = new Date(today);
      while (true) {
        const dateStr = date.toISOString().slice(0, 10);
        const hasCompletion = this.state.habitCompletions!.some(hc => hc.habitId === habit.id && hc.date === dateStr && hc.completed);
        if (!hasCompletion) break;
        streak++;
        date.setDate(date.getDate() - 1);
      }

      const todayDone = this.state.habitCompletions!.some(hc => hc.habitId === habit.id && hc.date === today && hc.completed);

      return { habit, streak, todayDone, totalCompletions: completions.length };
    });
  }
}

export function summarizeAnalytics(events: AnalyticsEvent[]) {
  const counts = events.reduce<Record<string, number>>((acc, event) => {
    acc[event.name] = (acc[event.name] ?? 0) + 1;
    return acc;
  }, {});

  return {
    totalEvents: events.length,
    topEvents: Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count })),
    lastEventAt: events.at(-1)?.occurredAt ?? null
  };
}
