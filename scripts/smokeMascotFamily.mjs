import { spawnSync } from "node:child_process";

const speciesList = (process.env.SMOKE_MASCOT_SPECIES_LIST ?? "cat")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter((value) => value.length > 0);

if (speciesList.length === 0) {
  throw new Error("SMOKE_MASCOT_SPECIES_LIST resolved to an empty list");
}

const summary = [];

for (const species of speciesList) {
  console.log(`[smoke:family] start species=${species}`);
  const result = spawnSync(process.execPath, ["scripts/smokeCharacter.mjs"], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      SMOKE_CHARACTER_SPECIES: species
    }
  });

  summary.push({
    species,
    ok: result.status === 0
  });

  if (result.status !== 0) {
    throw new Error(`smokeCharacter failed for species=${species} exit=${result.status ?? 1}`);
  }
}

console.log(`[smoke:family] completed ${summary.map((entry) => `${entry.species}=ok`).join(", ")}`);
