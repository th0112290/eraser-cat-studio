import {
  buildDatasetLineagePageBody,
  buildRepairAcceptancePageBody,
  buildRouteReasonPageBody
} from "./opsReviewPages";

function assertIncludes(haystack: string, needle: string, label: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(`Missing ${label}: expected to find "${needle}"`);
  }
}

const baseInput = {
  flash: '<div class="notice">ok</div>',
  filters: '<form id="ops-review-filters"></form>',
  summaryCards: '<div class="summary-card">summary</div>',
  notes: '<div class="ops-review-note">note</div>',
  rows: "<tr><td>row</td><td>state</td><td>source</td></tr>"
};

const repairHtml = buildRepairAcceptancePageBody(baseInput);
assertIncludes(repairHtml, "Repair / Acceptance Explorer", "repair explorer title");
assertIncludes(repairHtml, 'id="repair-acceptance-table"', "repair table id");
assertIncludes(repairHtml, 'data-table-filter="repair-acceptance-table"', "repair table filter");

const routeHtml = buildRouteReasonPageBody(baseInput);
assertIncludes(routeHtml, "Route Reason Explorer", "route explorer title");
assertIncludes(routeHtml, 'id="route-reason-table"', "route table id");
assertIncludes(routeHtml, "route_reason", "route reason heading");

const lineageHtml = buildDatasetLineagePageBody(baseInput);
assertIncludes(lineageHtml, "Dataset Lineage Viewer", "lineage viewer title");
assertIncludes(lineageHtml, 'id="dataset-lineage-table"', "lineage table id");
assertIncludes(lineageHtml, "Lineage Rows", "lineage table title");

console.log("[ops-review-pages-smoke] PASS");
