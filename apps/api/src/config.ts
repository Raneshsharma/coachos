import { z } from "zod";
import { getDefaultStateFilePath } from "./store";

const configSchema = z.object({
  nodeEnv: z.enum(["development", "test", "production"]).default("development"),
  port: z.coerce.number().int().positive().default(4000),
  storageMode: z.enum(["json", "postgres_snapshot", "postgres_relational"]).default("json"),
  stateFilePath: z.string().default(getDefaultStateFilePath()),
  databaseUrl: z.string().optional(),
  aiProvider: z.enum(["mock", "simulated-openai"]).default("mock"),
  billingProvider: z.enum(["mock", "simulated-stripe"]).default("mock"),
  proofProvider: z.enum(["mock", "simulated-proof"]).default("mock"),
  openAiModel: z.string().default("gpt-4.1-mini"),
  stripeMode: z.enum(["test", "live"]).default("test")
});

export type CoachOsConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CoachOsConfig {
  return configSchema.parse({
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    storageMode: env.COACHOS_STORAGE_MODE,
    stateFilePath: env.COACHOS_STATE_FILE,
    databaseUrl: env.DATABASE_URL,
    aiProvider: env.COACHOS_AI_PROVIDER,
    billingProvider: env.COACHOS_BILLING_PROVIDER,
    proofProvider: env.COACHOS_PROOF_PROVIDER,
    openAiModel: env.OPENAI_MODEL,
    stripeMode: env.STRIPE_MODE
  });
}
