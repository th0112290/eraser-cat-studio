import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(REPO_ROOT, "refs", "cat_quality_input", "derived");
const SIZE = 1024;
const workerRequire = createRequire(path.join(REPO_ROOT, "apps", "worker", "package.json"));
const sharp = workerRequire("sharp");

function writeSvgPng(fileName, svg) {
  const outPath = path.join(OUT_DIR, fileName);
  return sharp(Buffer.from(svg)).png().toFile(outPath).then(() => outPath);
}

function wrapSvg(inner) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">`,
    inner,
    "</svg>"
  ].join("");
}

const commonStroke = `stroke="#111111" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"`;
const commonFill = `fill="#ffffff"`;

const frontSvg = wrapSvg(`
  <g ${commonFill} ${commonStroke}>
    <path d="M296 250 L360 120 L444 248 Z" />
    <path d="M580 248 L664 120 L728 250 Z" />
    <rect x="214" y="188" width="596" height="416" rx="108" />
    <path d="M378 590 H646 V824 Q646 878 590 878 H434 Q378 878 378 824 Z" />
    <path d="M316 598 Q286 628 286 688 V766 Q286 818 334 818 H356" />
    <path d="M708 598 Q738 628 738 688 V766 Q738 818 690 818 H668" />
    <path d="M676 742 Q776 740 824 802 Q852 838 822 858 Q760 892 684 852" />
    <circle cx="838" cy="870" r="24" />
    <circle cx="906" cy="844" r="16" />
  </g>
  <g fill="#111111">
    <ellipse cx="382" cy="376" rx="22" ry="40" />
    <ellipse cx="640" cy="376" rx="22" ry="40" />
    <rect x="466" y="414" width="92" height="16" rx="8" />
    <rect x="300" y="430" width="70" height="12" rx="6" transform="rotate(-8 335 436)" />
    <rect x="298" y="470" width="78" height="12" rx="6" transform="rotate(-18 337 476)" />
    <rect x="646" y="430" width="70" height="12" rx="6" transform="rotate(8 681 436)" />
    <rect x="640" y="470" width="78" height="12" rx="6" transform="rotate(18 679 476)" />
    <path d="M734 780 Q774 798 792 830" ${commonStroke} fill="none" />
  </g>
`);

const threeQuarterSvg = wrapSvg(`
  <g ${commonFill} ${commonStroke}>
    <path d="M324 246 L392 126 L470 246 Z" />
    <path d="M596 248 L654 150 L714 250 Z" />
    <path d="M248 218 Q280 168 356 168 H648 Q740 168 772 228 Q792 268 792 342 V474 Q792 554 740 596 Q704 626 632 630 H350 Q272 630 236 590 Q204 554 204 492 V320 Q204 258 248 218 Z" />
    <path d="M388 592 Q420 578 494 578 H626 V822 Q626 874 576 874 H452 Q388 874 388 816 Z" />
    <path d="M332 630 Q296 658 296 726 V786 Q296 830 336 830 H356" />
    <path d="M646 654 Q752 684 822 776 Q846 810 822 838 Q770 884 694 864" />
    <circle cx="808" cy="856" r="22" />
    <circle cx="874" cy="824" r="16" />
  </g>
  <g fill="#111111">
    <ellipse cx="430" cy="390" rx="22" ry="42" />
    <ellipse cx="594" cy="394" rx="16" ry="34" />
    <ellipse cx="518" cy="452" rx="34" ry="20" />
    <rect x="486" y="486" width="88" height="14" rx="7" transform="rotate(8 530 493)" />
    <rect x="308" y="438" width="76" height="12" rx="6" transform="rotate(-18 346 444)" />
    <rect x="312" y="476" width="84" height="12" rx="6" transform="rotate(-12 354 482)" />
    <rect x="620" y="444" width="56" height="10" rx="5" transform="rotate(10 648 449)" />
    <rect x="618" y="476" width="62" height="10" rx="5" transform="rotate(18 649 481)" />
    <path d="M676 730 Q748 748 792 804" ${commonStroke} fill="none" />
  </g>
`);

const profileSvg = wrapSvg(`
  <g ${commonFill} ${commonStroke}>
    <path d="M378 246 L458 126 L516 254 Z" />
    <path d="M304 218 Q346 178 428 178 H624 Q700 178 734 222 Q762 256 762 324 V470 Q762 550 716 592 Q680 626 608 632 H438 Q384 632 350 604 Q296 562 296 478 V294 Q296 246 332 226 Z" />
    <path d="M420 610 Q444 592 510 592 H598 V838 Q598 880 558 880 H458 Q408 880 408 830 Z" />
    <path d="M624 664 Q748 694 822 780 Q848 810 824 838 Q770 886 686 868" />
    <circle cx="812" cy="854" r="22" />
    <path d="M340 640 Q312 664 312 726 V794 Q312 836 350 836 H368" />
  </g>
  <g fill="#111111">
    <ellipse cx="438" cy="390" rx="22" ry="42" />
    <rect x="320" y="446" width="62" height="12" rx="6" transform="rotate(-18 351 452)" />
    <rect x="472" y="454" width="88" height="14" rx="7" transform="rotate(6 516 461)" />
    <rect x="478" y="494" width="72" height="12" rx="6" transform="rotate(4 514 500)" />
    <path d="M666 738 Q742 754 786 808" ${commonStroke} fill="none" />
  </g>
`);

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outputs = await Promise.all([
    writeSvgPng("front_composition.png", frontSvg),
    writeSvgPng("threeQuarter_composition.png", threeQuarterSvg),
    writeSvgPng("profile_composition.png", profileSvg)
  ]);
  console.log(JSON.stringify({ ok: true, outputs }, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exit(1);
});
