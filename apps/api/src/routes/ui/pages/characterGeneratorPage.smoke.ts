import { buildCharacterGeneratorPageBody, buildCharacterGeneratorStatusScript } from "./characterGeneratorPage";

function assertIncludes(haystack: string, needle: string, label: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(`Missing ${label}: expected to find "${needle}"`);
  }
}

const html = buildCharacterGeneratorPageBody({
  topSection: "<section>top</section>",
  selectedSection: '<section id="selected">selected</section>',
  recommendedActionsSection: '<section id="recommended-actions">recommended</section>',
  regenerateSection: '<section id="regenerate-view">regenerate</section>',
  recreateSection: '<section id="recreate-pack">recreate</section>',
  pickSection: '<section id="pick-candidates">pick</section>',
  previewSection: "<section>preview</section>",
  rollbackSection: "<section>rollback</section>",
  compareSection: "<section>compare</section>",
  rows: '<tr><td>job</td><td>episode</td><td>topic</td><td>status</td><td>0%</td><td>manifest</td><td>now</td></tr>',
  statusScript: "<script>status</script>"
});

assertIncludes(html, 'id="selected"', "selected section");
assertIncludes(html, 'id="recommended-actions"', "recommended actions section");
assertIncludes(html, 'id="regenerate-view"', "regenerate section");
assertIncludes(html, 'id="recreate-pack"', "recreate section");
assertIncludes(html, 'id="pick-candidates"', "pick section");
assertIncludes(html, "Recent Generation Runs", "jobs section heading");

const statusScript = buildCharacterGeneratorStatusScript();
assertIncludes(statusScript, "coherence=", "coherence status fragment");
assertIncludes(statusScript, "reroute=", "auto reroute status fragment");
assertIncludes(statusScript, "rig=", "rig status fragment");
assertIncludes(statusScript, "selection-risk=", "selection risk status fragment");
assertIncludes(statusScript, "quality-embargo=", "quality embargo status fragment");
assertIncludes(statusScript, "final-firewall=", "final quality firewall status fragment");
assertIncludes(statusScript, "decision=", "decision outcome status fragment");
assertIncludes(statusScript, "route=", "workflow route status fragment");
assertIncludes(statusScript, "preflight=", "preflight status fragment");
assertIncludes(statusScript, "stage=", "stage status fragment");
assertIncludes(statusScript, "next=", "recommended action status fragment");

console.log("[character-generator-page-smoke] PASS");
