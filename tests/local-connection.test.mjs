import test from "node:test";
import assert from "node:assert/strict";
import { readConnection, analysisErrorMessage } from "../app/mapper/local-connection.mjs";

const read = (request, hostname = "127.0.0.1") =>
  readConnection(hostname, new AbortController().signal, request);

test("distinguishes a stopped server from an unavailable model", async () => {
  const offline = await read(async () => { throw new TypeError("Failed to fetch"); });
  assert.equal(offline.ready, false);
  assert.equal(offline.serverAvailable, false);
  assert.match(offline.message, /local:background/);
  assert.doesNotMatch(offline.message, /This hosted page/);
  const noModel = await read(async () => Response.json({ ready: false, model: "qwen3:1.7b", message: "Open Ollama." }));
  assert.equal(noModel.serverAvailable, true);
  assert.equal(noModel.ready, false);
  assert.equal(noModel.message, "Open Ollama.");
});

test("rejects HTML/invalid status, and recovers when the server returns", async () => {
  assert.equal((await read(async () => new Response("<html>Hosted page</html>"))).ready, false);
  assert.equal((await read(async () => Response.json({ ready: "yes" }))).ready, false);
  const status = await read(async (_url, options) => {
    assert.equal(options.cache, "no-store");
    return Response.json({ ready: true, model: "qwen3:1.7b", message: "Ready" });
  });
  assert.equal(status.ready, true);
  assert.equal(status.serverAvailable, true);
});

test("keeps hosted setup guidance separate, and does not apply cancelled checks", async () => {
  const status = await read(async () => new Response("Not found", { status: 404 }), "example.com");
  assert.match(status.message, /hosted page/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(readConnection("localhost", controller.signal, async () => { throw new Error("Aborted"); }));
});

test("network failures have recovery advice; genuine API errors retain details", () => {
  const message = analysisErrorMessage(new TypeError("Failed to fetch"));
  assert.match(message, /inputs are still here/);
  assert.doesNotMatch(message, /Failed to fetch/);
  assert.equal(analysisErrorMessage(new Error("Input is too large.")), "Input is too large.");
});
