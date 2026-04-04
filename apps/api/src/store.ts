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
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { createMockServiceAdapters, type DemoServiceAdapters } from "./services";

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
        monthly_price_gbp numeric not null,
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
        amount_gbp numeric not null,
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
          monthlyPriceGbp: Number(row.monthly_price_gbp),
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
          amountGbp: Number(row.amount_gbp),
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
              (id, workspace_id, full_name, email, goal, status, adherence_score, current_plan_id, monthly_price_gbp, next_renewal_date, last_checkin_date)
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
            client.monthlyPriceGbp,
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
              (id, client_id, status, amount_gbp, renewal_date)
            values ($1, $2, $3, $4, $5)
          `,
          [subscription.id, subscription.clientId, subscription.status, subscription.amountGbp, subscription.renewalDate]
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
  private state: DemoState;

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

  getState() {
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
          monthlyPriceGbp: row.data!.monthlyPriceGbp,
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
            amountGbp: updated.monthlyPriceGbp,
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
    { id: "ex_1", name: "Barbell Bench Press", bodyPart: "Chest", equipment: "Barbell", goal: "Strength", difficulty: "intermediate", instructions: "Lie flat on bench, lower bar to mid-chest, press up to full extension." },
    { id: "ex_2", name: "Deadlift", bodyPart: "Back", equipment: "Barbell", goal: "Strength", difficulty: "intermediate", instructions: "Hip-hinge, bar close to shins, drive through heels to stand." },
    { id: "ex_3", name: "Barbell Back Squat", bodyPart: "Legs", equipment: "Barbell", goal: "Hypertrophy", difficulty: "intermediate", instructions: "Bar on traps, squat to parallel or below, knees track toes." },
    { id: "ex_4", name: "Romanian Deadlift", bodyPart: "Legs", equipment: "Barbell", goal: "Strength", difficulty: "intermediate", instructions: "Slight knee bend, hinge at hips, feel hamstring stretch." },
    { id: "ex_5", name: "Overhead Press", bodyPart: "Shoulders", equipment: "Barbell", goal: "Strength", difficulty: "intermediate", instructions: "Bar at clavicles, press overhead to lockout, engage core." },
    { id: "ex_6", name: "Pull-Up", bodyPart: "Back", equipment: "Bodyweight", goal: "Strength", difficulty: "intermediate", instructions: "Hang with overhand grip, pull chest to bar, lower with control." },
    { id: "ex_7", name: "Dumbbell Row", bodyPart: "Back", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "One hand on bench, row dumbbell to hip, squeeze lat." },
    { id: "ex_8", name: "Leg Press", bodyPart: "Legs", equipment: "Machine", goal: "Hypertrophy", difficulty: "beginner", instructions: "Feet shoulder-width on platform, lower to 90°, press to near-lockout." },
    { id: "ex_9", name: "Romanian Push-Up", bodyPart: "Chest", equipment: "Bodyweight", goal: "Hypertrophy", difficulty: "beginner", instructions: "Push-up with hips raised high throughout — emphasize upper chest." },
    { id: "ex_10", name: "Lateral Raise", bodyPart: "Shoulders", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Slight elbow bend, raise arms to shoulder height." },
    { id: "ex_11", name: "Bicep Curl", bodyPart: "Arms", equipment: "Dumbbell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Curl from full extension to top contraction, squeeze at top." },
    { id: "ex_12", name: "Tricep Dip", bodyPart: "Arms", equipment: "Bodyweight", goal: "Hypertrophy", difficulty: "intermediate", instructions: "Hands on bench, lower until upper arms parallel to floor." },
    { id: "ex_13", name: "Plank", bodyPart: "Core", equipment: "Bodyweight", goal: "Endurance", difficulty: "beginner", instructions: "Forearms on floor, body straight line from head to heels, hold." },
    { id: "ex_14", name: "Russian Twist", bodyPart: "Core", equipment: "Bodyweight", goal: "Hypertrophy", difficulty: "beginner", instructions: "Seated, lean back slightly, rotate torso side to side." },
    { id: "ex_15", name: "Battle Ropes", bodyPart: "Cardio", equipment: "Ropes", goal: "Endurance", difficulty: "intermediate", instructions: "Alternate or double-arm waves — 30-sec intervals." },
    { id: "ex_16", name: "Rowing Machine", bodyPart: "Cardio", equipment: "Machine", goal: "Endurance", difficulty: "beginner", instructions: "Push with legs, then lean back, then pull handle to lower chest." },
    { id: "ex_17", name: "Box Jump", bodyPart: "Legs", equipment: "Bodyweight", goal: "Power", difficulty: "intermediate", instructions: "Slight squat, jump onto box, step down, reset." },
    { id: "ex_18", name: "Turkish Get-Up", bodyPart: "Core", equipment: "Kettlebell", goal: "Mobility", difficulty: "advanced", instructions: "From lying to standing while pressing kettlebell overhead." },
    { id: "ex_19", name: "Goblet Squat", bodyPart: "Legs", equipment: "Kettlebell", goal: "Hypertrophy", difficulty: "beginner", instructions: "Hold kettlebell at chest, squat deep, keep chest upright." },
    { id: "ex_20", name: "Face Pull", bodyPart: "Shoulders", equipment: "Cable", goal: "Strength", difficulty: "beginner", instructions: "High cable attachment, pull rope to face level, squeeze rear delts." },
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
