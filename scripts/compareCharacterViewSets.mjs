import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const workerRequire = createRequire(new URL("../apps/worker/package.json", import.meta.url));
const sharp = workerRequire("sharp");

const DEFAULT_VIEWS = ["front", "threeQuarter", "profile"];

function clamp01(value) {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function parseArgs(argv) {
  const parsed = {};
  for (const entry of argv) {
    if (!entry.startsWith("--")) {
      continue;
    }
    const eq = entry.indexOf("=");
    if (eq === -1) {
      parsed[entry.slice(2)] = "true";
      continue;
    }
    parsed[entry.slice(2, eq)] = entry.slice(eq + 1);
  }
  return parsed;
}

function requireArg(args, name) {
  const value = typeof args[name] === "string" ? args[name].trim() : "";
  if (!value) {
    throw new Error(`Missing --${name}`);
  }
  return value;
}

function hammingSimilarity(hashA, hashB) {
  if (hashA.length !== hashB.length || hashA.length === 0) {
    return 0;
  }

  let same = 0;
  for (let i = 0; i < hashA.length; i += 1) {
    if (hashA[i] === hashB[i]) {
      same += 1;
    }
  }
  return same / hashA.length;
}

function paletteSimilarity(a, b) {
  if (a.length === 0 || b.length === 0) {
    return 0;
  }

  const size = Math.min(a.length, b.length);
  let total = 0;
  for (let i = 0; i < size; i += 1) {
    const colorA = a[i];
    const colorB = b[i];
    const distance = Math.sqrt(
      Math.pow(colorA[0] - colorB[0], 2) +
        Math.pow(colorA[1] - colorB[1], 2) +
        Math.pow(colorA[2] - colorB[2], 2)
    );
    total += 1 - distance / 441.6729559300637;
  }
  return clamp01(total / size);
}

async function computePHash(buffer) {
  const { data, info } = await sharp(buffer)
    .removeAlpha()
    .greyscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.width !== 9 || info.height !== 8) {
    return "";
  }

  let bits = "";
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const left = data[y * 9 + x];
      const right = data[y * 9 + x + 1];
      bits += left > right ? "1" : "0";
    }
  }
  return bits;
}

async function analyzeImage(buffer) {
  const metadata = await sharp(buffer).metadata();
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .resize(128, 128, { fit: "inside", withoutEnlargement: false })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const originalWidth = metadata.width ?? width;
  const originalHeight = metadata.height ?? height;
  const pixelCount = width * height;

  let alphaPixels = 0;
  let minLuma = 255;
  let maxLuma = 0;
  let edgeCount = 0;
  let edgeTotal = 0;
  let upperAlphaPixels = 0;
  let upperPixels = 0;
  let bboxMinX = width;
  let bboxMinY = height;
  let bboxMaxX = -1;
  let bboxMaxY = -1;
  const lumaMap = new Float64Array(pixelCount);
  let noiseAccum = 0;
  let noiseCount = 0;
  const paletteBucket = new Map();

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      const pixelIndex = y * width + x;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lumaMap[pixelIndex] = luma;

      if (a > 8) {
        alphaPixels += 1;
        if (x < bboxMinX) bboxMinX = x;
        if (x > bboxMaxX) bboxMaxX = x;
        if (y < bboxMinY) bboxMinY = y;
        if (y > bboxMaxY) bboxMaxY = y;
        if (y < height * 0.45) {
          upperAlphaPixels += 1;
        }
        if (luma < minLuma) minLuma = luma;
        if (luma > maxLuma) maxLuma = luma;

        const qr = Math.round(r / 32) * 32;
        const qg = Math.round(g / 32) * 32;
        const qb = Math.round(b / 32) * 32;
        const key = `${qr}:${qg}:${qb}`;
        paletteBucket.set(key, (paletteBucket.get(key) ?? 0) + 1);
      }

      if (x > width * 0.65 && y > height * 0.65 && x < width - 1 && y < height - 1) {
        const idxRight = idx + 4;
        const idxDown = idx + width * 4;
        const dr = Math.abs(data[idx] - data[idxRight]);
        const dg = Math.abs(data[idx + 1] - data[idxRight + 1]);
        const db = Math.abs(data[idx + 2] - data[idxRight + 2]);
        const vr = Math.abs(data[idx] - data[idxDown]);
        const vg = Math.abs(data[idx + 1] - data[idxDown + 1]);
        const vb = Math.abs(data[idx + 2] - data[idxDown + 2]);
        const diff = (dr + dg + db + vr + vg + vb) / 6;
        if (diff > 26) {
          edgeCount += 1;
        }
        edgeTotal += 1;
      }

      if (x < width - 1 && y < height - 1) {
        const idxRight = idx + 4;
        const idxDown = idx + width * 4;
        const lumaRight = 0.2126 * data[idxRight] + 0.7152 * data[idxRight + 1] + 0.0722 * data[idxRight + 2];
        const lumaDown = 0.2126 * data[idxDown] + 0.7152 * data[idxDown + 1] + 0.0722 * data[idxDown + 2];
        noiseAccum += Math.abs(luma - lumaRight) + Math.abs(luma - lumaDown);
        noiseCount += 2;
      }

      if (y < height * 0.45) {
        upperPixels += 1;
      }
    }
  }

  const palette = [...paletteBucket.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([key]) => key.split(":").map((part) => Number.parseInt(part, 10)));

  let blurMean = 0;
  let blurSqMean = 0;
  let blurCount = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const lap = 4 * lumaMap[i] - lumaMap[i - 1] - lumaMap[i + 1] - lumaMap[i - width] - lumaMap[i + width];
      blurMean += lap;
      blurSqMean += lap * lap;
      blurCount += 1;
    }
  }

  const blurAvg = blurCount > 0 ? blurMean / blurCount : 0;
  const blurVariance = blurCount > 0 ? Math.max(0, blurSqMean / blurCount - blurAvg * blurAvg) : 0;
  const bboxWidth = bboxMaxX >= bboxMinX ? bboxMaxX - bboxMinX + 1 : 0;
  const bboxHeight = bboxMaxY >= bboxMinY ? bboxMaxY - bboxMinY + 1 : 0;
  const bboxArea = bboxWidth * bboxHeight;
  const bboxOccupancy = pixelCount > 0 ? bboxArea / pixelCount : 0;
  const bboxCenterX = bboxWidth > 0 ? (bboxMinX + bboxWidth / 2) / width : 0.5;
  const bboxCenterY = bboxHeight > 0 ? (bboxMinY + bboxHeight / 2) / height : 0.5;
  const bboxScale = pixelCount > 0 ? Math.sqrt(Math.max(0, bboxArea / pixelCount)) : 0;
  const alphaCoverage = pixelCount > 0 ? alphaPixels / pixelCount : 0;
  const contrast = maxLuma - minLuma;
  const edgeDensityBottomRight = edgeTotal > 0 ? edgeCount / edgeTotal : 0;
  const upperFaceCoverage = upperPixels > 0 ? upperAlphaPixels / upperPixels : 0;
  const blurScore = blurVariance;
  const noiseScore = noiseCount > 0 ? noiseAccum / noiseCount : 0;
  const watermarkTextRisk = clamp01(edgeDensityBottomRight * 1.6 + Math.max(0, contrast - 55) / 220);

  return {
    originalWidth,
    originalHeight,
    alphaCoverage,
    bboxOccupancy,
    bboxCenterX,
    bboxCenterY,
    bboxScale,
    contrast,
    blurScore,
    noiseScore,
    watermarkTextRisk,
    edgeDensityBottomRight,
    upperFaceCoverage,
    phash: await computePHash(buffer),
    palette
  };
}

function scoreResolutionQuality(analysis) {
  const minDimension = Math.min(analysis.originalWidth, analysis.originalHeight);
  if (minDimension >= 1024) return 1;
  if (minDimension <= 256) return 0;
  return clamp01((minDimension - 256) / 768);
}

function scoreBBoxOccupancy(analysis) {
  const target = 0.48;
  const distance = Math.abs(analysis.bboxOccupancy - target);
  return clamp01(1 - distance / 0.45);
}

function scoreAlphaCoverage(analysis) {
  const target = 0.42;
  const distance = Math.abs(analysis.alphaCoverage - target);
  return clamp01(1 - distance / 0.5);
}

function scoreSharpness(analysis) {
  return clamp01(analysis.blurScore / 2600);
}

function scoreNoise(analysis) {
  return clamp01(1 - analysis.noiseScore / 70);
}

function scoreWatermarkSafety(analysis) {
  return clamp01(1 - analysis.watermarkTextRisk);
}

function computeQualityScore(analysis) {
  const alphaScore = scoreAlphaCoverage(analysis);
  const occupancyScore = scoreBBoxOccupancy(analysis);
  const sharpnessScore = scoreSharpness(analysis);
  const noiseScore = scoreNoise(analysis);
  const watermarkScore = scoreWatermarkSafety(analysis);
  const resolutionScore = scoreResolutionQuality(analysis);
  const qualityScore = clamp01(
    alphaScore * 0.16 +
      occupancyScore * 0.18 +
      sharpnessScore * 0.2 +
      noiseScore * 0.12 +
      watermarkScore * 0.2 +
      resolutionScore * 0.14
  );

  return {
    qualityScore,
    alphaScore,
    occupancyScore,
    sharpnessScore,
    noiseScore,
    watermarkScore,
    resolutionScore
  };
}

function scoreConsistencyAgainstFront(analysis, frontAnalysis) {
  const phash = hammingSimilarity(analysis.phash, frontAnalysis.phash);
  const palette = paletteSimilarity(analysis.palette, frontAnalysis.palette);
  const centerDistance = Math.sqrt(
    Math.pow(analysis.bboxCenterX - frontAnalysis.bboxCenterX, 2) +
      Math.pow(analysis.bboxCenterY - frontAnalysis.bboxCenterY, 2)
  );
  const bboxCenter = clamp01(1 - centerDistance / 0.5);
  const bboxScale = clamp01(1 - Math.abs(analysis.bboxScale - frontAnalysis.bboxScale) / 0.45);
  const score = clamp01(phash * 0.42 + palette * 0.22 + bboxCenter * 0.18 + bboxScale * 0.18);
  return {
    score,
    parts: { phash, palette, bboxCenter, bboxScale }
  };
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

async function analyzeSet(dirPath, label) {
  const resolvedDir = path.resolve(dirPath);
  const result = {
    label,
    dirPath: resolvedDir,
    views: {},
    aggregate: {
      averageQualityScore: 0,
      averageSideConsistencyScore: 0
    }
  };

  const frontBuffer = fs.readFileSync(path.join(resolvedDir, "front.png"));
  const frontAnalysis = await analyzeImage(frontBuffer);

  let totalQuality = 0;
  let totalSideConsistency = 0;
  let sideCount = 0;

  for (const view of DEFAULT_VIEWS) {
    const imagePath = path.join(resolvedDir, `${view}.png`);
    const summaryPath = path.join(resolvedDir, `${view}_workflow_summary.json`);
    const buffer = fs.readFileSync(imagePath);
    const stat = fs.statSync(imagePath);
    const analysis = view === "front" ? frontAnalysis : await analyzeImage(buffer);
    const quality = computeQualityScore(analysis);
    const consistency =
      view === "front"
        ? { score: 1, parts: { phash: 1, palette: 1, bboxCenter: 1, bboxScale: 1 } }
        : scoreConsistencyAgainstFront(analysis, frontAnalysis);

    totalQuality += quality.qualityScore;
    if (view !== "front") {
      totalSideConsistency += consistency.score;
      sideCount += 1;
    }

    result.views[view] = {
      imagePath,
      fileSizeBytes: stat.size,
      workflowSummary: readJsonIfExists(summaryPath),
      analysis,
      quality,
      consistency
    };
  }

  result.aggregate.averageQualityScore = totalQuality / DEFAULT_VIEWS.length;
  result.aggregate.averageSideConsistencyScore = sideCount > 0 ? totalSideConsistency / sideCount : 0;
  return result;
}

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pct(value) {
  return Number(value).toFixed(3);
}

function buildHtml(report, outDir) {
  const summaryCards = [
    {
      title: report.left.label,
      quality: report.left.aggregate.averageQualityScore,
      consistency: report.left.aggregate.averageSideConsistencyScore
    },
    {
      title: report.right.label,
      quality: report.right.aggregate.averageQualityScore,
      consistency: report.right.aggregate.averageSideConsistencyScore
    }
  ]
    .map(
      (card) =>
        `<section class="card"><h2>${esc(card.title)}</h2><p>avg quality: <strong>${pct(card.quality)}</strong></p><p>avg side consistency: <strong>${pct(card.consistency)}</strong></p></section>`
    )
    .join("");

  const rows = DEFAULT_VIEWS.map((view) => {
    const left = report.left.views[view];
    const right = report.right.views[view];
    const leftSummary = left.workflowSummary ?? {};
    const rightSummary = right.workflowSummary ?? {};
    return `<section class="row"><h2>${esc(view)}</h2><div class="grid"><div class="panel"><h3>${esc(
      report.left.label
    )}</h3><img src="./left_${esc(view)}.png" alt="${esc(report.left.label)} ${esc(view)}"/><table><tbody><tr><th>mode</th><td>${esc(
      leftSummary.mode ?? "-"
    )}</td></tr><tr><th>quality</th><td>${pct(left.quality.qualityScore)}</td></tr><tr><th>consistency</th><td>${pct(
      left.consistency.score
    )}</td></tr><tr><th>resolution</th><td>${esc(left.analysis.originalWidth)}x${esc(
      left.analysis.originalHeight
    )}</td></tr><tr><th>file size</th><td>${Math.round(left.fileSizeBytes / 1024)} KB</td></tr></tbody></table></div><div class="panel"><h3>${esc(
      report.right.label
    )}</h3><img src="./right_${esc(view)}.png" alt="${esc(report.right.label)} ${esc(view)}"/><table><tbody><tr><th>mode</th><td>${esc(
      rightSummary.mode ?? "-"
    )}</td></tr><tr><th>quality</th><td>${pct(right.quality.qualityScore)}</td></tr><tr><th>consistency</th><td>${pct(
      right.consistency.score
    )}</td></tr><tr><th>resolution</th><td>${esc(right.analysis.originalWidth)}x${esc(
      right.analysis.originalHeight
    )}</td></tr><tr><th>file size</th><td>${Math.round(right.fileSizeBytes / 1024)} KB</td></tr></tbody></table></div></div></section>`;
  }).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Character View Compare</title>
<style>
body{font-family:Georgia,serif;background:#f3efe7;color:#1b1b1b;margin:0;padding:24px}
h1,h2,h3{margin:0 0 12px}
.lede{max-width:900px;margin:0 0 20px}
.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin-bottom:24px}
.card,.panel,.row{background:#fff;border:1px solid #d9d0c3;border-radius:18px;padding:18px;box-shadow:0 10px 30px rgba(0,0,0,.06)}
.row{margin-bottom:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}
img{display:block;width:100%;height:auto;border-radius:14px;border:1px solid #d9d0c3;background:#faf8f3}
table{width:100%;border-collapse:collapse;margin-top:12px}
th,td{text-align:left;padding:6px 0;border-bottom:1px solid #eee3d3;font-size:14px}
th{width:120px;color:#6f6556}
.delta{font-weight:700}
</style>
</head>
<body>
<h1>Character View Compare</h1>
<p class="lede">Left vs right comparison using the same internal-style metrics for image quality and front-to-side consistency. Report generated into ${esc(
    outDir
  )}.</p>
<section class="summary">${summaryCards}</section>
<section class="card"><h2>Delta</h2><p class="delta">avg quality: ${pct(
    report.delta.averageQualityScore
  )}</p><p class="delta">avg side consistency: ${pct(report.delta.averageSideConsistencyScore)}</p></section>
${rows}
</body>
</html>`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const leftDir = requireArg(args, "left");
  const rightDir = requireArg(args, "right");
  const outDir = path.resolve(requireArg(args, "out"));
  const leftLabel = args.leftLabel?.trim() || "baseline";
  const rightLabel = args.rightLabel?.trim() || "candidate";

  fs.mkdirSync(outDir, { recursive: true });

  const left = await analyzeSet(leftDir, leftLabel);
  const right = await analyzeSet(rightDir, rightLabel);
  const report = {
    generatedAt: new Date().toISOString(),
    left,
    right,
    delta: {
      averageQualityScore: right.aggregate.averageQualityScore - left.aggregate.averageQualityScore,
      averageSideConsistencyScore:
        right.aggregate.averageSideConsistencyScore - left.aggregate.averageSideConsistencyScore
    }
  };

  for (const view of DEFAULT_VIEWS) {
    fs.copyFileSync(path.join(left.dirPath, `${view}.png`), path.join(outDir, `left_${view}.png`));
    fs.copyFileSync(path.join(right.dirPath, `${view}.png`), path.join(outDir, `right_${view}.png`));
  }

  fs.writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outDir, "report.html"), `${buildHtml(report, outDir)}\n`, "utf8");

  console.log(JSON.stringify({
    outDir,
    left: {
      label: left.label,
      averageQualityScore: Number(left.aggregate.averageQualityScore.toFixed(4)),
      averageSideConsistencyScore: Number(left.aggregate.averageSideConsistencyScore.toFixed(4))
    },
    right: {
      label: right.label,
      averageQualityScore: Number(right.aggregate.averageQualityScore.toFixed(4)),
      averageSideConsistencyScore: Number(right.aggregate.averageSideConsistencyScore.toFixed(4))
    },
    delta: {
      averageQualityScore: Number(report.delta.averageQualityScore.toFixed(4)),
      averageSideConsistencyScore: Number(report.delta.averageSideConsistencyScore.toFixed(4))
    }
  }, null, 2));
}

await main();
