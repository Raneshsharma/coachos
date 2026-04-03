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
