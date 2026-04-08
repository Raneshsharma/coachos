import http from "node:http";
import { createApp } from "./app";
import { createPersistentStore } from "./bootstrap";

let app: ReturnType<typeof createApp>;

/**
 * Cloudflare Workers / Vercel deployment entry point.
 * Exports a default fetch handler that bridges the Fetch API to Express.
 *
 * For production Cloudflare Workers, install `serverless-http` and replace:
 *   import serverless from "serverless-http";
 *   const handle = serverless(app);
 *   export default handle;
 */
export default {
  async fetch(request: Request): Promise<Response> {
    if (!app) {
      app = createApp(await createPersistentStore(process.env as never));
    }

    return new Promise((resolve) => {
      const chunks: Buffer[] = [];

      // Build a minimal http.IncomingMessage from the Fetch Request
      const url = new URL(request.url);
      const incomingHeaders = new http.IncomingMessage({} as never);
      incomingHeaders.method = request.method;
      incomingHeaders.url = request.url;
      incomingHeaders.headers = {};
      request.headers.forEach((value, key) => {
        incomingHeaders.headers[key] = value;
      });

      const response = new http.ServerResponse(incomingHeaders);
      response.statusCode = 200;
      response.statusMessage = "OK";
      (response as unknown as Record<string, unknown>).headers = {};

      const originalSetHeader = response.setHeader.bind(response);
      response.setHeader = (name: string, value: string | string[]) => {
        ((response as unknown as Record<string, unknown>).headers as Record<string, string>)[name.toLowerCase()] =
          Array.isArray(value) ? value.join(", ") : String(value);
        return originalSetHeader(name, value) as typeof response;
      };

      response.writeHead = ((statusCode: number, statusMessage?: string) => {
        response.statusCode = statusCode;
        response.statusMessage = statusMessage ?? "";
        return response;
      }) as typeof response.writeHead;

      response.end = ((chunk?: string | Buffer) => {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        resolve(new Response(
          chunks.length ? Buffer.concat(chunks) : undefined,
          {
            status: response.statusCode,
            statusText: response.statusMessage,
            headers: new Headers(((response as unknown as Record<string, unknown>).headers as Record<string, string>))
          }
        ));
        return response;
      }) as typeof response.end;

      app(incomingHeaders as never, response as never);
    });
  }
};
