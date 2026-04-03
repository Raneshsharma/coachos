import { loadConfig } from "./config";
import {
  DemoStore,
  JsonFileDemoStateRepository,
  PostgresDemoStateRepository,
  PostgresRelationalDemoStateRepository
} from "./store";
import { createServiceAdapters } from "./services";

export async function createPersistentStore(env: NodeJS.ProcessEnv = process.env) {
  const config = loadConfig(env);
  const repository =
    config.storageMode === "postgres_snapshot"
      ? new PostgresDemoStateRepository(
          config.databaseUrl ?? "postgresql://coachos:coachos@localhost:5432/coachos"
        )
      : config.storageMode === "postgres_relational"
        ? new PostgresRelationalDemoStateRepository(
            config.databaseUrl ?? "postgresql://coachos:coachos@localhost:5432/coachos"
          )
      : new JsonFileDemoStateRepository(config.stateFilePath);

  return DemoStore.create(repository, createServiceAdapters(config));
}
