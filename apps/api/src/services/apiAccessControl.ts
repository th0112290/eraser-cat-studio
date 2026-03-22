type AccessControlHeaders = Record<string, unknown>;

export type AccessControlledRequest = {
  method: string;
  headers: AccessControlHeaders;
  ip?: string;
  raw?: { socket?: { remoteAddress?: string | null } };
};

export class AccessControlError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

function readHeader(headers: AccessControlHeaders, name: string): string | undefined {
  const rawValue = headers[name];
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeLoopbackHost(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "") {
    return null;
  }
  const withoutMappedPrefix = trimmed.replace(/^::ffff:/, "");
  if (withoutMappedPrefix.startsWith("[")) {
    const closing = withoutMappedPrefix.indexOf("]");
    if (closing >= 0) {
      return withoutMappedPrefix.slice(1, closing);
    }
  }
  const colonCount = (withoutMappedPrefix.match(/:/g) ?? []).length;
  if (colonCount > 1) {
    return withoutMappedPrefix;
  }
  return withoutMappedPrefix.split(":", 2)[0] ?? withoutMappedPrefix;
}

export function isLoopbackAddress(value: string | undefined): boolean {
  const normalized = normalizeLoopbackHost(value);
  return normalized === "127.0.0.1" || normalized === "::1" || normalized === "localhost";
}

function isWildcardBindAddress(value: string | undefined): boolean {
  const normalized = normalizeLoopbackHost(value);
  return normalized === "0.0.0.0" || normalized === "::";
}

export function readProvidedApiKey(request: { headers: AccessControlHeaders }): string {
  return readHeader(request.headers, "x-api-key") ?? "";
}

export function hasValidApiKey(request: { headers: AccessControlHeaders }, apiKey: string): boolean {
  return apiKey.trim().length > 0 && readProvidedApiKey(request) === apiKey.trim();
}

export function isOperatorSurfaceRoute(routePath: string): boolean {
  return routePath.startsWith("/ui") || routePath.startsWith("/artifacts");
}

export function isSafeMethod(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

export function isLoopbackRequest(request: AccessControlledRequest): boolean {
  if (isLoopbackAddress(request.ip)) {
    return true;
  }
  const remoteAddress = request.raw?.socket?.remoteAddress ?? undefined;
  return isLoopbackAddress(remoteAddress ?? undefined);
}

function buildAllowedLoopbackHosts(input: {
  listenHost: string;
  apiPort: number;
  requestHostHeader?: string;
}): Set<string> {
  const allowed = new Set<string>();
  const port = String(input.apiPort);
  for (const host of [input.listenHost, "127.0.0.1", "localhost", "[::1]"]) {
    const normalized = host.trim();
    if (normalized.length > 0) {
      allowed.add(`${normalized}:${port}`.toLowerCase());
    }
  }
  const requestHost = input.requestHostHeader?.trim().toLowerCase();
  if (requestHost) {
    const hostOnly = normalizeLoopbackHost(requestHost);
    if (isLoopbackAddress(hostOnly ?? undefined)) {
      allowed.add(requestHost);
    }
  }
  return allowed;
}

function isTrustedLoopbackOrigin(urlValue: string | undefined, allowedHosts: Set<string>): boolean {
  if (!urlValue) {
    return false;
  }
  try {
    const parsed = new URL(urlValue);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }
    if (!isLoopbackAddress(parsed.hostname)) {
      return false;
    }
    return allowedHosts.has(parsed.host.trim().toLowerCase());
  } catch {
    return false;
  }
}

export function resolveApiListenHost(input: { apiHost: string; apiKey: string }): {
  host: string;
  localOnlyMode: boolean;
  forcedLocalBinding: boolean;
} {
  const requestedHost = input.apiHost.trim();
  const apiKey = input.apiKey.trim();
  if (apiKey.length > 0) {
    return {
      host: requestedHost.length > 0 ? requestedHost : "0.0.0.0",
      localOnlyMode: false,
      forcedLocalBinding: false
    };
  }
  if (requestedHost.length === 0 || isWildcardBindAddress(requestedHost) || !isLoopbackAddress(requestedHost)) {
    return {
      host: "127.0.0.1",
      localOnlyMode: true,
      forcedLocalBinding: true
    };
  }
  return {
    host: requestedHost,
    localOnlyMode: true,
    forcedLocalBinding: false
  };
}

export function enforceApiAccess(input: {
  request: AccessControlledRequest;
  routePath: string;
  apiKey: string;
  apiPort: number;
  listenHost: string;
}): void {
  const { request, routePath, apiKey, apiPort, listenHost } = input;
  const trimmedApiKey = apiKey.trim();
  if (trimmedApiKey.length > 0) {
    if (!hasValidApiKey(request, trimmedApiKey)) {
      throw new AccessControlError(401, "Unauthorized");
    }
    return;
  }

  if (!isLoopbackRequest(request)) {
    throw new AccessControlError(403, "API key is required for non-loopback access");
  }

  if (!isOperatorSurfaceRoute(routePath) || isSafeMethod(request.method)) {
    return;
  }

  const requestHost = readHeader(request.headers, "host");
  const allowedHosts = buildAllowedLoopbackHosts({
    listenHost,
    apiPort,
    requestHostHeader: requestHost
  });
  const origin = readHeader(request.headers, "origin");
  const referer = readHeader(request.headers, "referer");
  if (isTrustedLoopbackOrigin(origin, allowedHosts) || isTrustedLoopbackOrigin(referer, allowedHosts)) {
    return;
  }
  throw new AccessControlError(403, "Operator mutations require a same-origin loopback browser request or API key");
}
