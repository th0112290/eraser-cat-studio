import { createServiceUnavailablePayload, hasServiceUnavailableShape } from "./errorPayload";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const redis = createServiceUnavailablePayload({
  dependency: "redis",
  requestId: "req_contract_redis"
});

const db = createServiceUnavailablePayload({
  dependency: "postgresql",
  requestId: "req_contract_db"
});

assert(hasServiceUnavailableShape(redis), "redis payload shape mismatch");
assert(hasServiceUnavailableShape(db), "db payload shape mismatch");
assert(redis.error_code === "redis_unavailable", "redis error_code mismatch");
assert(db.error_code === "database_unavailable", "db error_code mismatch");

console.log("[errorPayload.smoke] PASS");
