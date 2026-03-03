import assert from "node:assert/strict";
import { buildScheduleDates } from "./scheduleService";

function toKeys(dates: Date[]): string[] {
  return dates.map((item) => item.toISOString().slice(0, 10));
}

function testMondayWindow() {
  const startDate = new Date(Date.UTC(2026, 2, 2, 15, 0, 0)); // 2026-03-02 (Mon)
  const planned = buildScheduleDates({
    startDate,
    days: 7,
    episodesPerWeek: 3
  });

  assert.deepEqual(toKeys(planned), ["2026-03-02", "2026-03-04", "2026-03-06"]);
}

function testSaturdayWindow() {
  const startDate = new Date(Date.UTC(2026, 2, 7, 3, 0, 0)); // 2026-03-07 (Sat)
  const planned = buildScheduleDates({
    startDate,
    days: 7,
    episodesPerWeek: 3
  });

  assert.deepEqual(toKeys(planned), ["2026-03-09", "2026-03-11", "2026-03-13"]);
}

function testDeterministic() {
  const input = {
    startDate: new Date(Date.UTC(2026, 2, 5, 22, 0, 0)),
    days: 7,
    episodesPerWeek: 3
  };

  const first = toKeys(buildScheduleDates(input));
  const second = toKeys(buildScheduleDates(input));

  assert.deepEqual(first, second);
}

function main() {
  testMondayWindow();
  testSaturdayWindow();
  testDeterministic();
  console.log("[api] schedule service smoke passed");
}

main();
