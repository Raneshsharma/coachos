import { createApp } from "../apps/api/src/app";
import { createPersistentStore } from "../apps/api/src/bootstrap";

export default async function handler(req: any, res: any) {
  // Initialize store (this will happen on every request or more likely 
  // reused if the lambda is warm). 
  // For production, the user MUST set DATABASE_URL in Vercel environment variables.
  const store = await createPersistentStore(process.env);
  const app = createApp(store);
  
  // Pass to express app
  return app(req, res);
}
