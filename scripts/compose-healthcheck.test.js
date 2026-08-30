"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

test("production frontend health check uses the IPv4 loopback address", () => {
  const compose = readFileSync(
    join(__dirname, "..", "docker-compose.prod.yml"),
    "utf8",
  );

  assert.match(compose, /http:\/\/127\.0\.0\.1:3001\/health/);
  assert.doesNotMatch(compose, /http:\/\/localhost:3001\/health/);
});
