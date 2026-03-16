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
assertIncludes(html, "최근 생성 작업", "jobs section heading");

const statusScript = buildCharacterGeneratorStatusScript();
assertIncludes(statusScript, "일관성=", "coherence status fragment");
assertIncludes(statusScript, "재라우팅=", "auto reroute status fragment");
assertIncludes(statusScript, "선택위험=", "selection risk status fragment");
assertIncludes(statusScript, "품질보류=", "quality embargo status fragment");
assertIncludes(statusScript, "최종방화벽=", "final quality firewall status fragment");
assertIncludes(statusScript, "판단=", "decision outcome status fragment");
assertIncludes(statusScript, "경로=", "workflow route status fragment");
assertIncludes(statusScript, "사전점검=", "preflight status fragment");
assertIncludes(statusScript, "단계=", "stage status fragment");
assertIncludes(statusScript, "다음=", "recommended action status fragment");

console.log("[character-generator-page-smoke] PASS");
