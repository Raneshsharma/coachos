import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";
import { createServiceAdapters } from "./services";

describe("CoachOS config", () => {
  it("loads defaults for local development", () => {
    const config = loadConfig({});

    expect(config.storageMode).toBe("json");
    expect(config.aiProvider).toBe("mock");
    expect(config.billingProvider).toBe("mock");
    expect(config.port).toBe(4000);
  });

  it("creates simulated adapters from env config", () => {
    const config = loadConfig({
      COACHOS_AI_PROVIDER: "simulated-openai",
      COACHOS_BILLING_PROVIDER: "simulated-stripe",
      COACHOS_PROOF_PROVIDER: "simulated-proof",
      COACHOS_STORAGE_MODE: "postgres_relational",
      OPENAI_MODEL: "gpt-5-mini",
      STRIPE_MODE: "test"
    });
    const adapters = createServiceAdapters(config);

    expect(adapters.planGeneration.name).toBe("simulated-openai:gpt-5-mini");
    expect(adapters.billing.name).toBe("simulated-stripe:test");
    expect(adapters.proofCards.name).toBe("simulated-proof-engine");
    expect(config.storageMode).toBe("postgres_relational");
  });
});
