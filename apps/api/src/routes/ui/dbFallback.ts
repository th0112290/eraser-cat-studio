export function dbErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isDbUnavailableError(error: unknown): boolean {
  const msg = dbErrorMessage(error).toLowerCase();
  return msg.includes("can't reach database server") || msg.includes("prismaclientinitializationerror");
}

export function renderDbUnavailableCard(input: { title: string; route: string; command?: string }): string {
  const command = input.command ?? "pnpm docker:up";
  return `<section class="card"><h1>${input.title}</h1><div class="error">DB 연결이 없어 화면 데이터를 불러오지 못했습니다.</div><p>조치: <code>${command}</code> 또는 DB 실행 상태를 확인한 뒤 새로고침하세요.</p><pre>${JSON.stringify(
    {
      error: "database_unavailable",
      hint: "Start PostgreSQL and retry.",
      route: input.route
    },
    null,
    2
  )}</pre></section>`;
}
