function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

type CharacterGeneratorTopInput = {
  message?: string;
  error?: string;
  styleOptions: string;
  speciesOptions: string;
  referenceOptions: string;
  defaultSeed: number;
  forbiddenTermsSummary: string;
  negativeTermsSummary: string;
};

function buildCharacterGeneratorPageStyles(): string {
  return `<style>
.cg-page-shell{display:grid;gap:14px}
.cg-top-card{padding:0;overflow:hidden;border-color:#b6d6d8;background:linear-gradient(180deg,#fffefd,#f5faf8 36%,#edf4f7)}
.cg-top-layout{display:grid;grid-template-columns:minmax(0,1.52fr) minmax(300px,.92fr);gap:0}
.cg-hero{display:grid;gap:18px;padding:24px 24px 20px;position:relative}
.cg-hero::after{content:"";position:absolute;left:-56px;bottom:-90px;width:280px;height:280px;border-radius:999px;background:radial-gradient(circle,#0e7a7416 0,#0e7a7400 72%);pointer-events:none}
.cg-eyebrow{display:inline-flex;align-items:center;gap:8px;align-self:start;padding:7px 12px;border-radius:999px;border:1px solid #bfd8d5;background:#eef9f7;color:#0d4b48;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.cg-title-row{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
.cg-title-block h1{margin:0;font-size:35px;letter-spacing:-.04em}
.cg-subtitle{margin:8px 0 0;max-width:780px;color:#425466;font-size:14px;line-height:1.65}
.cg-metric-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.cg-metric{display:grid;gap:4px;padding:12px 14px;border:1px solid #d6e6e3;border-radius:16px;background:linear-gradient(180deg,#ffffffde,#f4fbfa);box-shadow:inset 0 1px 0 #fff}
.cg-metric-label{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#5a6b79;font-weight:800}
.cg-metric-value{font-size:15px;font-weight:800;color:#102126}
.cg-flow-grid{display:grid;gap:10px;grid-template-columns:repeat(3,minmax(0,1fr))}
.cg-flow-step{display:grid;gap:6px;padding:14px;border:1px solid #d3e4e5;border-radius:16px;background:linear-gradient(180deg,#ffffff,#f4fbfa)}
.cg-flow-step strong{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#265a63}
.cg-flow-step span{font-size:13px;color:#4b6170;line-height:1.5}
.cg-status-stack{display:grid;gap:10px}
.cg-summary-note{padding:12px 14px;border-radius:12px;border:1px solid #d7e6e3;background:linear-gradient(180deg,#f9fdfd,#f1f7f6);color:#35515c;font-size:13px;line-height:1.55}
.cg-summary-note strong{color:#14353b}
.cg-top-card .notice,.cg-top-card .error{margin:0}
.cg-ops-rail{display:grid;gap:14px;padding:24px;border-left:1px solid #d8e8e5;background:linear-gradient(180deg,#ecf8f6,#f8fbff)}
.cg-ops-card{display:grid;gap:10px;padding:14px;border:1px solid #cfe2e7;border-radius:16px;background:#ffffffc7;box-shadow:inset 0 1px 0 #fff}
.cg-ops-card h2{margin:0;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#255c62}
.cg-ops-list{display:grid;gap:10px}
.cg-ops-item{display:grid;gap:3px;padding:10px 12px;border-radius:12px;background:#f6fbfc;border:1px solid #d7e7eb}
.cg-ops-item strong{font-size:13px}
.cg-ops-item span{font-size:12px;color:#4f6270;line-height:1.45}
.cg-nav-stack{display:grid;gap:10px}
.cg-nav-note{margin:0;color:#4f6270;font-size:12px;line-height:1.5}
.cg-link-list{display:flex;flex-wrap:wrap;gap:8px}
.cg-link-list a,.cg-link-list button,.cg-inline-links a,.cg-inline-links button{display:inline-flex;align-items:center;padding:7px 11px;border-radius:999px;border:1px solid #bed5dd;background:#fff;color:#0f4e6a;font-size:12px;font-weight:800}
.cg-link-list button,.cg-inline-links button{appearance:none;cursor:pointer}
.cg-link-list a:hover,.cg-link-list button:hover,.cg-inline-links a:hover,.cg-inline-links button:hover{text-decoration:none;background:#eef7ff}
.cg-form-shell{display:grid;gap:14px;padding:0 24px 24px}
.cg-form-block{display:grid;gap:14px;padding:18px;border:1px solid #d3e2e7;border-radius:18px;background:linear-gradient(180deg,#ffffffeb,#f7fbfb)}
.cg-form-head{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap}
.cg-step{display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:34px;padding:0 10px;border-radius:999px;background:linear-gradient(180deg,#0f766e,#0c635d);color:#effffb;font-size:13px;font-weight:900;letter-spacing:.08em}
.cg-form-head h2{margin:0;font-size:17px}
.cg-form-copy{margin:4px 0 0;color:#4a5d69;font-size:13px;line-height:1.55;max-width:70ch}
.cg-field-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.cg-field-grid.tight{grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}
.cg-field-grid label,.cg-form-block>label,.cg-advanced-body label{display:grid;gap:6px;font-size:13px;font-weight:700;color:#223846}
.cg-field-grid label small,.cg-form-block>label small,.cg-advanced-body label small{font-weight:500;color:#5a6d7a;line-height:1.45}
.cg-form-shell input,.cg-form-shell select,.cg-form-shell textarea{background:#fff;border-color:#c7d7df}
.cg-form-shell textarea{min-height:128px}
.cg-context-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.cg-context-card{display:grid;gap:10px;padding:14px;border-radius:16px;border:1px solid #d7e6ea;background:linear-gradient(180deg,#fbfdfd,#f2f7f8)}
.cg-context-card h3{margin:0;font-size:14px}
.cg-context-card p{margin:0;color:#4e6370;font-size:13px;line-height:1.5}
.cg-inline-links{display:flex;flex-wrap:wrap;gap:8px}
.cg-toggle-list{display:grid;gap:10px}
.cg-toggle{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border:1px solid #d5e3e7;border-radius:14px;background:#fbfeff;font-weight:700;color:#223846}
.cg-toggle input{margin:2px 0 0;padding:0;width:16px;height:16px}
.cg-guardrail-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.cg-guardrail{display:grid;gap:6px;padding:12px 14px;border-radius:14px;border:1px solid #d6e4e8;background:linear-gradient(180deg,#fbfdfd,#f2f7f7)}
.cg-guardrail strong{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#31545f}
.cg-guardrail span{font-size:13px;color:#213842;line-height:1.5}
.cg-advanced-shell{border:1px solid #d3e2e7;border-radius:18px;background:linear-gradient(180deg,#ffffffea,#f7fbfb);overflow:hidden}
.cg-advanced-shell summary{list-style:none;cursor:pointer;padding:18px;display:flex;align-items:flex-start;gap:12px}
.cg-advanced-shell summary::-webkit-details-marker{display:none}
.cg-advanced-shell summary::after{content:"??關履??;margin-left:auto;display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;border:1px solid #cfe0e3;background:#f4fbfa;color:#21545d;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.cg-advanced-shell[open] summary{border-bottom:1px solid #dbe8ea}
.cg-advanced-shell[open] summary::after{content:"???쒋닪??}
.cg-advanced-body{padding:0 18px 18px;display:grid;gap:12px}
.cg-submit-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;padding:16px 18px;border:1px solid #d4e3e8;border-radius:18px;background:linear-gradient(180deg,#fff,#f7fbfb)}
.cg-submit-copy{font-size:13px;color:#516371;max-width:720px;line-height:1.55}
.cg-submit-row button{min-width:280px}
.cg-main-grid{display:grid;gap:14px;grid-template-columns:minmax(0,1.24fr) minmax(320px,.96fr);align-items:start}
.cg-phase-card{display:grid;gap:14px;padding:18px;border:1px solid #d5e3e7;border-radius:18px;background:linear-gradient(180deg,#ffffff,#f7fbfc)}
.cg-phase-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
.cg-phase-copy{margin:0;color:#506473;font-size:13px;line-height:1.55;max-width:62ch}
.cg-phase-badge{display:inline-flex;align-items:center;justify-content:center;min-width:42px;height:42px;padding:0 12px;border-radius:999px;border:1px solid #bfd8d5;background:#eef9f7;color:#0d4b48;font-size:13px;font-weight:900;letter-spacing:.08em}
.cg-phase-stack,.cg-approval-lane{display:grid;gap:14px}
.cg-slot{display:grid;gap:14px}
.cg-section-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
.cg-section-head p{margin:0;color:#506473;font-size:13px;line-height:1.5}
.cg-section-kicker{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#3a6b78;font-weight:800;margin-bottom:4px}
.cg-history-card{display:grid;gap:12px}
.cg-history-tools{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center}
.cg-history-tools input{min-width:260px;max-width:360px}
.cg-stage-map{display:grid;gap:12px;padding:18px;border:1px solid #d5e3e7;border-radius:18px;background:linear-gradient(180deg,#ffffff,#f7fbfc)}
.cg-stage-map-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
.cg-stage-map-head p{margin:0;color:#506473;font-size:13px;line-height:1.55;max-width:68ch}
.cg-stage-track{display:grid;gap:10px;grid-template-columns:repeat(6,minmax(0,1fr))}
.cg-stage-tile{display:grid;gap:8px;padding:14px;border:1px solid #d4e3e8;border-radius:16px;background:linear-gradient(180deg,#fcfefe,#f4f9f9)}
.cg-stage-index{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:999px;background:#edf8f6;border:1px solid #cce2de;color:#0f5f58;font-size:12px;font-weight:900;letter-spacing:.08em}
.cg-stage-title{font-size:14px;font-weight:800;color:#17353c}
.cg-stage-copy{font-size:12px;color:#4f6270;line-height:1.5}
.cg-stage-links{display:flex;gap:8px;flex-wrap:wrap}
.cg-stage-links a{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;border:1px solid #cfe0e3;background:#fff;color:#0f4e6a;font-size:11px;font-weight:800}
.cg-stage-links a:hover{text-decoration:none;background:#eef7ff}
.cg-table-wrap,.asset-table-wrap{overflow:auto;border:1px solid #d4e1ea;border-radius:14px;background:#fff}
.cg-table-wrap table,.asset-table-wrap table{margin:0;border:none;border-radius:0;min-width:880px}
.cg-table-wrap th,.asset-table-wrap th{position:sticky;top:0;z-index:1}
#generation-status{border:1px solid #d1e3de;border-left-width:4px;background:linear-gradient(180deg,#eef9f6,#f7fcfc);font-family:"JetBrains Mono","SFMono-Regular",Consolas,monospace;white-space:pre-wrap;line-height:1.55}
#recommended-actions .grid{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
#recommended-actions .grid>.card{padding:14px;border-radius:14px;background:linear-gradient(180deg,#ffffff,#f8fbff);box-shadow:none;border-color:#d8e4ef}
#recommended-actions .grid>.card p:first-child{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}
#regenerate-view .grid.two,#recreate-pack .grid.two,#pick-candidates .grid.two{align-items:start}
#regenerate-view label,#recreate-pack label,#pick-candidates label{display:grid;gap:6px}
#pick-candidates details.card{padding:0;overflow:hidden;border-radius:16px;box-shadow:none;background:#fcfeff}
#pick-candidates details.card summary{padding:14px 16px;cursor:pointer;list-style:none}
#pick-candidates details.card summary::-webkit-details-marker{display:none}
#pick-candidates details.card summary::after{content:"???";float:right;color:#0f766e;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
#pick-candidates details[open].card summary::after{content:"???쒋닪??}
#pick-candidates details.card>*:not(summary){padding:0 14px 14px}
#pick-candidates .asset-table-wrap{margin-top:0!important}
@media (max-width:1160px){.cg-top-layout,.cg-main-grid,.cg-flow-grid{grid-template-columns:1fr}.cg-stage-track{grid-template-columns:repeat(2,minmax(0,1fr))}.cg-ops-rail{border-left:none;border-top:1px solid #d8e8e5}}
@media (max-width:720px){.cg-hero,.cg-ops-rail{padding:18px}.cg-title-block h1{font-size:28px}.cg-form-shell{padding:0 18px 18px}.cg-form-block,.cg-phase-card,.cg-submit-row,.cg-stage-map{padding:14px;border-radius:16px}.cg-advanced-shell summary,.cg-advanced-body{padding-left:14px;padding-right:14px}.cg-stage-track{grid-template-columns:1fr}.cg-submit-row button{min-width:100%}.cg-history-tools input{min-width:100%;max-width:none}.cg-table-wrap table,.asset-table-wrap table{min-width:680px}}
</style>`;
}

function renderSlot(content: string, className: string, id?: string): string {
  if (!content) {
    return "";
  }
  const idAttribute = id ? ` id="${id}"` : "";
  return `<div class="${className}"${idAttribute}>${content}</div>`;
}

function renderPhaseCard(step: string, title: string, copy: string, content: string, id?: string, className = ""): string {
  if (!content) {
    return "";
  }
  const idAttribute = id ? ` id="${id}"` : "";
  const extraClass = className ? ` ${className}` : "";
  return `<section class="cg-phase-card${extraClass}"${idAttribute}><div class="cg-phase-head"><div><div class="cg-section-kicker">??影?됀?${esc(
    step
  )}</div><h2>${esc(title)}</h2><p class="cg-phase-copy">${esc(copy)}</p></div><span class="cg-phase-badge">${esc(
    step
  )}</span></div><div class="cg-phase-stack">${content}</div></section>`;
}

function buildCharacterGeneratorStageMap(): string {
  const tiles = [
    {
      step: "01",
      title: "Inputs",
      copy: "癲ル슢?꾤땟??? ??癰궽블뀬?? ??ш끽諭욥걡?? ?? ??낆뒩??影?곷퓠?Generation Run object??????곸죷 ?濡ろ뜑??嚥▲룗???沃섅굥?? ??關履???筌뤾퍓???",
      links: [
        { href: "#cg-stage-basic", label: "??れ삀???????곸죷" },
        { href: "/ui/studio", label: "Studio" }
      ]
    },
    {
      step: "02",
      title: "References",
      copy: "????녿군???Β?レ릇 ?????얜?????癲ル슢????????됰Ŧ??????Β?援???關履????寃뗏? ??嚥싲갭큔?? ????곸죷 ???????ш끽維???嚥???Assets???????믩쨬??놃꺇???",
      links: [
        { href: "#cg-stage-context", label: "????녿군???Β?レ릇" },
        { href: "/ui/assets", label: "Assets" }
      ]
    },
    {
      step: "03",
      title: "Workflow Policy",
      copy: "??ш끽維亦??? HITL, ??좊읈???筌먦끉???繹먮끏援??沃섅굥?? ??? Candidate set????熬곣뫖??Approve/Rollback ?????????? ??좊읈??濚왿몾??燁?癲ル슢???由????덊렡.",
      links: [{ href: "#cg-stage-policy", label: "Workflow policy" }]
    },
    {
      step: "04",
      title: "Candidates",
      copy: "Generation Run object??좊읈? 癲ル슢?????candidate workset, route diagnostics, workflow export????熬곥걿??Compare?????怨룸／????덊렡.",
      links: [
        { href: "#cg-active-job", label: "Generation Run" },
        { href: "#cg-recent-jobs", label: "Recent runs" }
      ]
    },
    {
      step: "05",
      title: "Compare",
      copy: "Candidate compare?? Character Pack handoff??????됀? ??嚥싲갭큔?? ??????????ш끽維???嚥???Characters?????怨룸／????덊렡.",
      links: [
        { href: "#pick-candidates", label: "HITL compare" },
        { href: "/ui/characters", label: "Characters" }
      ]
    },
    {
      step: "06",
      title: "Approve / Rollback",
      copy: "Character Pack approve, rollback, regenerate, recreate??approval lane????節뉗땡??嶺뚮ㅎ?????怨뚮옖甕걔?????뽮덧?????關履???筌뤾퍓???",
      links: [
        { href: "#cg-approval-lane", label: "?????????源낅뜲" },
        { href: "/ui/studio", label: "Studio" }
      ]
    }
  ];

  return `<section class="card cg-stage-map"><div class="cg-stage-map-head"><div><div class="cg-section-kicker">Stage Rail</div><h2>Inputs -> References -> Workflow Policy -> Candidates -> Compare -> Approve / Rollback</h2></div><p>Studio????鴉????繹먮끏裕????곷뼰 ???????寃뗏? ?????쒓낮?꾬┼??넊???Generation Run??Character Pack object????筌?留????????レ툗 surface????낇돲?? 嚥싲갭큔?? preview/QC/lineage/jobs ?濡ろ떟???嚥▲꺂痢?<a href="/ui/characters">Characters</a>?????怨룸／????덊렡.</p></div><div class="cg-stage-track">${tiles
    .map(
      (tile) =>
        `<article class="cg-stage-tile"><span class="cg-stage-index">${esc(tile.step)}</span><div class="cg-stage-title">${esc(
          tile.title
        )}</div><div class="cg-stage-copy">${esc(tile.copy)}</div><div class="cg-stage-links">${tile.links
          .map((link) => `<a href="${esc(link.href)}">${esc(link.label)}</a>`)
          .join("")}</div></article>`
    )
    .join("")}</div></section>`;
}

export function buildCharacterGeneratorTopSection(input: CharacterGeneratorTopInput): string {
  return `<section class="card cg-top-card">
    <div class="cg-top-layout">
      <div class="cg-hero">
        <div class="cg-eyebrow">Generation Run / staged decision flow</div>
        <div class="cg-title-row">
          <div class="cg-title-block">
            <h1>癲???????獄쏅똻???/h1>
            <p class="cg-subtitle">Character Generator??Generation Run object????筌?留????????レ툗 ??影?됀??surface????낇돲?? Inputs?? References?????類?????끹걫???關履????寃뗏? Workflow Policy?????ル㎣????Candidate set??癲ル슢?????琉뮻? Compare?????Character Pack handoff????熬곥걿?? 癲ル슢???癲ル슢??쭕?듦덩?Approve/Rollback???⑥???濡ろ뜏????癲ル슢??袁ъÞ?域밸Ŧ肉ョ뵳?嶺뚮ㅎ??? ??鴉????繹먮끏裕??? <a href="/ui/studio">Studio</a>, 嚥싲갭큔?? evidence ?濡ろ떟???嚥▲꺂痢?<a href="/ui/characters">Characters</a>??좊읈? 癲ル슢???????덊렡.</p>
          </div>
        </div>
        <div class="cg-metric-grid">
          <div class="cg-metric"><span class="cg-metric-label">1癲?????щ빘???됰씭肄?/span><span class="cg-metric-value">Generation Run</span></div>
          <div class="cg-metric"><span class="cg-metric-label">2癲?????щ빘???됰씭肄?/span><span class="cg-metric-value">Character Pack</span></div>
          <div class="cg-metric"><span class="cg-metric-label">??????????/span><span class="cg-metric-value">Candidates -> Compare -> Approve</span></div>
          <div class="cg-metric"><span class="cg-metric-label">??れ삀?????筌먲퐡??/span><span class="cg-metric-value">${esc(
            input.defaultSeed
          )}</span></div>
        </div>
        <div class="cg-flow-grid">
          <div class="cg-flow-step"><strong>01 Inputs</strong><span>癲ル슢?꾤땟??? ??癰궽블뀬?? ??ш끽諭욥걡?? ?? ??낆뒩??影?놁씀? ????????Β?爰?????곸죷 ?濡ろ뜑??嚥▲룗???濡ろ뜏????筌뤾퍓???</span></div>
          <div class="cg-flow-step"><strong>02 References</strong><span>????녿군???Β?レ릇 ?????얜?????癲ル슢????????됰Ŧ???Generation Run object??????筌????獒????關履???筌뤾퍓???</span></div>
          <div class="cg-flow-step"><strong>03 Workflow Policy</strong><span>??ш끽維亦???? ???????嶺뚮Ĳ?????沃섅굥?? ??? compare ??熬곣뫖???????????뽮덧?????關履???筌뤾퍓???</span></div>
          <div class="cg-flow-step"><strong>04 Candidates</strong><span>??筌믨퉭????Generation Run object??좊읈? candidate workset, risk, next safe action?????됰텑??????????덊렡.</span></div>
          <div class="cg-flow-step"><strong>05 Compare</strong><span>candidate set??Character Pack handoff????熬곥걿?? deep review??좊읈? ??ш끽維???嚥???Characters?????怨룸／????덊렡.</span></div>
          <div class="cg-flow-step"><strong>06 Approve / Rollback</strong><span>??????濡ろ뜏????뽰씀? ??됰슣維딁춯???⑤챷?????怨좊군癲?regenerate, recreate, rollback???⑥????????筌뤾퍓???</span></div>
        </div>
        <div class="cg-status-stack">
          ${input.message ? `<div class="notice">${esc(input.message)}</div>` : ""}
          ${input.error ? `<div class="error">${esc(input.error)}</div>` : ""}
          <div class="cg-summary-note"><strong>???⑤㈇猿????嚥▲꺃??</strong> page?怨뚮옖???Generation Run??Character Pack object???沃섅굥?? ??熬곣뫗踰?癲ル슢?????琉뮻? object summary -> next safe action -> linked routes -> evidence ??筌?留???????????⑥???????筌뤾퍓???</div>
        </div>
      </div>
      <aside class="cg-ops-rail">
        <div class="cg-ops-card">
          <h2>???⑤㈇猿 ???源낅럡</h2>
          <div class="cg-ops-list">
            <div class="cg-ops-item"><strong>Inputs -> References</strong><span>?沃섅굥?? ????ш끽維곩ㅇ??ш끽維쀨キ??嶺뚮쮳?년봼?? ??숆강筌??????????????Generation Run????れ삀?????????⑤；????嚥▲꺂痢롳┼??넊? ??關履???筌뤾퍓???</span></div>
            <div class="cg-ops-item"><strong>Policy -> Candidates</strong><span>??ш끽維亦???? HITL ?嶺뚮Ĳ??????關履?????Candidate set??compare ??影?됀?????怨쀪퐨??濚욌꼬裕뼘???? ??筌???? ?????????덊렡.</span></div>
            <div class="cg-ops-item"><strong>Compare -> Character Pack</strong><span>candidate set??????????Character Pack handoff?? review route???濡ろ뜏????筌뤾퍓???</span></div>
            <div class="cg-ops-item"><strong>Approve -> Rollback</strong><span>?怨뚮옖甕걔?????뽮덧??? approval lane???????影??탿?? 嚥싲갭큔?? evidence ?濡ろ떟???嚥▲꺂痢?Characters????됰슣維???筌뤾퍓???</span></div>
          </div>
        </div>
        <div class="cg-ops-card">
          <h2>?袁⑸즴??繞???좊읈???/h2>
          <div class="cg-link-list">
            <a href="#cg-stage-basic">??れ삀???????곸죷</a>
            <a href="#cg-stage-context">????녿군???Β?レ릇 癲ル슢?????/a>
            <a href="#cg-stage-policy">???⑤슣????鸚??嶺뚮Ĳ???/a>
            <a href="#cg-stage-advanced">?嶺뚮Ĳ????嶺? ?釉뚰???/a>
            <a href="#cg-active-job">Generation Run</a>
            <a href="#cg-approval-lane">?????????源낅뜲</a>
            <a href="/ui/characters">Characters</a>
            <a href="#cg-recent-jobs">癲ル슔?됭짆????/a>
          </div>
        </div>
        <div class="cg-ops-card" id="cg-creation-nav">
          <h2>Creation Handoff</h2>
          <p class="cg-nav-note">returnTo, current object, focus??URL??localStorage癲ル슢?????肉??????筌뤾퍓???</p>
          <div class="cg-link-list" id="cg-nav-actions"></div>
          <div class="cg-nav-stack">
            <div class="cg-ops-item"><strong>Current Object</strong><span id="cg-nav-current">???ャ뀕???run, pack, reference asset???????⑥궡異????????關履???筌뤾퍓???</span></div>
            <div class="cg-ops-item"><strong>Pinned Reopen</strong><div class="cg-link-list" id="cg-nav-pins"></div></div>
            <div class="cg-ops-item"><strong>Recent Reopen</strong><div class="cg-link-list" id="cg-nav-recents"></div></div>
          </div>
        </div>
      </aside>
    </div>
    <form method="post" action="/ui/character-generator/create" class="cg-form-shell">
      <input type="hidden" name="returnTo" id="cg-return-to" value=""/>
      <input type="hidden" name="currentObject" id="cg-current-object" value=""/>
      <input type="hidden" name="focus" id="cg-focus" value="cg-active-job"/>
      <section class="cg-form-block" id="cg-stage-basic">
        <div class="cg-form-head">
          <span class="cg-step">01</span>
          <div>
            <h2>??れ삀???????곸죷</h2>
            <p class="cg-form-copy">?怨뚮옖甕걔???嶺뚮ㅎ????癲ル슢???????ш끽維?? ?????Generation Run object??좊읈? ??????濡ろ뜑??????怨좊군????癲ル슣???援????嚥▲꺂痢롳┼??넊? ?沃섅굥?? ??關履???筌뚯뼚???</p>
          </div>
        </div>
        <div class="cg-field-grid tight">
          <label>癲ル슢?꾤땟???select name="mode"><option value="new">new (??ш끽維???ш낄援θキ?</option><option value="reference">reference (??????癲ル슣?? ????</option></select><small>????녿군???Β?レ릇 癲ル슢?꾤땟???????ャ뀕???????????獄쏅똻???濡ろ뜑?灌鍮????낆뒩????筌뤾퍓???</small></label>
          <label>??癰궽블뀬??<span class="hint" data-tooltip="?嶺? ??癰궽블뀬??? ????됰꽡??嚥???mock???⑥????????筌뤾퍓???>?</span><select name="provider"><option value="mock">mock (??れ삀??????嶺?</option><option value="comfyui">comfyui (???ャ뀕??</option><option value="remoteApi">remoteApi (???ャ뀕??</option></select><small>??癰궽블뀬???????? ?????筌뤾퍓??? ?嶺? ??癰궽블뀬??? ????덈뭷??繹먮끏??????mock???⑥????嚥▲꺃???ш낄猷귡뜮????덊렡.</small></label>
          <label>??ш끽維???ш낄援θキ???ш끽諭욥걡??select name="promptPreset">${input.styleOptions}</select><small>Character Pack?????ㅼ굡????⑤；????????뱀낄???嶺뚮ㅎ??????關履??嶺뚮ㅎ???</small></label>
          <label>??select name="species">${input.speciesOptions}</select><small>????좊즴???癲ル슢?뤸뤃??????????熬곣뫖??compare ?????????????곕쿊 ?????筌뤾퍓???</small></label>
          <label>??낆뒩???(???ャ뀕??<input name="topic" placeholder="癲ル슣?????ㅼ뒩筌???關履???癲ル슢?????뉙??????/><small>癲ル슣?㎫뙴? ??낆뒩??????⑤슢???run history?? compare surface?????????????????덊렡.</small></label>
        </div>
      </section>
      <section class="cg-form-block" id="cg-stage-context">
        <div class="cg-form-head">
          <span class="cg-step">02</span>
          <div>
            <h2>????녿군???Β?レ릇 / ??癲ル슢?????/h2>
            <p class="cg-form-copy">????덈틖 ??ш끽維??????筌????獒?????Β?援???關履????寃뗏? Character Pack review route??좊읈? 雅?퍔瑗띰㎖???怨뚮옖????ш끽維곩ㅇ??????筌뚯뼚???</p>
          </div>
        </div>
        <div class="cg-field-grid tight">
          <label>????녿군???Β?レ릇 ?????select name="referenceAssetId"><option value="">(???⑤챶苡?</option>${input.referenceOptions}</select><small>???? ????노젵?? 癲ル슢?????뉙?????????Β?ろ떗?濚밸Ŧ?김キ???醫딅땻??????뫢????ル∥援???????겾????モ뵲 ?????????ャ뀕???筌뤾퍓???</small></label>
        </div>
        <div class="cg-context-grid">
          <article class="cg-context-card">
            <h3>????녿군???Β?レ릇 ????곸죷</h3>
            <p>????? ??筌믨퀣援?????癲ル슣????QC ??????沃섅굥?? ??ш끽維???嚥??????????釉먮뻤????⑥????? ?嶺??????⑥レ툓????濡ろ떟????ャ뀖????????좊즴甕겹끃??????녿군???Β?レ릇??????????λ룵??</p>
            <div class="cg-inline-links"><a href="/ui/assets">?????????깅탿</a><a href="/ui/studio">Studio ????깅탿</a></div>
          </article>
          <article class="cg-context-card">
            <h3>嚥싲갭큔?? ???域밸Ŧ留???濡ろ뜑?灌鍮?/h3>
            <p>?????쒓낮?꾬┼??넊?????獄쏅똻???compare?????????寃뗏? preview/QC/lineage/jobs??????곴데 ????덉툗 ??嚥▲꺃彛??濡ろ떟???嚥▲꺂痢?Characters??좊읈? ??????筌뤾퍓??? ?????????嚥싲갭큔?딆띁??????苑????嚥?????숆강筌????⑥??????꾨탿?嶺뚮ㅎ???</p>
            <div class="cg-inline-links"><a href="/ui/characters">Characters ????깅탿</a><a href="/ui/studio">??鴉?????????⑥???怨뚮옖甕걔?</a></div>
          </article>
        </div>
      </section>
      <section class="cg-form-block" id="cg-stage-policy">
        <div class="cg-form-head">
          <span class="cg-step">03</span>
          <div>
            <h2>???⑤슣????鸚??嶺뚮Ĳ???/h2>
            <p class="cg-form-copy">Candidate set???????ⓦ꺂糾???ш끽維???濡ろ떟????ル늉??????????嶺뚮Ĳ?????嶺뚮쮳?듬뤅 compare?? recover ??影?됀嚥▲룗?????? ??좊읈??濚왿몾??燁??????筌뚯뼚???</p>
          </div>
        </div>
        <div class="cg-field-grid tight">
          <label>??ш끽維亦???<span class="hint" data-tooltip="??ш끽維亦낅쉠琉??쎛 ????癲ル슢?????좎떵??????琉뮻???癰????癲ル슣鍮섌뜮???筌뤾퍓???>?</span><input name="candidateCount" value="4" inputmode="numeric"/><small>??좊즵獒??븍９苡? 癲ル슢?????嚥?흮 ??????類?????????醫귥땡?堉온癲ル슣??癲????⑤㈇猿???甕??濡ろ떟?????딅텑????????節뗪콬鶯????덊렡.</small></label>
          <label>???筌????ャ뀕??select name="autoPick"><option value="false">false (??嚥▲꺃彛????ャ뀕??</option><option value="true">true (???筌????ャ뀕??</option></select><small>??嚥▲꺃????ㅼ굣??compare ??影?됀嚥▲룗????誘⑦←뵳?異???嚥▲꺃彛????ャ뀕????????筌뚯뼚???</small></label>
          <label>HITL ???ャ뀕????釉먮윥??select name="requireHitlPick"><option value="true">true</option><option value="false">false</option></select><small>???源낅?????덉쉐????筌????? 癲ル슢?뤸뤃???????????ш끽維?醫귥땡????勇?嶺뚮ㅎ?????筌먲퐢?뀐┼?????????????????</small></label>
        </div>
        <div class="cg-guardrail-grid">
          <div class="cg-guardrail"><strong>??ヂ?????/strong><span>${esc(input.forbiddenTermsSummary)}</span></div>
          <div class="cg-guardrail"><strong>???됰슦源???ㅻ깽????獄쏅챷苑?/strong><span>${esc(input.negativeTermsSummary)}</span></div>
        </div>
      </section>
      <details class="cg-advanced-shell" id="cg-stage-advanced">
        <summary><span class="cg-step">?????/span><div><h2>?嶺뚮Ĳ????嶺? ?釉뚰???/h2><p class="cg-form-copy">?濡ろ뜏???怨몃퓠??モ??????? ??ш끽維???ш낄援θキ????쒓낯?? ?????ъ땡?????됰꽡 癲ル슢?꾤땟?????????쨬??쎛 ??ш끽維????????????? staged flow??????影?됀???????Candidates -> Compare -> Approve / Rollback????낇돲??</p></div></summary>
        <div class="cg-advanced-body">
          <div class="cg-field-grid">
            <label>??筌먲퐡??<span class="hint" data-tooltip="??좊즵?? ????곸죷????筌먲퐡??????ㅽ떝???濡ろ뜏???怨몃퓠??モ???濡ろ뜏???醫듽걫??????筌뤾퍓???>?</span><input name="seed" value="${esc(
              input.defaultSeed
            )}" inputmode="numeric"/><small>??좊즵?? ??ш끽維???ш낄援θキ?롮뒙??濡ろ뜏???怨몃퓠??モ?????????誘⑦∽쭕????獒???筌먲퐡?????雅???됰씭??嶺뚮ㅎ???</small></label>
            <label>??????ㅻ깽????ш끽維???ш낄援θキ?(???ャ뀕??<textarea name="positivePrompt" rows="4" placeholder="???????????醫됱쉥 ?沃섃뫗援????關履???癲ル슢?????뉙?????? ???쑦욆???繹먮끏???ш낄援θキ? ??癲ル슢?꾤땟怨⑹젂??? 癲ル슣?????ㅼ뒩筌???좊읈?????臾먮쭕??></textarea><small>??ш끽維?????⑤베堉? 癲ル슣????筌먦끉???壤굿????嶺뚮ㅎ??? ??れ삀??????????嚥▲꺃??????? ??ш끽諭욥걡??????????筌뚯슦苑????怨?????덊렡.</small></label>
            <label>???됰슦源???ㅻ깽????ш끽維???ш낄援θキ?(???ャ뀕??<textarea name="negativePrompt" rows="4" placeholder="????????? ???뱁꺎濚????ル늅??씤異?에?ル씔??????野? ??????? ??癲? ????몄릇??></textarea><small>??????QC???????좊즵?? ????됰꽡??좊읈? ?袁⑸즵???????嶺? ??????獄?筌뤿뱶???????筌뤾퍓???</small></label>
          </div>
          <div class="cg-toggle-list">
            <label class="cg-toggle"><input type="checkbox" name="boostNegativePrompt" value="true"/><span>?? ????몄릇?? ???⑤슣?됵┼??뵯??먯물???좊즵?? ?????ъ땡?????됰꽡 癲ル슢?꾤땟????ｏ쭗?????좊즴甕겹끃??燁???????嚥▲꺃??????됰슦源???ㅻ깽????ш끽維???ш낄援θキ????좊즴甕???筌뤾퍓???</span></label>
          </div>
        </div>
      </details>
      <div class="cg-submit-row">
        <p class="cg-submit-copy">??筌믨퉭???嚥???Stage 04 Candidates??좊읈? ?????⑥궡異? Generation Run object??좊읈? ???ㅺ컼?? risk, next safe action, linked routes, evidence????影?얠맽 ?嶺뚮ㅎ????筌뤾퍓??? ComfyUI????????????⑤챶?뺧┼???? ??れ삀?????????嶺뚮Ĳ???????ㅻ깹??mock???⑥????繹먮끏裕?????????덊렡.</p>
        <button type="submit" data-primary-action="1" data-primary-label="癲???????ш끽維亦???獄쏅똻??????덈틖">癲???????ш끽維亦???獄쏅똻??????덈틖</button>
      </div>
      <div class="cg-context-grid">
        <article class="cg-context-card">
          <h3>Stage 04 / Generation Run object</h3>
          <p>??筌믨퉭??????嚥▲꺂??Candidates ??影?됀?????run status, policy snapshot, next safe action, evidence????좊즵?? surface??????????????덊렡.</p>
          <div class="cg-inline-links"><a href="#cg-active-job">Generation Run ????깅탿</a><a href="#cg-recent-jobs">癲ル슔?됭짆?????怨뚮옖??逾?/a></div>
        </article>
        <article class="cg-context-card">
          <h3>Stage 05-06 / Character Pack object</h3>
          <p>Pack build ??熬곣뫖????獒?Compare?????handoff????熬곥걿?? Approve/Rollback?? approval lane????????獒????덊렡. 嚥싲갭큔?? preview/QC/lineage/jobs ?濡ろ떟???嚥▲꺂痢?Characters?????怨룸／????덊렡.</p>
          <div class="cg-inline-links"><a href="#cg-approval-lane">?????????源낅뜲</a><a href="/ui/characters">Characters ????깅탿</a></div>
        </article>
      </div>
    </form>
  </section>`;
}

export function buildCharacterGeneratorStatusScript(): string {
  return `<script>(function(){const el=document.getElementById("generation-status");if(!(el instanceof HTMLElement)){return;}const retryBtn=document.getElementById("generation-retry");const jobId=String(el.dataset.jobId||"");if(!jobId){return;}let timer=null;let failCount=0;const stageLabel=(status)=>{switch(String(status||"").toUpperCase()){case"QUEUED":return"대기";case"RUNNING":return"실행 중";case"SUCCEEDED":return"성공";case"FAILED":return"실패";case"CANCELLED":return"취소";default:return String(status||"unknown");}};const formatScore=(value)=>typeof value==="number"&&Number.isFinite(value)?value.toFixed(2):"-";const shortView=(view)=>view==="threeQuarter"?"3/4":view==="profile"?"profile":"front";const summarizePreflight=(stage)=>{if(!stage||!stage.preflightByView){return"";}const entries=["front","threeQuarter","profile"].filter((view)=>stage.preflightByView&&stage.preflightByView[view]).map((view)=>{const diagnostics=stage.preflightByView[view];const detail=(Array.isArray(diagnostics&&diagnostics.missingStructureKinds)?diagnostics.missingStructureKinds.slice(0,2).join("+"):"")||(Array.isArray(diagnostics&&diagnostics.missingReferenceRoles)?diagnostics.missingReferenceRoles.slice(0,1).join("+"):"")||(Array.isArray(diagnostics&&diagnostics.reasonCodes)?diagnostics.reasonCodes[0]:"")||"";return shortView(view)+":"+String(diagnostics&&diagnostics.status||"unknown")+(detail?":"+detail:"");});return entries.length>0?" / 사전점검="+entries.join(","):"";};const schedule=(ms)=>{if(timer){clearTimeout(timer);}timer=setTimeout(()=>{void tick();},ms);};const toast=(title,msg,tone)=>{if(typeof window.__ecsToast==="function"){window.__ecsToast(title,msg,tone||"warn");}};const speak=(msg)=>{if(typeof window.__ecsSpeak==="function"){window.__ecsSpeak(msg);}};const tick=async()=>{try{const res=await fetch("/api/character-generator/jobs/"+encodeURIComponent(jobId));if(!res.ok){throw new Error("작업 상태 조회 실패: "+res.status);}const json=await res.json();const data=json&&json.data?json.data:null;if(!data){throw new Error("작업 상태 응답이 비어 있습니다.");}failCount=0;if(retryBtn instanceof HTMLElement){retryBtn.style.display="none";}const manifestStatus=data.manifest&&data.manifest.status?" / manifest="+String(data.manifest.status):"";const packCoherence=data.packCoherence||data.manifest&&data.manifest.packCoherence?data.packCoherence||data.manifest.packCoherence:null;const autoReroute=data.autoReroute||data.manifest&&data.manifest.autoReroute?data.autoReroute||data.manifest.autoReroute:null;const selectionRisk=data.selectionRisk||data.manifest&&data.manifest.providerMeta&&data.manifest.providerMeta.selectionDiagnostics?data.selectionRisk||data.manifest.providerMeta.selectionDiagnostics.selectionRisk:null;const qualityEmbargo=data.qualityEmbargo||data.manifest&&data.manifest.providerMeta&&data.manifest.providerMeta.selectionDiagnostics?data.qualityEmbargo||data.manifest.providerMeta.selectionDiagnostics.qualityEmbargo:null;const finalQualityFirewall=data.finalQualityFirewall||data.manifest&&data.manifest.providerMeta&&data.manifest.providerMeta.selectionDiagnostics?data.finalQualityFirewall||data.manifest.providerMeta.selectionDiagnostics.finalQualityFirewall:null;const decisionOutcome=data.decisionOutcome||data.manifest&&data.manifest.providerMeta&&data.manifest.providerMeta.selectionDiagnostics?data.decisionOutcome||data.manifest.providerMeta.selectionDiagnostics.decisionOutcome:null;const coherenceSummary=packCoherence?" / 일관성="+String(packCoherence.severity||"none")+":"+formatScore(packCoherence.score):"";const rerouteSummary=autoReroute&&autoReroute.attempted?" / 재라우팅="+String(autoReroute.recovered===true?"recovered":autoReroute.recovered===false?"failed":"attempted")+(autoReroute.strategy?"@"+String(autoReroute.strategy):""):"";const selectionRiskSummary=selectionRisk&&selectionRisk.level&&String(selectionRisk.level)!=="none"?" / 선택위험="+String(selectionRisk.level)+(selectionRisk.suggestedAction?"@"+String(selectionRisk.suggestedAction):""):"";const qualityEmbargoSummary=qualityEmbargo&&qualityEmbargo.level&&String(qualityEmbargo.level)!=="none"?" / 품질보류="+String(qualityEmbargo.level)+(qualityEmbargo.suggestedAction?"@"+String(qualityEmbargo.suggestedAction):""):"";const firewallSummary=finalQualityFirewall&&finalQualityFirewall.level&&String(finalQualityFirewall.level)!=="none"?" / 최종방화벽="+String(finalQualityFirewall.level)+(finalQualityFirewall.suggestedAction?"@"+String(finalQualityFirewall.suggestedAction):""):"";const decisionSummary=decisionOutcome&&decisionOutcome.status?" / 판단="+String(decisionOutcome.status)+(decisionOutcome.kind?"@"+String(decisionOutcome.kind):""):"";const selectionSource=data.finalSelectionSource?" / 선택원천="+String(data.finalSelectionSource):"";const routeSummary=data.selectedWorkflowRuntimeSummary&&String(data.selectedWorkflowRuntimeSummary)!=="-"?" / 경로="+String(data.selectedWorkflowRuntimeSummary):"";const lastStage=Array.isArray(data.workflowStages)&&data.workflowStages.length>0?data.workflowStages[data.workflowStages.length-1]:null;const stageVariant=lastStage?[String(lastStage.origin||""),String(lastStage.passLabel||"")].filter((value)=>value&&value!=="").join("@"):"";const stageExit=lastStage?"pass="+String(Array.isArray(lastStage.passedViews)?lastStage.passedViews.length:0)+"/fail="+String(Array.isArray(lastStage.failedViews)?lastStage.failedViews.length:0):"";const stageSummary=lastStage?" / 단계="+String(lastStage.stage||"unknown")+(stageVariant?"@"+stageVariant:"")+"#"+String(lastStage.roundsAttempted||0)+(stageExit?":"+stageExit:""):Array.isArray(data.workflowStages)&&data.workflowStages.length>0?" / 단계="+String(data.workflowStages.length):"";const preflightSummary=summarizePreflight(lastStage);const triageSummary=lastStage&&lastStage.repairTriageByView?(()=>{const entries=["front","threeQuarter","profile"].filter((view)=>lastStage.repairTriageByView&&lastStage.repairTriageByView[view]).map((view)=>shortView(view)+":"+String(lastStage.repairTriageByView[view].decision||"unknown"));return entries.length>0?" / repairTriage="+entries.join(","):"";})():"";const repairSummary=lastStage&&lastStage.repairAcceptanceByView?(()=>{const entries=["front","threeQuarter","profile"].filter((view)=>lastStage.repairAcceptanceByView&&lastStage.repairAcceptanceByView[view]).map((view)=>shortView(view)+":"+String(lastStage.repairAcceptanceByView[view].decision||"unknown"));return entries.length>0?" / repairAcceptance="+entries.join(","):"";})():"";const nextAction=Array.isArray(data.recommendedActions)&&data.recommendedActions.length>0&&data.recommendedActions[0]&&data.recommendedActions[0].label?" / 다음="+String(data.recommendedActions[0].label):"";const text="작업="+stageLabel(data.status)+" 진행률="+String(data.progress)+"%"+manifestStatus+coherenceSummary+rerouteSummary+selectionRiskSummary+qualityEmbargoSummary+firewallSummary+decisionSummary+selectionSource+routeSummary+stageSummary+preflightSummary+triageSummary+repairSummary+nextAction;el.textContent=text;speak(text);if(data.status==="SUCCEEDED"||data.status==="FAILED"||data.status==="CANCELLED"){if(data.manifestExists){toast("Generation Run","결과가 확정되었습니다. 현재 run object를 다시 엽니다.",data.status==="SUCCEEDED"?"ok":"warn");setTimeout(()=>{window.location.href="/ui/character-generator?jobId="+encodeURIComponent(jobId);},500);}return;}schedule(2000);}catch(error){failCount+=1;const wait=Math.min(15000,2000*Math.pow(2,failCount));el.textContent="상태 확인 실패. "+wait+"ms 뒤 다시 시도합니다.";if(retryBtn instanceof HTMLElement){retryBtn.style.display="inline-block";}toast("Generation Run",String(error),"warn");schedule(wait);}};if(retryBtn instanceof HTMLElement){retryBtn.addEventListener("click",()=>{failCount=0;void tick();});}void tick();})();</script>`;
}

function buildCharacterGeneratorNavScript(): string {
  return `<script>(function(){const ns="ecs.ui.creation.nav.v1";const parse=(value,fallback)=>{try{const parsed=JSON.parse(String(value||""));return parsed==null?fallback:parsed;}catch{return fallback;}};const readList=(kind)=>{if(typeof window==="undefined"||!window.localStorage){return [];}const parsed=parse(window.localStorage.getItem(ns+".recent."+kind),[]);return Array.isArray(parsed)?parsed:[];};const writeList=(kind,items)=>{try{window.localStorage.setItem(ns+".recent."+kind,JSON.stringify(items.slice(0,6)));}catch{}};const readPin=(kind)=>{if(typeof window==="undefined"||!window.localStorage){return null;}const parsed=parse(window.localStorage.getItem(ns+".pin."+kind),null);return parsed&&typeof parsed==="object"?parsed:null;};const writePin=(kind,item)=>{try{window.localStorage.setItem(ns+".pin."+kind,JSON.stringify(item));}catch{}};const pushRecent=(kind,item)=>{if(!item||!item.id){return;}const next=[item].concat(readList(kind).filter((entry)=>entry&&entry.id!==item.id));writeList(kind,next);};const buildHref=(pathname,params)=>{const url=new URL(pathname,window.location.origin);Object.entries(params||{}).forEach(([key,value])=>{if(value!==undefined&&value!==null&&String(value).trim()!==""){url.searchParams.set(key,String(value));}});return url.pathname+url.search;};const renderLinks=(rootId,items,empty)=>{const root=document.getElementById(rootId);if(!(root instanceof HTMLElement)){return;}const valid=Array.isArray(items)?items.filter((entry)=>entry&&entry.href&&entry.label):[];root.innerHTML=valid.length?valid.map((entry)=>'<a href="'+String(entry.href).replaceAll('"',"&quot;")+'">'+String(entry.label).replaceAll("<","&lt;").replaceAll(">","&gt;")+'</a>').join(""):'<span class="cg-nav-note">'+empty+"</span>";};const params=new URLSearchParams(window.location.search);const currentUrl=window.location.pathname+window.location.search;const returnTo=params.get("returnTo")||"";const focus=params.get("focus")||"cg-active-job";const referenceAssetId=params.get("referenceAssetId")||params.get("assetId")||"";const activeJob=document.getElementById("cg-active-job-meta")||document.getElementById("cg-active-job");const currentRunId=activeJob&&activeJob.dataset?String(activeJob.dataset.currentRunId||params.get("jobId")||""):String(params.get("jobId")||"");const currentPackId=activeJob&&activeJob.dataset?String(activeJob.dataset.currentPackId||""):"";const currentObject=params.get("currentObject")||(currentRunId?"run:"+currentRunId:referenceAssetId?"asset:"+referenceAssetId:currentPackId?"pack:"+currentPackId:"");const referenceSelect=document.querySelector('select[name="referenceAssetId"]');if(referenceSelect instanceof HTMLSelectElement&&referenceAssetId&&!referenceSelect.value){referenceSelect.value=referenceAssetId;}const returnToInput=document.getElementById("cg-return-to");if(returnToInput instanceof HTMLInputElement){returnToInput.value=returnTo;}const currentObjectInput=document.getElementById("cg-current-object");if(currentObjectInput instanceof HTMLInputElement){currentObjectInput.value=currentObject;}const focusInput=document.getElementById("cg-focus");if(focusInput instanceof HTMLInputElement){focusInput.value=focus;}if(referenceAssetId){pushRecent("assets",{id:referenceAssetId,label:"Asset "+referenceAssetId,href:buildHref("/ui/assets",{assetId:referenceAssetId,currentObject:"asset:"+referenceAssetId,focus:"asset-selected-detail"})});}if(currentRunId){pushRecent("runs",{id:currentRunId,label:"Run "+currentRunId,href:buildHref("/ui/character-generator",{jobId:currentRunId,currentObject:"run:"+currentRunId,focus:"cg-active-job"})});}if(currentPackId){pushRecent("packs",{id:currentPackId,label:"Pack "+currentPackId,href:buildHref("/ui/characters",{characterPackId:currentPackId,returnTo:currentUrl,currentObject:"pack:"+currentPackId,focus:"pack-review-current"})});}const actions=[];if(returnTo){actions.push('<a href="'+returnTo.replaceAll('"',"&quot;")+'">Return</a>');}actions.push('<button type="button" id="cg-copy-link">Copy deep link</button>');if(currentRunId){actions.push('<button type="button" id="cg-pin-run">Pin current run</button>');}if(currentPackId){actions.push('<button type="button" id="cg-pin-pack">Pin current pack</button>');}const actionRoot=document.getElementById("cg-nav-actions");if(actionRoot instanceof HTMLElement){actionRoot.innerHTML=actions.join("");}const currentRoot=document.getElementById("cg-nav-current");if(currentRoot instanceof HTMLElement){currentRoot.textContent=currentRunId?"Generation Run "+currentRunId+(currentPackId?" -> Pack "+currentPackId:""):referenceAssetId?"Reference Asset "+referenceAssetId:currentObject||"???ャ뀕???????щ빘???됰씭肄??좊읈? ??ш끽維쀧빊????⑤８?????덊렡.";}document.getElementById("cg-copy-link")?.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(window.location.href);if(typeof window.__ecsToast==="function"){window.__ecsToast("Generator","Deep link copied.","ok");}}catch(error){if(typeof window.__ecsToast==="function"){window.__ecsToast("Generator",String(error),"warn");}}});document.getElementById("cg-pin-run")?.addEventListener("click",()=>{if(!currentRunId){return;}writePin("run",{id:currentRunId,label:"Run "+currentRunId,href:buildHref("/ui/character-generator",{jobId:currentRunId,currentObject:"run:"+currentRunId,focus:"cg-active-job"})});renderLinks("cg-nav-pins",[readPin("run"),readPin("pack")].filter(Boolean),"Pinned run?????pack?????⑤８?????덊렡.");});document.getElementById("cg-pin-pack")?.addEventListener("click",()=>{if(!currentPackId){return;}writePin("pack",{id:currentPackId,label:"Pack "+currentPackId,href:buildHref("/ui/characters",{characterPackId:currentPackId,returnTo:currentUrl,currentObject:"pack:"+currentPackId,focus:"pack-review-current"})});renderLinks("cg-nav-pins",[readPin("run"),readPin("pack")].filter(Boolean),"Pinned run?????pack?????⑤８?????덊렡.");});renderLinks("cg-nav-pins",[readPin("run"),readPin("pack")].filter(Boolean),"Pinned run?????pack?????⑤８?????덊렡.");renderLinks("cg-nav-recents",readList("runs").slice(0,3).concat(readList("packs").slice(0,3)),"癲ル슔?됭짆??reopen 癲ル슢??湲룹물筌먯빘苡? ??ш끽維쀧빊????⑤８?????덊렡.");if(focus&&!window.location.hash){const focusTarget=document.getElementById(focus);if(focusTarget instanceof HTMLElement){setTimeout(()=>focusTarget.scrollIntoView({block:"start",behavior:"smooth"}),120);}}})();</script>`;
}

type CharacterGeneratorPageBodyInput = {
  topSection: string;
  selectedSection: string;
  recommendedActionsSection: string;
  regenerateSection: string;
  recreateSection: string;
  pickSection: string;
  previewSection: string;
  rollbackSection: string;
  compareSection: string;
  rows: string;
  statusScript: string;
};

export function buildCharacterGeneratorPageBody(input: CharacterGeneratorPageBodyInput): string {
  const jobsSection = `<section class="card cg-history-card" id="cg-recent-jobs"><div class="cg-section-head"><div><div class="cg-section-kicker">Recent Objects</div><h2>최근 생성 작업</h2></div><p>최근 Generation Run object를 다시 열고 compare, recover, approve 흐름으로 재진입할 수 있는 reopen rail입니다.</p></div><div class="cg-history-tools"><div class="quick-links"><a href="#cg-active-job">Generation Run</a><a href="#recommended-actions">Next safe actions</a><a href="#pick-candidates">HITL compare</a><a href="#cg-approval-lane">Approve / Rollback</a></div><input type="search" data-table-filter="cg-jobs-table" placeholder="최근 작업 검색 (job / episode / topic / status)"/></div><div class="cg-table-wrap"><table id="cg-jobs-table"><thead><tr><th>Job</th><th>Episode</th><th>Topic</th><th>Status</th><th>Progress</th><th>Manifest</th><th>Created At</th></tr></thead><tbody>${
    input.rows ||
    '<tr><td colspan="7"><div class="notice">최근 생성 작업이 아직 없습니다. 새 run object를 만든 뒤 reopen rail로 다시 돌아오세요.</div></td></tr>'
  }</tbody></table></div></section>`;

  const compareLane = renderPhaseCard(
    "05",
    "Compare",
    "Generation Run and candidate compare lane. Move Pack handoff to this stage first, then continue to Characters for deeper preview, QC, lineage, and jobs review.",
    `${renderSlot(input.selectedSection, "cg-slot", "cg-active-job")}${renderSlot(
      input.pickSection,
      "cg-slot"
    )}${renderSlot(input.previewSection, "cg-slot")}${renderSlot(input.compareSection, "cg-slot")}`
  );
  const approvalLane = renderPhaseCard(
    "06",
    "Approve / Rollback",
    "Use this lane only after compare is closed. Expose the next safe action first, then run regenerate, recreate, approve, or rollback from the dedicated controls.",
    `${renderSlot(input.recommendedActionsSection, "cg-slot")}${renderSlot(input.regenerateSection, "cg-slot")}${renderSlot(
      input.recreateSection,
      "cg-slot"
    )}${renderSlot(input.rollbackSection, "cg-slot")}`,
    "cg-approval-lane",
    "cg-approval-lane"
  );

  return `${buildCharacterGeneratorPageStyles()}<div class="cg-page-shell">${input.topSection}${buildCharacterGeneratorStageMap()}<div class="cg-main-grid">${compareLane}${approvalLane}</div>${jobsSection}</div>${buildCharacterGeneratorNavScript()}${input.statusScript}`;
}
