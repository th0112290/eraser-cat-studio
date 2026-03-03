import assert from "node:assert/strict";
import { buildWeeklyReport, startOfUtcWeek, weeklyReportToCsv, type WeeklyReportRow } from "./reportService";

function main() {
  const rows: WeeklyReportRow[] = [
    {
      observedAt: new Date("2026-03-02T10:00:00.000Z"),
      metricKey: "views",
      value: 100,
      experimentId: "exp1",
      experimentName: "Thumb Test",
      variantId: "varA",
      variantKey: "A"
    },
    {
      observedAt: new Date("2026-03-03T10:00:00.000Z"),
      metricKey: "views",
      value: 120,
      experimentId: "exp1",
      experimentName: "Thumb Test",
      variantId: "varB",
      variantKey: "B"
    },
    {
      observedAt: new Date("2026-03-04T10:00:00.000Z"),
      metricKey: "ctr",
      value: 0.11,
      experimentId: "exp1",
      experimentName: "Thumb Test",
      variantId: "varA",
      variantKey: "A"
    },
    {
      observedAt: new Date("2026-03-10T10:00:00.000Z"),
      metricKey: "views",
      value: 999
    }
  ];

  const report = buildWeeklyReport(rows, startOfUtcWeek(new Date("2026-03-02T00:00:00.000Z")), 1);

  assert.equal(report.weekStart, "2026-03-02");
  assert.equal(report.weekEnd, "2026-03-08");
  assert.equal(report.totalSamples, 3);

  const views = report.totalsByMetric.find((item) => item.metricKey === "views");
  assert.ok(views);
  assert.equal(views.total, 220);
  assert.equal(views.samples, 2);

  const ctr = report.totalsByMetric.find((item) => item.metricKey === "ctr");
  assert.ok(ctr);
  assert.equal(ctr.total, 0.11);
  assert.equal(ctr.samples, 1);

  assert.equal(report.totalsByVariant.length, 2);

  const csv = weeklyReportToCsv(report);
  assert.ok(csv.includes("section,weekStart,weekEnd"));
  assert.ok(csv.includes("metric,2026-03-02,2026-03-08,ctr"));
  assert.ok(csv.includes("variant,2026-03-02,2026-03-08,,exp1"));

  console.log("[api] report service smoke passed");
}

main();
