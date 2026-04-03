import {
  approvePlan,
  analyticsEventSchema,
  checkInSchema,
  clientProfilePatchSchema,
  clientProfileSchema,
  createSeedState,
  demoStateSchema,
  previewImport,
  summarizeMorningDashboard,
  type AnalyticsEvent,
  type DemoState
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
