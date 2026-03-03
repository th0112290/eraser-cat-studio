import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

function toStableJsonValue(value: unknown, seen: WeakSet<object>): JsonValue {
  if (value === undefined) {
    return null;
  }

  if (value === null) {
    return null;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => (entry === undefined ? null : toStableJsonValue(entry, seen)));
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      throw new Error("stableStringify: circular structure");
    }

    seen.add(value);

    const record = value as Record<string, unknown>;
    const sortedKeys = Object.keys(record).sort();
    const out: Record<string, JsonValue> = {};
    for (const key of sortedKeys) {
      const entry = record[key];
      if (entry === undefined) {
        continue;
      }
      out[key] = toStableJsonValue(entry, seen);
    }
    return out;
  }

  throw new Error(`stableStringify: unsupported value type "${typeof value}"`);
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(toStableJsonValue(value, new WeakSet<object>()));
}

export function sha256Hex(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export type ValidationResult = {
  ok: boolean;
  errors: ErrorObject[];
};

export class SchemaValidator {
  private ajv: Ajv2020;

  constructor(schemaDirAbs: string) {
    this.ajv = new Ajv2020({
      allErrors: true,
      strict: false
    });

    addFormats(this.ajv);

    const files = fs.readdirSync(schemaDirAbs).filter((f) => f.endsWith(".schema.json"));
    if (files.length === 0) {
      throw new Error(`No *.schema.json found in ${schemaDirAbs}`);
    }

    for (const file of files) {
      const fullPath = path.join(schemaDirAbs, file);
      const schema = JSON.parse(fs.readFileSync(fullPath, "utf8")) as { $id?: string };
      if (!schema.$id) {
        throw new Error(`Schema missing $id: ${file}`);
      }
      this.ajv.addSchema(schema, schema.$id);
    }
  }

  validate(schemaId: string, data: unknown): ValidationResult {
    const validateFn = this.ajv.getSchema(schemaId);
    if (!validateFn) {
      throw new Error(`Unknown schema id: ${schemaId}`);
    }
    const ok = validateFn(data);
    return { ok: !!ok, errors: (validateFn.errors ?? []) as ErrorObject[] };
  }
}
