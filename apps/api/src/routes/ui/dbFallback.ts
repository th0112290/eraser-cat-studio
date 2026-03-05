export function dbErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isDbUnavailableError(error: unknown): boolean {
  const msg = dbErrorMessage(error).toLowerCase();
  return (
    msg.includes("can't reach database server") ||
    msg.includes("prismaclientinitializationerror") ||
    msg.includes("connect econnrefused") ||
    msg.includes("database unavailable") ||
    msg.includes("terminating connection due to administrator command") ||
    msg.includes("server closed the connection unexpectedly") ||
    msg.includes("the database system is shutting down")
  );
}

export function renderDbUnavailableCard(input: {
  title: string;
  route: string;
  requestId?: string;
  command?: string;
}): string {
  const command = input.command ?? "pnpm docker:up";
  const payload = {
    error: "database_unavailable",
    error_code: "database_unavailable",
    dependency: "postgresql",
    hint: "Start PostgreSQL and retry.",
    route: input.route,
    requestId: input.requestId ?? null
  };

  return `<section class="card" data-error-code="database_unavailable"><h1>${input.title}</h1><div class="error">Database is unavailable, so this page cannot load data.</div><p>Action: run <code>${command}</code> or verify DB status, then refresh.</p><pre>${JSON.stringify(
    payload,
    null,
    2
  )}</pre></section>`;
}
