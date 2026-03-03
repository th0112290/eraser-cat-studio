import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AnySchemaObject } from "ajv";

export type JsonSchema = AnySchemaObject & { $id: string };

export type SchemaRegistry = {
  schemaDir: string;
  schemas: Map<string, JsonSchema>;
  get(schemaId: string): JsonSchema | undefined;
  list(): string[];
};

export function resolveDefaultSchemaDir(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../../schemas");
}

function parseSchemaFile(filePath: string): JsonSchema {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as AnySchemaObject & { $id?: string };

  if (!parsed || typeof parsed !== "object" || typeof parsed.$id !== "string" || parsed.$id.length === 0) {
    throw new Error(`Schema missing valid $id: ${filePath}`);
  }

  return parsed as JsonSchema;
}

function loadSchemaMap(schemaDir: string): Map<string, JsonSchema> {
  if (!fs.existsSync(schemaDir)) {
    throw new Error(`Schema directory not found: ${schemaDir}`);
  }

  const files = fs
    .readdirSync(schemaDir)
    .filter((name) => name.endsWith(".schema.json"))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    throw new Error(`No *.schema.json found in ${schemaDir}`);
  }

  const map = new Map<string, JsonSchema>();

  for (const file of files) {
    const fullPath = path.join(schemaDir, file);
    const schema = parseSchemaFile(fullPath);

    if (map.has(schema.$id)) {
      throw new Error(`Duplicate schema $id "${schema.$id}" in ${fullPath}`);
    }

    map.set(schema.$id, schema);
  }

  return map;
}

export function createSchemaRegistry(schemaDir: string = resolveDefaultSchemaDir()): SchemaRegistry {
  const schemas = loadSchemaMap(schemaDir);

  return {
    schemaDir,
    schemas,
    get(schemaId: string) {
      return schemas.get(schemaId);
    },
    list() {
      return Array.from(schemas.keys());
    }
  };
}
