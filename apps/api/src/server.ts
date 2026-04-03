import { createApp } from "./app";
import { createPersistentStore } from "./bootstrap";
import { loadConfig } from "./config";

const config = loadConfig();

async function main() {
  const store = await createPersistentStore(process.env);
  const app = createApp(store);

  app.listen(config.port, () => {
    console.log(`CoachOS API running on http://localhost:${config.port}`);
  });
}

void main();
