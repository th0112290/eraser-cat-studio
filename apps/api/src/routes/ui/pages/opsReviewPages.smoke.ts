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
assertIncludes(repairHtml, "Reading order", "repair reading order");
assertIncludes(repairHtml, "Recovery rail", "repair recovery rail");
assertIncludes(repairHtml, "Artifact evidence drawer", "repair evidence drawer");

const routeHtml = buildRouteReasonPageBody(baseInput);
assertIncludes(routeHtml, "Route Reason Explorer", "route explorer title");
assertIncludes(routeHtml, 'id="route-reason-table"', "route table id");
assertIncludes(routeHtml, "route_reason", "route reason heading");
assertIncludes(routeHtml, "Reading order", "route reading order");
assertIncludes(routeHtml, "Recovery rail", "route recovery rail");
assertIncludes(routeHtml, "Artifact evidence drawer", "route evidence drawer");

const lineageHtml = buildDatasetLineagePageBody(baseInput);
assertIncludes(lineageHtml, "Dataset Lineage Viewer", "lineage viewer title");
assertIncludes(lineageHtml, 'id="dataset-lineage-table"', "lineage table id");
assertIncludes(lineageHtml, "Lineage Rows", "lineage table title");
assertIncludes(lineageHtml, "Reading order", "lineage reading order");
assertIncludes(lineageHtml, "Recovery rail", "lineage recovery rail");
assertIncludes(lineageHtml, "Artifact evidence drawer", "lineage evidence drawer");

console.log("[ops-review-pages-smoke] PASS");
