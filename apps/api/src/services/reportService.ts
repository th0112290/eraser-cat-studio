export type WeeklyReportRow = {
  observedAt: Date;
  metricKey: string;
  value: number;
  experimentId?: string | null;
  experimentName?: string | null;
  variantId?: string | null;
  variantKey?: string | null;
};

export type WeeklyMetricSummary = {
  metricKey: string;
  total: number;
  average: number;
  samples: number;
};

export type WeeklyVariantSummary = {
  experimentId: string;
  experimentName: string;
  variantId: string;
  variantKey: string;
  total: number;
  average: number;
  samples: number;
};

export type WeeklyReport = {
  weekStart: string;
  weekEnd: string;
  weeks: number;
  totalSamples: number;
  totalsByMetric: WeeklyMetricSummary[];
  totalsByVariant: WeeklyVariantSummary[];
};

function toStartOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(base: Date, days: number): Date {
  const shifted = new Date(base);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function toCsvField(value: string | number): string {
  const stringValue = String(value);
  if (stringValue.includes(",") || stringValue.includes("\"") || stringValue.includes("\n")) {
    return `"${stringValue.replaceAll("\"", "\"\"")}"`;
  }
  return stringValue;
}

export function startOfUtcWeek(date: Date): Date {
  const dayStart = toStartOfUtcDay(date);
  const day = dayStart.getUTCDay();
  const offsetFromMonday = (day + 6) % 7;
  return addUtcDays(dayStart, -offsetFromMonday);
}

export function buildWeeklyReport(rows: WeeklyReportRow[], weekStart: Date, weeks: number): WeeklyReport {
  if (!Number.isInteger(weeks) || weeks <= 0) {
    throw new Error("weeks must be a positive integer");
  }

  const start = startOfUtcWeek(weekStart);
  const end = addUtcDays(start, weeks * 7);

  const filtered = rows.filter((row) => row.observedAt >= start && row.observedAt < end);

  const metricMap = new Map<string, { total: number; samples: number }>();
  const variantMap = new Map<string, WeeklyVariantSummary>();

  for (const row of filtered) {
    const metricEntry = metricMap.get(row.metricKey) ?? { total: 0, samples: 0 };
    metricEntry.total += row.value;
    metricEntry.samples += 1;
    metricMap.set(row.metricKey, metricEntry);

    if (row.experimentId && row.variantId) {
      const key = `${row.experimentId}|${row.variantId}`;
      const existing = variantMap.get(key) ?? {
        experimentId: row.experimentId,
        experimentName: row.experimentName ?? row.experimentId,
        variantId: row.variantId,
        variantKey: row.variantKey ?? row.variantId,
        total: 0,
        average: 0,
        samples: 0
      };

      existing.total += row.value;
      existing.samples += 1;
      variantMap.set(key, existing);
    }
  }

  const totalsByMetric: WeeklyMetricSummary[] = Array.from(metricMap.entries())
    .map(([metricKey, item]) => ({
      metricKey,
      total: round(item.total),
      average: round(item.samples === 0 ? 0 : item.total / item.samples),
      samples: item.samples
    }))
    .sort((a, b) => a.metricKey.localeCompare(b.metricKey));

  const totalsByVariant: WeeklyVariantSummary[] = Array.from(variantMap.values())
    .map((item) => ({
      ...item,
      total: round(item.total),
      average: round(item.samples === 0 ? 0 : item.total / item.samples)
    }))
    .sort((a, b) => {
      const experimentCompare = a.experimentId.localeCompare(b.experimentId);
      if (experimentCompare !== 0) {
        return experimentCompare;
      }
      return a.variantKey.localeCompare(b.variantKey);
    });

  return {
    weekStart: dateKey(start),
    weekEnd: dateKey(addUtcDays(end, -1)),
    weeks,
    totalSamples: filtered.length,
    totalsByMetric,
    totalsByVariant
  };
}

export function weeklyReportToCsv(report: WeeklyReport): string {
  const lines: string[] = [
    "section,weekStart,weekEnd,metricKey,experimentId,experimentName,variantId,variantKey,total,average,samples"
  ];

  for (const item of report.totalsByMetric) {
    lines.push(
      [
        "metric",
        report.weekStart,
        report.weekEnd,
        item.metricKey,
        "",
        "",
        "",
        "",
        item.total,
        item.average,
        item.samples
      ]
        .map((value) => toCsvField(value))
        .join(",")
    );
  }

  for (const item of report.totalsByVariant) {
    lines.push(
      [
        "variant",
        report.weekStart,
        report.weekEnd,
        "",
        item.experimentId,
        item.experimentName,
        item.variantId,
        item.variantKey,
        item.total,
        item.average,
        item.samples
      ]
        .map((value) => toCsvField(value))
        .join(",")
    );
  }

  return lines.join("\n");
}
