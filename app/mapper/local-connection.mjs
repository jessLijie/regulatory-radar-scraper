/** @param {string} hostname */
export function unavailableConnection(hostname) {
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(hostname);
  return {
    ready: false,
    serverAvailable: false,
    model: "Ollama",
    message: local
      ? "The local app is offline or unreachable. Start it with npm run local:background on Windows (or npm run local), then click Recheck. Your inputs are still here."
      : "This hosted page cannot connect to your computer’s model. Run npm run local, then open http://127.0.0.1:5180.",
  };
}

/**
 * @param {string} hostname
 * @param {AbortSignal} signal
 * @param {typeof fetch} request
 */
export async function readConnection(hostname, signal, request = fetch) {
  try {
    const response = await request("/api/local/status", {
      cache: "no-store",
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json"))
      throw new Error("Local status unavailable");
    const status = await response.json();
    if (typeof status.ready !== "boolean" || typeof status.model !== "string" || typeof status.message !== "string")
      throw new Error("Invalid local status");
    return {
      ready: status.ready,
      serverAvailable: true,
      model: status.model,
      message: status.message,
    };
  } catch (error) {
    // Superseded checks must not replace newer status or update an unmounted UI.
    if (signal.aborted) throw error;
    return unavailableConnection(hostname);
  }
}

/** @param {unknown} error */
export function analysisErrorMessage(error) {
  if (error instanceof TypeError)
    return "The connection to the local app was interrupted. Your inputs are still here. Check the connection status below the inputs, then retry. No analysis results were received.";
  return error instanceof Error ? error.message : "Analysis failed. Please try again.";
}
