import test from "node:test";
import assert from "node:assert/strict";
import { redactUrl } from "../dist/config.js";

test("redactUrl keeps origin and path and drops userinfo, query and fragment", () => {
  assert.equal(
    redactUrl("https://user:pw@llm.example.com:8443/v1/chat/completions?key=k&api-version=1#frag"),
    "https://llm.example.com:8443/v1/chat/completions",
  );
  assert.equal(redactUrl("https://token@llm.example.com/v1"), "https://llm.example.com/v1");
  assert.equal(redactUrl("http://localhost:11434/v1"), "http://localhost:11434/v1");
});

test("redactUrl never echoes a URL it cannot parse or that is not http(s)", () => {
  assert.equal(redactUrl("http://[bad/v1?key=k"), "(invalid URL)");
  // Without a scheme, "user:" parses as one and the rest stays an opaque path.
  assert.equal(redactUrl("user:pw@llm.example.com:8080/v1"), "(invalid URL)");
});
