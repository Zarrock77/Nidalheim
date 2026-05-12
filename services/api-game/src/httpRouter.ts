import type { IncomingMessage, ServerResponse } from "http";
import { authenticateBearerRequest } from "./auth.js";
import type { AuthenticatedUser } from "./types.js";

export type HttpMethod = "GET" | "POST";

export interface HttpContext {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
  params: Record<string, string>;
  user?: AuthenticatedUser;
}

export type HttpHandler = (context: HttpContext) => Promise<void> | void;

interface Route {
  method: HttpMethod;
  path: string;
  regex: RegExp;
  keys: string[];
  requiresAuth: boolean;
  handler: HttpHandler;
}

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string = "http_error",
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export class HttpRouter {
  private readonly routes: Route[] = [];

  get(path: string, handler: HttpHandler, options: { auth?: boolean } = {}): void {
    this.add("GET", path, handler, options);
  }

  post(path: string, handler: HttpHandler, options: { auth?: boolean } = {}): void {
    this.add("POST", path, handler, options);
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const method = request.method?.toUpperCase() as HttpMethod | undefined;
    const route = this.routes.find((candidate) => {
      return candidate.method === method && candidate.regex.test(url.pathname);
    });

    if (!route) {
      return false;
    }

    const match = route.regex.exec(url.pathname);
    const params: Record<string, string> = {};
    if (match) {
      route.keys.forEach((key, index) => {
        params[key] = decodeURIComponent(match[index + 1] ?? "");
      });
    }

    try {
      const context: HttpContext = { request, response, url, params };
      if (route.requiresAuth) {
        const auth = authenticateBearerRequest(request);
        if (!auth.ok || !auth.user) {
          sendJson(response, 401, { error: auth.error ?? "Unauthorized" });
          return true;
        }
        context.user = auth.user;
      }

      await route.handler(context);
    } catch (err) {
      if (response.headersSent) {
        response.end();
        return true;
      }

      if (err instanceof HttpError) {
        sendJson(response, err.statusCode, {
          error: err.message,
          code: err.code,
          details: err.details,
        });
        return true;
      }

      console.error("[http] unhandled route error:", err);
      sendJson(response, 500, { error: "Internal Server Error" });
    }

    return true;
  }

  private add(method: HttpMethod, path: string, handler: HttpHandler, options: { auth?: boolean }): void {
    const { regex, keys } = compilePath(path);
    this.routes.push({
      method,
      path,
      regex,
      keys,
      requiresAuth: options.auth === true,
      handler,
    });
  }
}

export function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload).toString(),
    ...headers,
  });
  response.end(payload);
}

export async function readJsonBody(request: IncomingMessage, maxBytes = 1_000_000): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxBytes) {
      throw new HttpError(413, "Request body too large", "body_too_large");
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new HttpError(400, "Invalid JSON body", "invalid_json");
  }
}

function compilePath(path: string): { regex: RegExp; keys: string[] } {
  const keys: string[] = [];
  const segments = path.split("/").map((segment) => {
    if (!segment) return "";
    if (segment.startsWith(":")) {
      keys.push(segment.slice(1));
      return "([^/]+)";
    }
    return escapeRegExp(segment);
  });

  return {
    regex: new RegExp(`^${segments.join("/")}$`),
    keys,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
