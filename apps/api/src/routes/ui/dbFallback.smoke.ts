import { isDbUnavailableError, renderDbUnavailableCard } from "./dbFallback";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const unavailable = new Error("PrismaClientInitializationError: Can't reach database server at `localhost:5432`");
assert(isDbUnavailableError(unavailable), "Expected db unavailable detector to match Prisma init error");

const card = renderDbUnavailableCard({
  title: "테스트 화면",
  route: "/ui/test",
  requestId: "req_smoke_1"
});

assert(card.includes("database_unavailable"), "Fallback card must include error code");
assert(card.includes("data-error-code=\"database_unavailable\""), "Fallback card must include marker");
assert(card.includes("/ui/test"), "Fallback card must include route");
assert(card.includes("req_smoke_1"), "Fallback card must include requestId");
assert(card.includes("pnpm docker:up"), "Fallback card must include remediation command");

console.log("[dbFallback.smoke] PASS");
