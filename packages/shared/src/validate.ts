import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createSchemaRegistry, resolveDefaultSchemaDir } from "./schemaRegistry";
import type { SchemaRegistry } from "./schemaRegistry";

export type ValidationIssue = {
  path: string;
  message: string;
  keyword: string;
  schemaPath: string;
};

export type ValidationResult =
  | {
      ok: true;
      errors: [];
    }
  | {
      ok: false;
      errors: ValidationIssue[];
    };

export type Validator = {
  registry: SchemaRegistry;
  validate(schemaId: string, payload: unknown): ValidationResult;
};

function normalizeErrors(errors: ErrorObject[] | null | undefined): ValidationIssue[] {
  if (!errors || errors.length === 0) {
    return [];
  }

  return errors.map((error) => ({
    path: error.instancePath || "/",
    message: error.message ?? "validation error",
    keyword: error.keyword,
    schemaPath: error.schemaPath
  }));
}

export function createValidator(schemaDir: string = resolveDefaultSchemaDir()): Validator {
  const registry = createSchemaRegistry(schemaDir);
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false
  });

  addFormats(ajv);

  for (const schema of registry.schemas.values()) {
    ajv.addSchema(schema, schema.$id);
  }

  return {
    registry,
    validate(schemaId: string, payload: unknown): ValidationResult {
      const validateFn = ajv.getSchema(schemaId);

      if (!validateFn) {
        return {
          ok: false,
          errors: [
            {
              path: "/",
              message: `Unknown schema id: ${schemaId}`,
              keyword: "schema",
              schemaPath: schemaId
            }
          ]
        };
      }

      const ok = validateFn(payload);
      if (ok) {
        return { ok: true, errors: [] };
      }

      return {
        ok: false,
        errors: normalizeErrors(validateFn.errors)
      };
    }
  };
}

type SmokeCase = {
  name: string;
  schemaId: string;
  file: string;
  expectOk: boolean;
};

function readJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function runValidationSmoke(): void {
  const validator = createValidator();
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const testdataDir = path.resolve(__dirname, "../testdata");

  const cases: SmokeCase[] = [
    {
      name: "beats.valid",
      schemaId: "beats.schema.json",
      file: path.join(testdataDir, "beats.valid.json"),
      expectOk: true
    },
    {
      name: "beats.invalid",
      schemaId: "beats.schema.json",
      file: path.join(testdataDir, "beats.invalid.json"),
      expectOk: false
    }
  ];

  let failed = 0;

  for (const item of cases) {
    const payload = readJsonFile(item.file);
    const result = validator.validate(item.schemaId, payload);
    const pass = result.ok === item.expectOk;
    const tag = pass ? "PASS" : "FAIL";

    console.log(`[${tag}] ${item.name} (schema=${item.schemaId})`);

    if (!result.ok) {
      for (const issue of result.errors) {
        console.log(`  - path=${issue.path} message=${issue.message}`);
      }
    }

    if (!pass) {
      failed += 1;
    }
  }

  if (failed > 0) {
    throw new Error(`validate:smoke failed (${failed} case${failed > 1 ? "s" : ""})`);
  }

  console.log("validate:smoke passed");
}

const isDirectRun = Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectRun && process.argv.includes("--smoke")) {
  try {
    runValidationSmoke();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
