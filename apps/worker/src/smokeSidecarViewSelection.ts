import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRequestedReferenceView, type SidecarViewName } from "./sidecarViewPreference";

type SmokeShotDocument = {
  shots?: Array<{
    shot_id?: string;
    render_mode?: string;
    character?: {
      tracks?: {
        view_track?: Array<{
          f?: number;
          view?: SidecarViewName;
        }>;
      };
    };
  }>;
};

function resolveRepoRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../../..");
}

function resolveArgValue(name: string): string | null {
  const prefix = `--${name}=`;
  const entry = process.argv.slice(2).find((value) => value.startsWith(prefix));
  if (!entry) {
    return null;
  }
  const value = entry.slice(prefix.length).trim();
  return value.length > 0 ? value : null;
}

function resolveFixturePath(repoRoot: string, inputPath: string | null, fallbackName: string): string {
  if (!inputPath) {
    return path.join(repoRoot, "scripts", "fixtures", fallbackName);
  }
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  return path.resolve(process.cwd(), inputPath);
}

function main() {
  const repoRoot = resolveRepoRoot();
  const fixturePath = resolveFixturePath(
    repoRoot,
    resolveArgValue("fixture"),
    "video_s2v_smoke_shots.json"
  );
  const expectedView = (resolveArgValue("expected-view")?.trim() || "profile") as SidecarViewName;
  const expectedSource = resolveArgValue("expected-source")?.trim() || "view_track";
  const raw = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as SmokeShotDocument;
  const shot = raw.shots?.[0];
  if (!shot) {
    throw new Error(`No shots found in fixture: ${fixturePath}`);
  }

  const availableViewNames: SidecarViewName[] = ["front", "threeQuarter", "profile"];
  const selection = resolveRequestedReferenceView({
    shot,
    renderMode: shot.render_mode ?? "generative_broll",
    availableViewNames
  });

  if (selection.view !== expectedView) {
    throw new Error(`Expected requested view ${expectedView}, got ${selection.view ?? "missing"}`);
  }
  if (selection.source !== expectedSource) {
    throw new Error(`Expected requested source ${expectedSource}, got ${selection.source}`);
  }

  console.log("SMOKE SIDECAR VIEW SELECTION: PASS");
  console.log(`  fixture=${fixturePath}`);
  console.log(`  shotId=${shot.shot_id ?? "(missing)"}`);
  console.log(`  renderMode=${shot.render_mode ?? "(missing)"}`);
  console.log(`  requestedView=${selection.view ?? "(missing)"}`);
  console.log(`  requestedSource=${selection.source}`);
}

main();
