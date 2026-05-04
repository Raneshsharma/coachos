import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { DemoStore } from "./store";

describe("POST /api/clients", () => {
  it("creates a new client with valid payload and returns 201", async () => {
    const app = createApp(await DemoStore.create());

    const res = await request(app).post("/api/clients").send({
      workspaceId: "ws_uk_1",
      fullName: "Jamie Lee",
      email: "jamie@example.com",
      goal: "Build strength and lose 5kg",
      status: "active",
      adherenceScore: 70,
      currentPlanId: null,
      monthlyPriceGbp: 149,
      nextRenewalDate: "2026-05-01",
      lastCheckInDate: null
    });

    expect(res.status).toBe(201);
    expect(res.body.fullName).toBe("Jamie Lee");
    expect(res.body.email).toBe("jamie@example.com");
    expect(res.body.id).toMatch(/^client_/);
  });

  it("creates a new client from the web add-client form payload", async () => {
    const app = createApp(await DemoStore.create());

    const res = await request(app).post("/api/clients").send({
      fullName: "Taylor Morgan",
      email: "taylor@example.com",
      goal: "Build consistency for the next 12 weeks",
      status: "trialing",
      monthlyPriceGbp: 179,
      nextRenewalDate: ""
    });

    expect(res.status).toBe(201);
    expect(res.body.workspaceId).toBe("ws_uk_1");
    expect(res.body.status).toBe("trial");
    expect(res.body.adherenceScore).toBe(60);
    expect(res.body.currentPlanId).toBeNull();
    expect(res.body.lastCheckInDate).toBeNull();

    const billing = await request(app).get("/api/billing");
    const subscription = billing.body.subscriptions.find((item: { clientId: string }) => item.clientId === res.body.id);
    expect(subscription.amountGbp).toBe(179);
  });

  it("returns 400 for missing required fields", async () => {
    const app = createApp(await DemoStore.create());

    const res = await request(app).post("/api/clients").send({
      fullName: "Missing Fields Client"
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Invalid client payload");
  });

  it("returns 400 for invalid email format", async () => {
    const app = createApp(await DemoStore.create());

    const res = await request(app).post("/api/clients").send({
      fullName: "Bad Email Client",
      email: "not-an-email",
      goal: "Test goal",
      status: "active",
      adherenceScore: 70,
      currentPlanId: null,
      monthlyPriceGbp: 149,
      nextRenewalDate: "2026-05-01",
      lastCheckInDate: null
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Invalid client payload");
  });
});

describe("Feature API coverage", () => {
  it("returns exercise and recipe library data in the shapes used by the web app", async () => {
    const app = createApp(await DemoStore.create());

    const exercises = await request(app).get("/api/exercises").query({ bodyPart: "Back" });
    expect(exercises.status).toBe(200);
    expect(exercises.body.length).toBeGreaterThan(0);
    expect(exercises.body.every((item: { bodyPart: string }) => item.bodyPart === "Back")).toBe(true);

    const recipes = await request(app).get("/api/recipes").query({ search: "chicken" });
    expect(recipes.status).toBe(200);
    expect(Array.isArray(recipes.body)).toBe(true);
    expect(recipes.body.some((item: { name: string }) => item.name.toLowerCase().includes("chicken"))).toBe(true);

    const suggested = await request(app).get("/api/recipes").query({ food: "oats" });
    expect(suggested.status).toBe(200);
    expect(suggested.body.name).toContain("Oats");
  });

  it("updates plan blocks through PATCH and returns habit summaries", async () => {
    const app = createApp(await DemoStore.create());

    const planPatch = await request(app)
      .patch("/api/plans/plan_1")
      .send({ workouts: ["Updated workout block"], nutrition: ["Updated nutrition block"] });

    expect(planPatch.status).toBe(200);
    expect(planPatch.body.latestVersion.workouts).toEqual(["Updated workout block"]);
    expect(planPatch.body.latestVersion.nutrition).toEqual(["Updated nutrition block"]);

    const habit = await request(app).post("/api/habits").send({
      clientId: "client_1",
      title: "Drink water",
      target: 3,
      frequency: "daily"
    });
    await request(app).post(`/api/habits/${habit.body.id}/complete`).send({ date: new Date().toISOString().slice(0, 10) });

    const summary = await request(app).get("/api/habits/summary").query({ clientId: "client_1" });
    expect(summary.status).toBe(200);
    const habitSummary = summary.body.find((item: { habit: { id: string } }) => item.habit.id === habit.body.id);
    expect(habitSummary.todayDone).toBe(true);
  });

  it("accepts check-in photo uploads as a safe no-op for now", async () => {
    const app = createApp(await DemoStore.create());

    const response = await request(app)
      .post("/api/check-ins/checkin_1/photo")
      .attach("photo", Buffer.from("fake image"), "photo.jpg");

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });
});

describe("GET /api/clients/:clientId/notes", () => {
  it("returns 404 for unknown client", async () => {
    const app = createApp(await DemoStore.create());

    const res = await request(app).get("/api/clients/unknown_client/notes");

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Client not found.");
  });

  it("returns an empty array when no notes exist for a valid client", async () => {
    const app = createApp(await DemoStore.create());

    const res = await request(app).get("/api/clients/client_1/notes");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns notes for a client after creating them", async () => {
    const app = createApp(await DemoStore.create());

    await request(app).post("/api/clients/client_1/notes").send({ content: "First note for client 1" });
    await request(app).post("/api/clients/client_1/notes").send({ content: "Second note for client 1" });

    const res = await request(app).get("/api/clients/client_1/notes");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.every((n: { clientId: string }) => n.clientId === "client_1")).toBe(true);
  });
});

describe("POST /api/clients/:clientId/notes", () => {
  it("creates a note for a valid client and returns 201", async () => {
    const app = createApp(await DemoStore.create());

    const res = await request(app).post("/api/clients/client_1/notes").send({ content: "Client is progressing well on nutrition." });

    expect(res.status).toBe(201);
    expect(res.body.content).toBe("Client is progressing well on nutrition.");
    expect(res.body.clientId).toBe("client_1");
    expect(res.body.id).toMatch(/^note_/);
    expect(res.body.createdAt).toBeDefined();
  });

  it("returns 404 for unknown client", async () => {
    const app = createApp(await DemoStore.create());

    const res = await request(app).post("/api/clients/unknown_client/notes").send({ content: "Some note" });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Client not found.");
  });

  it("returns 400 when content is missing or empty", async () => {
    const app = createApp(await DemoStore.create());

    const res = await request(app).post("/api/clients/client_1/notes").send({ content: "" });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("content is required");
  });
});

describe("DELETE /api/clients/:clientId/notes/:noteId", () => {
  it("deletes an existing note and returns ok", async () => {
    const app = createApp(await DemoStore.create());

    const createRes = await request(app).post("/api/clients/client_1/notes").send({ content: "Note to be deleted" });
    const noteId = createRes.body.id;

    const deleteRes = await request(app).delete(`/api/clients/client_1/notes/${noteId}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.ok).toBe(true);

    const listRes = await request(app).get("/api/clients/client_1/notes");
    expect(listRes.body.some((n: { id: string }) => n.id === noteId)).toBe(false);
  });

  it("returns 404 when note does not exist", async () => {
    const app = createApp(await DemoStore.create());

    const res = await request(app).delete("/api/clients/client_1/notes/fake_note_id");

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Note not found.");
  });

  it("returns 404 when client does not exist", async () => {
    const app = createApp(await DemoStore.create());

    const res = await request(app).delete("/api/clients/unknown_client/notes/some_note");

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Note not found.");
  });
});

describe("GET /api/clients/:clientId/metrics", () => {
  it("returns 404 for unknown client", async () => {
    const app = createApp(await DemoStore.create());

    const res = await request(app).get("/api/clients/unknown_client/metrics");

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Client not found.");
  });

  it("returns an empty array when no metrics exist", async () => {
    const app = createApp(await DemoStore.create());

    const res = await request(app).get("/api/clients/client_1/metrics");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns metrics sorted by date descending", async () => {
    const app = createApp(await DemoStore.create());

    await request(app).post("/api/clients/client_1/metrics").send({ date: "2026-03-01", weightKg: 75.0 });
    await request(app).post("/api/clients/client_1/metrics").send({ date: "2026-04-01", weightKg: 73.5 });

    const res = await request(app).get("/api/clients/client_1/metrics");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].date).toBe("2026-04-01");
    expect(res.body[1].date).toBe("2026-03-01");
  });
});

describe("POST /api/clients/:clientId/metrics", () => {
  it("saves a body metric with all fields and returns 201", async () => {
    const app = createApp(await DemoStore.create());

    const res = await request(app).post("/api/clients/client_1/metrics").send({
      date: "2026-04-05",
      weightKg: 72.4,
      bodyFatPct: 18.5,
      waistCm: 80.0
    });

    expect(res.status).toBe(201);
    expect(res.body.date).toBe("2026-04-05");
    expect(res.body.weightKg).toBe(72.4);
    expect(res.body.bodyFatPct).toBe(18.5);
    expect(res.body.waistCm).toBe(80.0);
    expect(res.body.clientId).toBe("client_1");
    expect(res.body.id).toMatch(/^metric_/);
  });

  it("saves a body metric with only required fields", async () => {
    const app = createApp(await DemoStore.create());

    const res = await request(app).post("/api/clients/client_1/metrics").send({ date: "2026-04-05" });

    expect(res.status).toBe(201);
    expect(res.body.date).toBe("2026-04-05");
    expect(res.body.weightKg).toBeNull();
    expect(res.body.bodyFatPct).toBeNull();
    expect(res.body.waistCm).toBeNull();
  });

  it("returns 404 for unknown client", async () => {
    const app = createApp(await DemoStore.create());

    const res = await request(app).post("/api/clients/unknown_client/metrics").send({ date: "2026-04-05" });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Client not found.");
  });

  it("returns 400 when date is missing", async () => {
    const app = createApp(await DemoStore.create());

    const res = await request(app).post("/api/clients/client_1/metrics").send({ weightKg: 72.4 });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("date is required");
  });
});

describe("POST /api/clients/:clientId/sessions", () => {
  it("creates a virtual session and returns 201", async () => {
    const app = createApp(await DemoStore.create());

    const res = await request(app).post("/api/clients/client_1/sessions").send({
      date: "2026-04-15T10:00:00Z",
      duration: 60,
      type: "virtual"
    });

    expect(res.status).toBe(201);
    expect(res.body.date).toBe("2026-04-15T10:00:00Z");
    expect(res.body.duration).toBe(60);
    expect(res.body.type).toBe("virtual");
    expect(res.body.clientId).toBe("client_1");
    expect(res.body.id).toMatch(/^session_/);
  });

  it("creates an in-person session with notes and returns 201", async () => {
    const app = createApp(await DemoStore.create());

    const res = await request(app).post("/api/clients/client_1/sessions").send({
      date: "2026-04-16T14:00:00Z",
      duration: 90,
      type: "in-person",
      notes: "Focus on squat form and progressive overload."
    });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe("in-person");
    expect(res.body.notes).toBe("Focus on squat form and progressive overload.");
  });

  it("returns 404 for unknown client", async () => {
    const app = createApp(await DemoStore.create());

    const res = await request(app).post("/api/clients/unknown_client/sessions").send({
      date: "2026-04-15T10:00:00Z",
      duration: 60,
      type: "virtual"
    });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Client not found.");
  });

  it("returns 400 when date is missing", async () => {
    const app = createApp(await DemoStore.create());

    const res = await request(app).post("/api/clients/client_1/sessions").send({
      duration: 60,
      type: "virtual"
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("date is required");
  });

  it("returns 400 when duration is not a positive number", async () => {
    const app = createApp(await DemoStore.create());

    const res = await request(app).post("/api/clients/client_1/sessions").send({
      date: "2026-04-15T10:00:00Z",
      duration: -10,
      type: "virtual"
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("duration must be a positive number");
  });

  it("returns 400 when type is invalid", async () => {
    const app = createApp(await DemoStore.create());

    const res = await request(app).post("/api/clients/client_1/sessions").send({
      date: "2026-04-15T10:00:00Z",
      duration: 60,
      type: "phone"
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("type must be 'virtual' or 'in-person'");
  });
});
