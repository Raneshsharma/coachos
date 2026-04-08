import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { DemoStore } from "./store";

describe("CoachOS API", () => {
  it("imports clients and reflects them in the coach session", async () => {
    const app = createApp(await DemoStore.create());

    const commitResponse = await request(app)
      .post("/api/import/commit")
      .send({
        rows: [
          { name: "Emma Walker", email: "emma@example.com", goal: "Drop 6kg before wedding", monthlyPriceGbp: 179 }
        ]
      });

    expect(commitResponse.status).toBe(200);
    expect(commitResponse.body.importedCount).toBe(1);

    const sessionResponse = await request(app).get("/api/session/coach");
    expect(sessionResponse.status).toBe(200);
    expect(sessionResponse.body.clients.some((client: { email: string }) => client.email === "emma@example.com")).toBe(true);
  });

  it("generates and approves plans with coach review preserved", async () => {
    const app = createApp(await DemoStore.create());

    const generated = await request(app).post("/api/plans/generate").send({ clientId: "client_3" });
    expect(generated.status).toBe(200);
    expect(generated.body.latestVersion.status).toBe("draft");

    const approved = await request(app).post(`/api/plans/${generated.body.id}/approve`).send();
    expect(approved.status).toBe(200);
    expect(approved.body.latestVersion.status).toBe("approved");
  });

  it("updates dashboard state after a client check-in", async () => {
    const app = createApp(await DemoStore.create());

    const response = await request(app)
      .post("/api/check-ins")
      .send({
        id: "checkin_new",
        clientId: "client_3",
        submittedAt: "2026-04-03T09:00:00.000Z",
        progress: {
          weightKg: 68.4,
          energyScore: 8,
          steps: 9000,
          waistCm: 84,
          adherenceScore: null,
          notes: "Back on track."
        },
        photoCount: 1
      });

    expect(response.status).toBe(200);
    expect(response.body.dashboard.atRiskClients.some((alert: { clientId: string }) => alert.clientId === "client_3")).toBe(false);
  });

  it("tracks billing recovery and exposes analytics summary", async () => {
    const app = createApp(await DemoStore.create());

    const billing = await request(app)
      .post("/api/billing/webhooks/stripe")
      .send({ clientId: "client_2", status: "active" });

    expect(billing.status).toBe(200);

    const analytics = await request(app).get("/api/analytics");
    expect(analytics.status).toBe(200);
    expect(analytics.body.summary.totalEvents).toBeGreaterThan(0);
    expect(Array.isArray(analytics.body.summary.topEvents)).toBe(true);
  });

  it("supports filtered aggregate queries for clients, plans, and check-ins", async () => {
    const app = createApp(await DemoStore.create());

    const clients = await request(app).get("/api/clients").query({ status: "at_risk", search: "Liam" });
    expect(clients.status).toBe(200);
    expect(clients.body).toHaveLength(1);
    expect(clients.body[0].fullName).toContain("Liam");

    const plans = await request(app).get("/api/plans").query({ status: "draft" });
    expect(plans.status).toBe(200);
    expect(plans.body.every((plan: { latestVersion: { status: string } }) => plan.latestVersion.status === "draft")).toBe(true);

    const checkIns = await request(app).get("/api/check-ins").query({ clientId: "client_1" });
    expect(checkIns.status).toBe(200);
    expect(checkIns.body.every((checkIn: { clientId: string }) => checkIn.clientId === "client_1")).toBe(true);
  });

  it("supports partial client updates and keeps billing fields in sync", async () => {
    const app = createApp(await DemoStore.create());

    const updated = await request(app)
      .patch("/api/clients/client_1")
      .send({
        goal: "Cut 5kg while keeping squat strength",
        status: "at_risk",
        monthlyPriceGbp: 219,
        nextRenewalDate: "2026-04-21"
      });

    expect(updated.status).toBe(200);
    expect(updated.body.goal).toContain("squat strength");
    expect(updated.body.monthlyPriceGbp).toBe(219);

    const billing = await request(app).get("/api/billing");
    const subscription = billing.body.subscriptions.find((item: { clientId: string }) => item.clientId === "client_1");
    expect(subscription.amountGbp).toBe(219);
    expect(subscription.renewalDate).toBe("2026-04-21");
  });

  it("exposes active runtime adapters for storage and service boundaries", async () => {
    const app = createApp(await DemoStore.create());

    const response = await request(app).get("/api/runtime");

    expect(response.status).toBe(200);
    expect(response.body.storage).toBe("InMemoryDemoStateRepository");
    expect(response.body.services.planGeneration).toBe("mock-openai");
    expect(response.body.services.billing).toBe("mock-stripe");
  });

  it("supports export, restore, and reset for migration safety", async () => {
    const app = createApp(await DemoStore.create());

    await request(app)
      .post("/api/import/commit")
      .send({
        rows: [
          { name: "Restore Target", email: "restore@example.com", goal: "Validate rollback flow", monthlyPriceGbp: 169 }
        ]
      });

    const exported = await request(app).get("/api/export");
    expect(exported.status).toBe(200);
    expect(exported.body.data.clients.some((client: { email: string }) => client.email === "restore@example.com")).toBe(true);

    const reset = await request(app).post("/api/admin/state/reset").send();
    expect(reset.status).toBe(200);
    expect(reset.body.session.clients.some((client: { email: string }) => client.email === "restore@example.com")).toBe(false);

    const restored = await request(app).post("/api/admin/state/import").send(exported.body);
    expect(restored.status).toBe(200);
    expect(restored.body.state.clients.some((client: { email: string }) => client.email === "restore@example.com")).toBe(true);
  });
});
