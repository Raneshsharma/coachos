import { loadConfig } from "./config";
import {
  DemoStore,
  InMemoryDemoStateRepository,
  JsonFileDemoStateRepository,
  PostgresDemoStateRepository,
  PostgresRelationalDemoStateRepository
} from "./store";
import { createServiceAdapters } from "./services";

export async function createPersistentStore(env: NodeJS.ProcessEnv = process.env) {
  const config = loadConfig(env);

  // In production/serverless (e.g. Vercel), the filesystem is read-only.
  // Fall back to in-memory storage unless a DATABASE_URL is explicitly set.
  const isServerless = config.nodeEnv === "production" && !config.databaseUrl &&
    config.storageMode === "json";

  const repository =
    config.storageMode === "postgres_snapshot" && config.databaseUrl
      ? new PostgresDemoStateRepository(config.databaseUrl)
      : config.storageMode === "postgres_relational" && config.databaseUrl
        ? new PostgresRelationalDemoStateRepository(config.databaseUrl)
        : isServerless
          ? new InMemoryDemoStateRepository()
          : new JsonFileDemoStateRepository(config.stateFilePath);

  return DemoStore.create(repository, createServiceAdapters(config));
}
