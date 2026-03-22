import assert from "node:assert/strict";
import {
  AccessControlError,
  enforceApiAccess,
  resolveApiListenHost
} from "./apiAccessControl";

function request(input: {
  method: string;
  ip?: string;
  remoteAddress?: string;
  headers?: Record<string, unknown>;
}) {
  return {
    method: input.method,
    ip: input.ip,
    raw: { socket: { remoteAddress: input.remoteAddress ?? null } },
    headers: input.headers ?? {}
  };
}

const localBinding = resolveApiListenHost({ apiHost: "0.0.0.0", apiKey: "" });
assert.equal(localBinding.host, "127.0.0.1");
assert.equal(localBinding.localOnlyMode, true);
assert.equal(localBinding.forcedLocalBinding, true);

assert.doesNotThrow(() =>
  enforceApiAccess({
    request: request({ method: "GET", ip: "127.0.0.1" }),
    routePath: "/api/episodes",
    apiKey: "",
    apiPort: 3000,
    listenHost: "127.0.0.1"
  })
);

assert.throws(
  () =>
    enforceApiAccess({
      request: request({ method: "GET", ip: "203.0.113.10" }),
      routePath: "/api/episodes",
      apiKey: "",
      apiPort: 3000,
      listenHost: "127.0.0.1"
    }),
  (error: unknown) => error instanceof AccessControlError && error.statusCode === 403
);

assert.throws(
  () =>
    enforceApiAccess({
      request: request({
        method: "POST",
        ip: "127.0.0.1",
        headers: {
          host: "localhost:3000"
        }
      }),
      routePath: "/ui/character-generator/create",
      apiKey: "",
      apiPort: 3000,
      listenHost: "127.0.0.1"
    }),
  (error: unknown) => error instanceof AccessControlError && error.statusCode === 403
);

assert.doesNotThrow(() =>
  enforceApiAccess({
    request: request({
      method: "POST",
      ip: "127.0.0.1",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000"
      }
    }),
    routePath: "/ui/character-generator/create",
    apiKey: "",
    apiPort: 3000,
    listenHost: "127.0.0.1"
  })
);

assert.doesNotThrow(() =>
  enforceApiAccess({
    request: request({
      method: "POST",
      ip: "198.51.100.20",
      headers: {
        "x-api-key": "secret"
      }
    }),
    routePath: "/api/episodes",
    apiKey: "secret",
    apiPort: 3000,
    listenHost: "0.0.0.0"
  })
);

assert.throws(
  () =>
    enforceApiAccess({
      request: request({
        method: "POST",
        ip: "198.51.100.20",
        headers: {
          "x-api-key": "wrong"
        }
      }),
      routePath: "/api/episodes",
      apiKey: "secret",
      apiPort: 3000,
      listenHost: "0.0.0.0"
    }),
  (error: unknown) => error instanceof AccessControlError && error.statusCode === 401
);

console.log("[api-access-control-smoke] PASS");
