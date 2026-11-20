// Credentials in a provider's base_url userinfo or query_params must never reach
// stderr (Claude Code keeps MCP stderr in its logs) or a tool result.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { OffshoreClient } from "../dist/client.js";

const PASSWORD = "pw-secret-6b1d";
const KEY = "qk-secret-93fa";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// The plugin runs the server with Bun. The child gets a temporary HOME, which a
// version-manager shim on PATH may depend on, so resolve the real binary here.
const bun = spawnSync("bun", ["-e", "process.stdout.write(process.execPath)"], { encoding: "utf8" }).stdout;
const runtimes = [
  { label: "node", command: process.execPath, args: [path.join(root, "dist", "index.js")] },
  { label: "bun", command: bun, args: [path.join(root, "src", "index.ts")] },
];

const seen = [];
let upstream;
let origin;

before(async () => {
  upstream = http.createServer((req, res) => {
    seen.push(req.url);
    if (req.url.startsWith("/hang/")) return; // never answer: trips the idle timeout
    if (req.url.startsWith("/json/")) {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end("not json");
    }
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "Invalid API key" } }));
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${upstream.address().port}`;
});

after(() => {
  upstream.closeAllConnections();
  upstream.close();
});

function assertClean(text) {
  assert.ok(!text.includes(KEY), `query key leaked: ${text}`);
  assert.ok(!text.includes(PASSWORD), `password leaked: ${text}`);
}

function clientFor(baseUrl) {
  const provider = {
    id: "leaky",
    name: "Leaky",
    baseUrl,
    envKey: null,
    wireApi: "chat",
    httpHeaders: {},
    envHttpHeaders: {},
    queryParams: { key: KEY },
    requestMaxRetries: 0,
  };
  const config = { model: "m", provider, apiKey: "local", temperature: null, maxTokens: null, timeoutMs: 300 };
  return new OffshoreClient(config, {});
}

async function failure(promise) {
  try {
    await promise;
  } catch (err) {
    return err.message;
  }
  assert.fail("expected the request to fail");
}

const hi = [{ role: "user", content: "hi" }];

test("client errors name the endpoint by origin and path only", async () => {
  seen.length = 0;
  const chat = await failure(clientFor(`${origin}/v1`).chat(hi));
  assert.equal(chat, `${origin}/v1/chat/completions responded 401 Unauthorized: {"error":{"message":"Invalid API key"}}`);
  const models = await failure(clientFor(`${origin}/v1`).listModels());
  assert.ok(models.startsWith(`${origin}/v1/models responded 401`), models);
  const json = await failure(clientFor(`${origin}/json`).listModels());
  assert.equal(json, `Could not parse JSON from ${origin}/json/models.`);
  const timeout = await failure(clientFor(`${origin}/hang`).chat(hi));
  assert.ok(timeout.startsWith(`Request to ${origin}/hang/chat/completions timed out`), timeout);
  for (const message of [chat, models, json, timeout]) assertClean(message);
  // Only the reported URL is reduced: the key still reaches the provider.
  assert.ok(seen.includes(`/v1/chat/completions?key=${KEY}`), JSON.stringify(seen));
});

test("an unreachable endpoint is reported without its userinfo", async () => {
  // Node's fetch refuses a URL with credentials, so this lands on the unreachable path.
  const base = `http://user:${PASSWORD}@${origin.slice("http://".length)}/v1`;
  const message = await failure(clientFor(base).chat(hi));
  assert.ok(message.startsWith(`Could not reach the Leaky endpoint at ${origin}/v1.`), message);
  assertClean(message);
});

/** Start the server against `toml` with a temporary HOME, call each tool once, and return what it said. */
async function runServer(runtime, toml) {
  assert.ok(runtime.command, "Bun must be on PATH: the plugin runs the server with it");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "offshore-test-"));
  const configPath = path.join(home, "config.toml");
  fs.writeFileSync(configPath, toml);
  // The SDK passes the child only HOME, PATH and a few other safe variables plus
  // this env, so CLAUDE_CONFIG_DIR and any OFFSHORE_* settings never reach it.
  const transport = new StdioClientTransport({
    command: runtime.command,
    args: runtime.args,
    env: { HOME: home, OFFSHORE_CONFIG: configPath },
    stderr: "pipe",
  });
  let stderr = "";
  const ready = new Promise((resolve) =>
    transport.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.includes("server ready")) resolve();
    }),
  );
  const client = new Client({ name: "offshore-test", version: "0.0.0" });
  try {
    await client.connect(transport);
    await ready;
    const results = {};
    for (const [name, args] of [["ask_abliterated", { question: "hi" }], ["list_models", {}], ["list_providers", {}]]) {
      const result = await client.callTool({ name, arguments: args });
      results[name] = { isError: result.isError === true, text: result.content.map((c) => c.text).join("\n") };
    }
    return { stderr, results };
  } finally {
    await client.close();
    fs.rmSync(home, { recursive: true, force: true });
  }
}

for (const runtime of runtimes) {
  test(`server hides base_url userinfo and query_params from stderr and tool results (${runtime.label})`, { timeout: 30_000 }, async () => {
    seen.length = 0;
    const host = origin.slice("http://".length);
    const { stderr, results } = await runServer(
      runtime,
      `model = "m"
model_provider = "leaky"

[model_providers.leaky]
name = "Leaky"
base_url = "http://user:${PASSWORD}@${host}/v1"
request_max_retries = 0
query_params = { key = "${KEY}" }
`,
    );
    assert.ok(stderr.includes(`endpoint ${origin}/v1`), stderr);
    assert.ok(results.ask_abliterated.isError, results.ask_abliterated.text);
    assert.ok(results.list_models.isError, results.list_models.text);
    assert.ok(results.ask_abliterated.text.includes(`${origin}/v1`), results.ask_abliterated.text);
    assert.ok(results.list_providers.text.includes(`leaky: Leaky [chat] ${origin}/v1`), results.list_providers.text);
    // Bun sends credentialed URLs, so there the 401 result is what the key would leak through.
    if (runtime.label === "bun") assert.ok(seen.includes(`/v1/chat/completions?key=${KEY}`), JSON.stringify(seen));
    assertClean(stderr);
    for (const { text } of Object.values(results)) assertClean(text);
  });

  test(`server hides the query string of a base_url it cannot parse (${runtime.label})`, { timeout: 30_000 }, async () => {
    const { stderr, results } = await runServer(
      runtime,
      `model = "m"
model_provider = "broken"

[model_providers.broken]
base_url = "http://[bad/v1?key=${KEY}"
request_max_retries = 0
`,
    );
    assert.ok(results.ask_abliterated.isError, results.ask_abliterated.text);
    assert.ok(results.ask_abliterated.text.includes("base_url is not a valid URL"), results.ask_abliterated.text);
    assertClean(stderr);
    for (const { text } of Object.values(results)) assertClean(text);
  });
}
