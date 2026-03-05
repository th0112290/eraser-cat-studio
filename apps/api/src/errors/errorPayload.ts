export type ServiceDependency = "redis" | "postgresql";

export type ServiceUnavailablePayload = {
  error: string;
  error_code: string;
  dependency: ServiceDependency;
  hint: string;
  requestId: string;
};

export function createServiceUnavailablePayload(input: {
  dependency: ServiceDependency;
  requestId: string;
}): ServiceUnavailablePayload {
  if (input.dependency === "redis") {
    return {
      error: "Redis unavailable",
      error_code: "redis_unavailable",
      dependency: "redis",
      hint: "Start Redis and retry.",
      requestId: input.requestId
    };
  }

  return {
    error: "Database unavailable",
    error_code: "database_unavailable",
    dependency: "postgresql",
    hint: "Start PostgreSQL and retry.",
    requestId: input.requestId
  };
}

export function hasServiceUnavailableShape(value: unknown): value is ServiceUnavailablePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const item = value as Record<string, unknown>;
  return (
    typeof item.error === "string" &&
    typeof item.error_code === "string" &&
    (item.dependency === "redis" || item.dependency === "postgresql") &&
    typeof item.hint === "string" &&
    typeof item.requestId === "string"
  );
}
