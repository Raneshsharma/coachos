import {
  createDraftPlan,
  createProofCard,
  type ClientProfile,
  type CheckIn,
  type PaymentSubscription,
  type ProgramPlan,
  type ProofCard
} from "@coachos/domain";
import type { CoachOsConfig } from "./config";

export interface PlanGenerationProvider {
  readonly name: string;
  generateDraft(client: ClientProfile, coachId: string): Promise<ProgramPlan> | ProgramPlan;
}

export interface ProofCardProvider {
  readonly name: string;
  build(client: ClientProfile, latestCheckIn?: CheckIn): ProofCard;
}

export interface BillingProvider {
  readonly name: string;
  createImportedSubscription(client: ClientProfile): PaymentSubscription;
  applyWebhookUpdate(
    subscriptions: PaymentSubscription[],
    clientId: string,
    status: "active" | "past_due" | "cancelled"
  ): PaymentSubscription[];
  summarize(subscriptions: PaymentSubscription[]): {
    subscriptions: PaymentSubscription[];
    mrrGbp: number;
    churnRiskCount: number;
  };
}

export class MockPlanGenerationProvider implements PlanGenerationProvider {
  readonly name = "mock-openai";

  generateDraft(client: ClientProfile, coachId: string) {
    return createDraftPlan(client, coachId);
  }
}

export class SimulatedOpenAIPlanGenerationProvider implements PlanGenerationProvider {
  readonly name: string;

  constructor(private readonly model: string) {
    this.name = `simulated-openai:${model}`;
  }

  generateDraft(client: ClientProfile, coachId: string) {
    const draft = createDraftPlan(client, coachId);
    return {
      ...draft,
      latestVersion: {
        ...draft.latestVersion,
        explanation: [
          `Simulated OpenAI provider using model ${this.model}.`,
          ...draft.latestVersion.explanation
        ]
      }
    };
  }
}

export class MockProofCardProvider implements ProofCardProvider {
  readonly name = "mock-proof-engine";

  build(client: ClientProfile, latestCheckIn?: CheckIn) {
    return createProofCard(client, latestCheckIn);
  }
}

export class SimulatedProofCardProvider implements ProofCardProvider {
  readonly name = "simulated-proof-engine";

  build(client: ClientProfile, latestCheckIn?: CheckIn) {
    const proof = createProofCard(client, latestCheckIn);
    return {
      ...proof,
      headline: `${proof.headline} [Simulated share-ready card]`
    };
  }
}

export class MockBillingProvider implements BillingProvider {
  readonly name = "mock-stripe";

  createImportedSubscription(client: ClientProfile): PaymentSubscription {
    return {
      id: `sub_${client.id}`,
      clientId: client.id,
      status: "trialing",
      amountGbp: client.monthlyPriceGbp,
      renewalDate: client.nextRenewalDate
    };
  }

  applyWebhookUpdate(
    subscriptions: PaymentSubscription[],
    clientId: string,
    status: "active" | "past_due" | "cancelled"
  ) {
    return subscriptions.map((subscription) =>
      subscription.clientId === clientId ? { ...subscription, status } : subscription
    );
  }

  summarize(subscriptions: PaymentSubscription[]) {
    return {
      subscriptions,
      mrrGbp: subscriptions
        .filter((subscription) => subscription.status === "active")
        .reduce((sum, subscription) => sum + subscription.amountGbp, 0),
      churnRiskCount: subscriptions.filter((subscription) => subscription.status === "past_due").length
    };
  }
}

export class SimulatedStripeBillingProvider implements BillingProvider {
  readonly name: string;

  constructor(private readonly mode: "test" | "live") {
    this.name = `simulated-stripe:${mode}`;
  }

  createImportedSubscription(client: ClientProfile): PaymentSubscription {
    return {
      id: `sim_sub_${client.id}`,
      clientId: client.id,
      status: "trialing",
      amountGbp: client.monthlyPriceGbp,
      renewalDate: client.nextRenewalDate
    };
  }

  applyWebhookUpdate(
    subscriptions: PaymentSubscription[],
    clientId: string,
    status: "active" | "past_due" | "cancelled"
  ) {
    return subscriptions.map((subscription) =>
      subscription.clientId === clientId ? { ...subscription, status } : subscription
    );
  }

  summarize(subscriptions: PaymentSubscription[]) {
    return {
      subscriptions,
      mrrGbp: subscriptions
        .filter((subscription) => subscription.status === "active")
        .reduce((sum, subscription) => sum + subscription.amountGbp, 0),
      churnRiskCount: subscriptions.filter((subscription) => subscription.status === "past_due").length
    };
  }
}

export type DemoServiceAdapters = {
  planGeneration: PlanGenerationProvider;
  proofCards: ProofCardProvider;
  billing: BillingProvider;
};

export function createMockServiceAdapters(): DemoServiceAdapters {
  return {
    planGeneration: new MockPlanGenerationProvider(),
    proofCards: new MockProofCardProvider(),
    billing: new MockBillingProvider()
  };
}

export function createServiceAdapters(config: CoachOsConfig): DemoServiceAdapters {
  const aiProvider = process.env.COACHOS_AI_PROVIDER ?? config.aiProvider;

  let planGeneration: PlanGenerationProvider;
  if (aiProvider === "simulated-openai") {
    planGeneration = new SimulatedOpenAIPlanGenerationProvider(config.openAiModel);
  } else {
    planGeneration = new MockPlanGenerationProvider();
  }

  return {
    planGeneration,
    proofCards:
      config.proofProvider === "simulated-proof"
        ? new SimulatedProofCardProvider()
        : new MockProofCardProvider(),
    billing:
      config.billingProvider === "simulated-stripe"
        ? new SimulatedStripeBillingProvider(config.stripeMode)
        : new MockBillingProvider()
  };
}
