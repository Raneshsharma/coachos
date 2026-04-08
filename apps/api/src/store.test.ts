import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSeedState } from "@coachos/domain";
import { DemoStore, InMemoryDemoStateRepository, JsonFileDemoStateRepository } from "./store";
import type { DemoServiceAdapters } from "./services";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

function createTempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coachos-api-"));
  tempDirs.push(dir);
  return path.join(dir, "state.json");
}

describe("DemoStore persistence", () => {
  it("seeds a file-backed store when no state file exists", async () => {
    const filePath = createTempFile();
    const store = await DemoStore.create(new JsonFileDemoStateRepository(filePath));

    expect(fs.existsSync(filePath)).toBe(true);
    expect(store.getCoachSession().clients.length).toBeGreaterThan(0);
  });

  it("persists imports and billing changes across store recreation", async () => {
    const filePath = createTempFile();
    const repository = new JsonFileDemoStateRepository(filePath);
    const firstStore = await DemoStore.create(repository);

    await firstStore.commitImport([
      { name: "Persisted Client", email: "persisted@example.com", goal: "Keep state across restarts", monthlyPriceGbp: 199 }
    ]);
    await firstStore.updateBilling("client_2", "active");

    const secondStore = await DemoStore.create(new JsonFileDemoStateRepository(filePath));
    const state = secondStore.getState();

    expect(state.clients.some((client) => client.email === "persisted@example.com")).toBe(true);
    expect(state.subscriptions.find((subscription) => subscription.clientId === "client_2")?.status).toBe("active");
  });

  it("uses injected service adapters for plan generation and billing", async () => {
    const state = createSeedState();
    const adapters: DemoServiceAdapters = {
      planGeneration: {
        name: "test-planner",
        generateDraft(client, coachId) {
          return {
            id: `custom_${client.id}`,
            clientId: client.id,
            coachId,
            title: "Custom generated plan",
            latestVersion: {
              id: `custom_${client.id}_v1`,
              planId: `custom_${client.id}`,
              versionNumber: 1,
              status: "draft",
              explanation: ["Injected plan provider was used."],
              workouts: ["Custom workout block"],
              nutrition: ["Custom nutrition block"],
              updatedAt: "2026-04-03T09:00:00.000Z"
            }
          };
        }
      },
      proofCards: {
        name: "test-proof",
        build(client) {
          return {
            clientId: client.id,
            headline: "Injected proof",
            body: "Provider-driven proof card",
            stats: [{ label: "Injected", value: "Yes" }]
          };
        }
      },
      billing: {
        name: "test-billing",
        createImportedSubscription(client) {
          return {
            id: `billing_${client.id}`,
            clientId: client.id,
            status: "trialing",
            amountGbp: client.monthlyPriceGbp + 1,
            renewalDate: client.nextRenewalDate
          };
        },
        applyWebhookUpdate(subscriptions, clientId, status) {
          return subscriptions.map((subscription) =>
            subscription.clientId === clientId ? { ...subscription, status } : subscription
          );
        },
        summarize(subscriptions) {
          return {
            subscriptions,
            mrrGbp: 999,
            churnRiskCount: 7
          };
        }
      }
    };

    const store = await DemoStore.create(new InMemoryDemoStateRepository(state), adapters);
    const generated = await store.generatePlan("client_3");
    const billing = store.getBillingSummary();

    expect(generated?.title).toBe("Custom generated plan");
    expect(store.getRuntimeInfo().services.planGeneration).toBe("test-planner");
    expect(billing.mrrGbp).toBe(999);
  });
});

describe("DemoStore client notes", () => {
  it("creates a client note and returns it", async () => {
    const store = await DemoStore.create();

    const note = await store.createClientNote("client_1", "Progressing well this week.");

    expect(note.clientId).toBe("client_1");
    expect(note.content).toBe("Progressing well this week.");
    expect(note.id).toMatch(/^note_/);
    expect(note.createdAt).toBeDefined();
  });

  it("lists notes for a client sorted by createdAt descending", async () => {
    const store = await DemoStore.create();

    const note1 = await store.createClientNote("client_1", "First note");
    await new Promise((r) => setTimeout(r, 10));
    const note2 = await store.createClientNote("client_1", "Second note");
    await store.createClientNote("client_2", "Different client note");

    const notes = store.listClientNotes("client_1");

    expect(notes).toHaveLength(2);
    expect(new Date(notes[0].createdAt).getTime()).toBeGreaterThanOrEqual(new Date(notes[1].createdAt).getTime());
    expect(notes.every((n) => n.clientId === "client_1")).toBe(true);
  });

  it("returns empty array for client with no notes", async () => {
    const store = await DemoStore.create();

    const notes = store.listClientNotes("client_1");

    expect(notes).toEqual([]);
  });

  it("deletes an existing note and returns true", async () => {
    const store = await DemoStore.create();

    const note = await store.createClientNote("client_1", "Note to delete");
    const ok = await store.deleteClientNote("client_1", note.id);

    expect(ok).toBe(true);
    expect(store.listClientNotes("client_1").some((n) => n.id === note.id)).toBe(false);
  });

  it("returns false when deleting a non-existent note", async () => {
    const store = await DemoStore.create();

    const ok = await store.deleteClientNote("client_1", "nonexistent_note_id");

    expect(ok).toBe(false);
  });

  it("returns false when deleting a note belonging to a different client", async () => {
    const store = await DemoStore.create();

    const note = await store.createClientNote("client_1", "client_1 note");
    const ok = await store.deleteClientNote("client_2", note.id);

    expect(ok).toBe(false);
    expect(store.listClientNotes("client_1").some((n) => n.id === note.id)).toBe(true);
  });
});

describe("DemoStore body metrics", () => {
  it("saves a body metric with all fields", async () => {
    const store = await DemoStore.create();

    const metric = await store.saveBodyMetric("client_1", {
      date: "2026-04-05",
      weightKg: 72.4,
      bodyFatPct: 18.5,
      waistCm: 80.0
    });

    expect(metric.clientId).toBe("client_1");
    expect(metric.date).toBe("2026-04-05");
    expect(metric.weightKg).toBe(72.4);
    expect(metric.bodyFatPct).toBe(18.5);
    expect(metric.waistCm).toBe(80.0);
    expect(metric.id).toMatch(/^metric_/);
  });

  it("saves a body metric with only required date", async () => {
    const store = await DemoStore.create();

    const metric = await store.saveBodyMetric("client_1", { date: "2026-04-05" });

    expect(metric.date).toBe("2026-04-05");
    expect(metric.weightKg).toBeNull();
    expect(metric.bodyFatPct).toBeNull();
    expect(metric.waistCm).toBeNull();
  });

  it("lists metrics for a client sorted by date descending", async () => {
    const store = await DemoStore.create();

    await store.saveBodyMetric("client_1", { date: "2026-03-01", weightKg: 76.0 });
    await store.saveBodyMetric("client_1", { date: "2026-04-01", weightKg: 74.0 });
    await store.saveBodyMetric("client_1", { date: "2026-04-05", weightKg: 73.0 });

    const metrics = store.listBodyMetrics("client_1");

    expect(metrics).toHaveLength(3);
    expect(metrics[0].date).toBe("2026-04-05");
    expect(metrics[1].date).toBe("2026-04-01");
    expect(metrics[2].date).toBe("2026-03-01");
  });

  it("returns empty array for client with no metrics", async () => {
    const store = await DemoStore.create();

    const metrics = store.listBodyMetrics("client_1");

    expect(metrics).toEqual([]);
  });

  it("does not return metrics for other clients", async () => {
    const store = await DemoStore.create();

    await store.saveBodyMetric("client_1", { date: "2026-04-01", weightKg: 74.0 });
    await store.saveBodyMetric("client_2", { date: "2026-04-01", weightKg: 92.0 });

    const metrics = store.listBodyMetrics("client_1");

    expect(metrics).toHaveLength(1);
    expect(metrics[0].clientId).toBe("client_1");
  });
});

describe("DemoStore session booking", () => {
  it("creates a virtual session and returns it", async () => {
    const store = await DemoStore.create();

    const session = await store.createSession("client_1", {
      date: "2026-04-15T10:00:00Z",
      duration: 60,
      type: "virtual"
    });

    expect(session.clientId).toBe("client_1");
    expect(session.date).toBe("2026-04-15T10:00:00Z");
    expect(session.duration).toBe(60);
    expect(session.type).toBe("virtual");
    expect(session.notes).toBeNull();
    expect(session.id).toMatch(/^session_/);
    expect(session.createdAt).toBeDefined();
  });

  it("creates an in-person session with notes", async () => {
    const store = await DemoStore.create();

    const session = await store.createSession("client_1", {
      date: "2026-04-16T14:00:00Z",
      duration: 90,
      type: "in-person",
      notes: "Focus on squat form."
    });

    expect(session.type).toBe("in-person");
    expect(session.notes).toBe("Focus on squat form.");
  });

  it("creates multiple sessions for the same client", async () => {
    const store = await DemoStore.create();

    const session1 = await store.createSession("client_1", { date: "2026-04-15T10:00:00Z", duration: 60, type: "virtual" });
    const session2 = await store.createSession("client_1", { date: "2026-04-22T10:00:00Z", duration: 60, type: "in-person" });

    expect(session1.id).not.toBe(session2.id);
    expect(session1.clientId).toBe("client_1");
    expect(session2.clientId).toBe("client_1");
  });
});
