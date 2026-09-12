import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

// Do not enable remote tracing for private local documents.
process.env.LANGSMITH_TRACING = "false";
process.env.LANGCHAIN_TRACING_V2 = "false";
const { analyzeDocuments, modelStatus, validateInput } =
  await import("./analysis.mjs");
const PORT = 5180;
const allowedHosts = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const allowedOrigins = new Set(
  [...allowedHosts].map((host) => `http://${host}`),
);
let active = false;
let ownedOllama;

// Start only the official local executable, if installed. Never download a model implicitly.
if ((await modelStatus()).serviceAvailable === false) {
  const executable =
    process.platform === "win32"
      ? join(process.env.LOCALAPPDATA || "", "Programs", "Ollama", "ollama.exe")
      : "ollama";
  if (process.platform !== "win32" || existsSync(executable)) {
    ownedOllama = spawn(executable, ["serve"], {
      windowsHide: true,
      stdio: "ignore",
      env: {
        ...process.env,
        OLLAMA_HOST: "127.0.0.1:11434",
        OLLAMA_NO_CLOUD: "1",
      },
    });
    ownedOllama.on("error", () =>
      console.log("Open Ollama manually to enable analysis."),
    );
  }
}

function json(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}
async function api(request, response) {
  if (
    !allowedHosts.has(request.headers.host) ||
    (request.headers.origin && !allowedOrigins.has(request.headers.origin))
  )
    return json(response, 403, {
      error: "Only this computer’s local app can access the model.",
    });
  const path = request.url?.split("?")[0];
  if (path === "/api/local/status" && request.method === "GET")
    return json(response, 200, await modelStatus());
  if (path !== "/api/local/analyze" || request.method !== "POST")
    return json(response, 404, { error: "Not found." });
  if (!request.headers["content-type"]?.startsWith("application/json"))
    return json(response, 415, { error: "Use a JSON request." });
  if (active)
    return json(response, 409, {
      error:
        "An analysis is already running. Wait for it to finish, or cancel it first.",
    });
  active = true;
  try {
    let bytes = 0;
    const chunks = [];
    for await (const chunk of request) {
      bytes += chunk.length;
      if (bytes > 40000)
        return json(response, 413, {
          error: "Input is too large. Use shorter excerpts.",
        });
      chunks.push(chunk);
    }
    const input = validateInput(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5 * 60 * 1000);
    const disconnect = () => {
      if (!response.writableEnded) controller.abort();
    };
    response.on("close", disconnect);
    try {
      json(response, 200, await analyzeDocuments(input, controller.signal));
    } catch (error) {
      if (!response.destroyed)
        json(response, 503, {
          error: controller.signal.aborted
            ? "Analysis timed out. Try a shorter excerpt or a smaller local model."
            : /Ollama|local model|Cloud|cloud inference|Download|inspect/.test(
                  error.message,
                )
              ? error.message
              : "The model did not return a complete, valid result. Try a shorter excerpt and run again. No fallback or sample results were used.",
        });
    } finally {
      clearTimeout(timer);
      response.off("close", disconnect);
    }
  } catch (error) {
    json(response, 400, {
      error:
        error instanceof SyntaxError ? "Invalid JSON input." : error.message,
    });
  } finally {
    active = false;
  }
}
const dev = process.argv.includes("--dev");
const vite = dev
  ? await (
      await import("vite")
    ).createServer({
      configFile: fileURLToPath(new URL("./vite.config.mjs", import.meta.url)),
      server: { middlewareMode: true },
      appType: "spa",
    })
  : null;
const clientRoot = fileURLToPath(new URL("../dist-local/", import.meta.url));
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};
async function serveClient(request, response) {
  const path = request.url?.split("?")[0];
  if (!["GET", "HEAD"].includes(request.method))
    return json(response, 405, { error: "Method not allowed." });
  // Only generated flat assets and these two app routes can be served. No source-file access.
  const relative =
    path === "/" || path === "/mapper"
      ? "index.html"
      : path === "/favicon.svg"
        ? "favicon.svg"
        : /^\/assets\/[a-zA-Z0-9_.-]+$/.test(path)
          ? path.slice(1)
          : null;
  if (!relative) return json(response, 404, { error: "Not found." });
  try {
    const data = await readFile(join(clientRoot, relative));
    const extension = relative.slice(relative.lastIndexOf("."));
    response.writeHead(200, {
      "Content-Type": contentTypes[extension] || "application/octet-stream",
      "Content-Length": data.length,
      "Cache-Control": relative.startsWith("assets/")
        ? "public, max-age=31536000, immutable"
        : "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self' blob:; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    });
    response.end(request.method === "HEAD" ? undefined : data);
  } catch {
    json(response, 404, {
      error: "Built app not found. Start it with npm run local.",
    });
  }
}
const server = createServer((request, response) => {
  if (!allowedHosts.has(request.headers.host))
    return json(response, 403, { error: "Invalid host." });
  if (request.url?.startsWith("/api/"))
    void api(request, response).catch(() => {
      if (!response.headersSent)
        json(response, 500, { error: "Local server error." });
    });
  else if (vite) vite.middlewares(request, response);
  else void serveClient(request, response);
});
server.requestTimeout = 30_000;
server.listen(PORT, "127.0.0.1", () =>
  console.log(`Regulatory Radar: http://127.0.0.1:${PORT}`),
);
server.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
async function close() {
  ownedOllama?.kill();
  await vite?.close();
  server.close();
  process.exit(0);
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
