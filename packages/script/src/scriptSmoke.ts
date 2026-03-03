import assert from "node:assert/strict";
import { applyTemplate } from "./applyTemplate";
import { fitToDuration } from "./fitToDuration";
import { qaScript } from "./qaScript";

function run(): void {
  const outline = applyTemplate("Solar energy basics", [
    {
      text: "Solar cost per watt has declined over the last decade in many markets.",
      source: {
        sourceId: "nrel-2024",
        title: "NREL cost trends",
        url: "https://example.com/nrel"
      }
    },
    {
      text: "Grid reliability still depends on storage and distribution upgrades.",
      source: {
        sourceId: "iea-2025",
        title: "IEA grid flexibility brief",
        url: "https://example.com/iea"
      }
    }
  ]);

  assert.equal(outline.sections[0]?.name, "Hook");
  assert.equal(outline.sections[1]?.name, "Development");
  assert.equal(outline.sections[2]?.name, "Payoff");
  assert.ok(outline.sources.length >= 2);

  const script = outline.sections
    .flatMap((section) => section.points.map((point) => point.text))
    .join(" ");

  const firstFit = fitToDuration(script, 140);
  const secondFit = fitToDuration(script, 140);
  assert.equal(firstFit.fittedText, secondFit.fittedText);
  assert.equal(firstFit.targetMinutes, 10);
  assert.ok(firstFit.actualWords > 0);

  const firstQa = qaScript(firstFit.fittedText);
  const secondQa = qaScript(firstFit.fittedText);
  assert.equal(JSON.stringify(firstQa), JSON.stringify(secondQa));

  console.log("[script] smoke passed");
}

run();
