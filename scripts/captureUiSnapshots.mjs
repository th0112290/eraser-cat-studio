import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const captureLabel = sanitizeSegment(process.env.SMOKE_CAPTURE_LABEL ?? "manual");
const outputRoot = path.resolve("out", "ui_smoke_snapshots", captureLabel);
const requestId = process.env.SMOKE_CAPTURE_REQUEST_ID ?? `smoke-ui-capture-${captureLabel}`;

const seedPaths = [
  "/ui",
  "/ui/assets",
  "/ui/studio",
  "/ui/character-generator",
  "/ui/characters",
  "/ui/episodes",
  "/ui/jobs",
  "/ui/hitl",
  "/ui/publish",
  "/ui/health",
  "/ui/rollouts",
  "/ui/benchmarks",
  "/ui/profiles",
  "/ui/profiles?q=economy_channel",
  "/ui/profiles?q=medical_channel",
  "/ui/artifacts"
];

function sanitizeSegment(value) {
  return (
    value
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "snapshot"
  );
}

function fileStemForRoute(route, index) {
  const url = new URL(route, `${baseUrl}/`);
  const pathname = url.pathname === "/" ? "root" : url.pathname.replace(/^\/+/, "");
  const joined = pathname.replace(/[\\/]+/g, "__");
  const query = url.search ? `__${sanitizeSegment(url.search.slice(1))}` : "";
  return `${String(index).padStart(2, "0")}__${joined}${query}`;
}

function extensionForType(contentType) {
  if (contentType.includes("application/json")) return ".json";
  if (contentType.includes("text/plain")) return ".txt";
  return ".html";
}

function extractFirstHref(body, regex) {
  const match = body.match(regex);
  return match ? match[1] : null;
}

async function captureRoute(route, index) {
  const fetchedAt = new Date().toISOString();
  const entry = {
    route,
    url: `${baseUrl}${route}`,
    fetchedAt,
    requestId,
    ok: false
  };

  try {
    const response = await fetch(entry.url, {
      headers: {
        "x-request-id": requestId
      }
    });
    const contentType = response.headers.get("content-type") ?? "text/html; charset=utf-8";
    const body = await response.text();
    const extension = extensionForType(contentType);
    const fileName = `${fileStemForRoute(route, index)}${extension}`;
    const filePath = path.join(outputRoot, fileName);

    await writeFile(filePath, body, "utf8");

    entry.ok = response.ok;
    entry.status = response.status;
    entry.contentType = contentType;
    entry.file = fileName;
    entry.bytes = Buffer.byteLength(body, "utf8");

    console.log(
      `[smoke:ui:capture] ${route} status=${response.status} file=${fileName} requestId=${response.headers.get("x-request-id") ?? "none"}`
    );

    return { entry, body };
  } catch (error) {
    entry.error = error instanceof Error ? error.message : String(error);
    console.error(`[smoke:ui:capture] ${route} error=${entry.error}`);
    return { entry, body: "" };
  }
}

function discoverRoutes(captures) {
  const discovered = [];
  const episodes = captures.get("/ui/episodes");
  const jobs = captures.get("/ui/jobs");
  const benchmarks = captures.get("/ui/benchmarks");

  const episodeHref = episodes ? extractFirstHref(episodes.body, /href="(\/ui\/episodes\/[^"?#]+)"/) : null;
  const jobHref = jobs ? extractFirstHref(jobs.body, /href="(\/ui\/jobs\/[^"?#]+)"/) : null;
  const compareHref = benchmarks
    ? extractFirstHref(benchmarks.body, /href="(\/ui\/benchmarks\/candidates\?path=[^"]+)"/)
    : null;

  if (episodeHref) discovered.push(episodeHref);
  if (jobHref) discovered.push(jobHref);
  if (compareHref) {
    discovered.push(compareHref.replaceAll("&amp;", "&").replaceAll("&#39;", "'").replaceAll("&quot;", "\""));
  }

  return discovered;
}

async function main() {
  await mkdir(outputRoot, { recursive: true });

  const captures = new Map();
  let index = 0;

  for (const route of seedPaths) {
    captures.set(route, await captureRoute(route, index));
    index += 1;
  }

  for (const route of discoverRoutes(captures)) {
    if (captures.has(route)) continue;
    captures.set(route, await captureRoute(route, index));
    index += 1;
  }

  const manifest = {
    label: captureLabel,
    baseUrl,
    outputRoot,
    capturedAt: new Date().toISOString(),
    entries: Array.from(captures.values(), ({ entry }) => entry)
  };

  await writeFile(path.join(outputRoot, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  const okCount = manifest.entries.filter((entry) => entry.ok).length;
  const failedCount = manifest.entries.length - okCount;
  console.log(`[smoke:ui:capture] wrote ${manifest.entries.length} entries to ${outputRoot} ok=${okCount} failed=${failedCount}`);
}

main().catch((error) => {
  console.error("[smoke:ui:capture] fatal", error);
  process.exit(1);
});
