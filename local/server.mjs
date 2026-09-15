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
const { catalog, scanPublications, openDocument } =
  await import("./radar-data.mjs");
const { generateBrief, compareChecklist } = await import("./radar-ai.mjs");
const { answerChat, validateChatInput } = await import("./radar-chat.mjs");
const { knowledgeDocuments, knowledgeDocument, knowledgeMarkdown, searchKnowledge } = await import("./internal-knowledge.mjs");
const { extractKycFacts, validatePacket } = await import("./kyc-ai.mjs");
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
  if (path === "/api/radar/catalog" && request.method === "GET")
    return json(response, 200, catalog());
  if (path?.startsWith("/api/knowledge/") && request.method === "GET") {
    const query = new URL(request.url, `http://127.0.0.1:${PORT}`).searchParams;
    if (path === "/api/knowledge/documents") return json(response, 200, { demo: true, notice: "Fictional internal policies for interview demonstration only.", documents: knowledgeDocuments() });
    if (path === "/api/knowledge/search") {
      const q = query.get("q") || "";
      if (!q.trim() || q.length > 250) return json(response, 400, { error: "Supply a search query of 1–250 characters." });
      return json(response, 200, { demo: true, query: q, results: searchKnowledge(q) });
    }
    const match = path.match(/^\/api\/knowledge\/documents\/(demo-[a-z]+)$/);
    if (!match) return json(response, 404, { error: "Sample document not found." });
    let doc;
    try { doc = knowledgeDocument(match[1], query.get("version"), query.get("hash")); }
    catch (error) { return json(response, 409, { error: error.message }); }
    if (!doc) return json(response, 404, { error: "Sample document version not found." });
    if (query.get("format") === "markdown") { response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }); return response.end(knowledgeMarkdown(doc)); }
    return json(response, 200, doc);
  }
  if (
    ![
      "/api/local/analyze",
      "/api/radar/scan",
      "/api/radar/document",
      "/api/radar/brief",
      "/api/radar/compare",
      "/api/radar/chat",
      "/api/kyc/extract",
    ].includes(path) ||
    request.method !== "POST"
  )
    return json(response, 404, { error: "Not found." });
  if (!request.headers["content-type"]?.startsWith("application/json"))
    return json(response, 415, { error: "Use a JSON request." });
  if (active)
    return json(response, 409, {
      error:
        "A task is already running. Wait for it to finish, or cancel it first.",
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
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body))
      return json(response, 400, { error: "Use a JSON object." });
    if (
      path.startsWith("/api/radar/") &&
      path !== "/api/radar/scan" &&
      path !== "/api/radar/chat" &&
      (typeof body.id !== "string" || !/^[a-f0-9]{24}$/.test(body.id))
    )
      return json(response, 400, {
        error: "Choose a saved publication first.",
      });
    const input = path === "/api/local/analyze" ? validateInput(body) : body;
    if (path === "/api/kyc/extract") validatePacket(input.packet);
    if (path === "/api/radar/chat") validateChatInput(input);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5 * 60 * 1000);
    const disconnect = () => {
      if (!response.writableEnded) controller.abort();
    };
    response.on("close", disconnect);
    try {
      let result;
      if (path === "/api/radar/chat")
        result = await answerChat(input, controller.signal);
      else if (path === "/api/kyc/extract")
        result = await extractKycFacts(input.packet, controller.signal);
      else if (path === "/api/radar/scan")
        result = await scanPublications(controller.signal);
      else if (path === "/api/radar/document")
        result = await openDocument(input.id, controller.signal);
      else if (path === "/api/radar/brief")
        result = await generateBrief(input.id, controller.signal);
      else if (path === "/api/radar/compare")
        result = await compareChecklist(
          input.id,
          input.checklist,
          controller.signal,
        );
      else result = await analyzeDocuments(input, controller.signal);
      json(response, 200, result);
    } catch (error) {
      if (!response.destroyed)
        json(response, 503, {
          error: controller.signal.aborted
            ? "The task timed out. Please retry with a shorter document or a smaller local model."
            : path.startsWith("/api/radar/") &&
                !/ZodError|JSON|parse|schema/i.test(error.message)
              ? error.message
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
  // Only generated flat assets and these app routes can be served. No source-file access.
  const relative =
    path === "/" || path === "/mapper" || path === "/chat"
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
