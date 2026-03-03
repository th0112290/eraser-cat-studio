import assert from "node:assert/strict";
import { stableStringify } from "./schemaValidator";

const topLevelUndefined = stableStringify(undefined);
assert.equal(topLevelUndefined, "null");

const payload = {
  z: 1,
  a: undefined,
  b: {
    z: "keep",
    a: undefined
  },
  c: [1, undefined, { k: undefined, y: true }]
};

const serialized = stableStringify(payload);
assert(!serialized.includes("undefined"));

const parsed = JSON.parse(serialized) as {
  b: Record<string, unknown>;
  c: Array<unknown>;
  z: number;
  a?: unknown;
};

assert.equal(parsed.z, 1);
assert(!("a" in parsed));
assert.deepEqual(parsed.b, { z: "keep" });
assert.deepEqual(parsed.c, [1, null, { y: true }]);

console.log("[shared] stableStringify smoke ok");
