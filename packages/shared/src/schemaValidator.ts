import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  const helper = (v: any): any => {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(helper);

    if (seen.has(v)) throw new Error("stableStringify: circular structure");
    seen.add(v);

    const keys = Object.keys(v).sort();
    const out: Record<string, any> = {};
    for (const k of keys) out[k] = helper(v[k]);
    return out;
  };

  return JSON.stringify(helper(value));
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
    // ✅ Ajv2020은 draft 2020-12 메타스키마를 포함함
    this.ajv = new Ajv2020({
      allErrors: true,
      strict: false
    });

    addFormats(this.ajv);

    const files = fs.readdirSync(schemaDirAbs).filter((f) => f.endsWith(".schema.json"));
    if (files.length === 0) {
      throw new Error(`No *.schema.json found in ${schemaDirAbs}`);
    }

    // 스키마 로드
    for (const file of files) {
      const full = path.join(schemaDirAbs, file);
      const schema = JSON.parse(fs.readFileSync(full, "utf8"));
      if (!schema.$id) throw new Error(`Schema missing $id: ${file}`);
      this.ajv.addSchema(schema, schema.$id);
    }
  }

  validate(schemaId: string, data: unknown): ValidationResult {
    const fn = this.ajv.getSchema(schemaId);
    if (!fn) throw new Error(`Unknown schema id: ${schemaId}`);
    const ok = !!fn(data);
    return { ok, errors: (fn.errors ?? []) as ErrorObject[] };
  }
}