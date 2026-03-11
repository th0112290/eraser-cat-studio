import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import characterPackSchema from "../../../../packages/schemas/character_pack.schema.json";
import minimalPackJson from "./packs/minimal.json";
import turningPackJson from "./packs/turning.json";
import type { CharacterPack } from "./types";

export type CharacterPackValidationIssue = {
  path: string;
  message: string;
};

function toIssues(errors: ErrorObject[] | null | undefined): CharacterPackValidationIssue[] {
  if (!errors) {
    return [];
  }

  return errors.map((error) => ({
    path: error.instancePath || "/",
    message: error.message ?? "validation error"
  }));
}

export function validateCharacterPack(payload: unknown): CharacterPackValidationIssue[] {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false
  });
  const validate = ajv.compile<CharacterPack>(characterPackSchema as object);
  const ok = validate(payload);

  if (ok) {
    return [];
  }

  return toIssues(validate.errors);
}

export function assertCharacterPack(payload: unknown, label: string = "character-pack"): CharacterPack {
  const issues = validateCharacterPack(payload);
  if (issues.length === 0) {
    return payload as CharacterPack;
  }

  const details = issues.map((issue) => `${issue.path} ${issue.message}`).join("; ");
  throw new Error(`Invalid ${label}: ${details}`);
}

export const minimalCharacterPack = assertCharacterPack(minimalPackJson, "minimal character pack");
export const turningCharacterPack = assertCharacterPack(turningPackJson, "turning character pack");
