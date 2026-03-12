import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

let bootstrapped = false;

export function bootstrapEnv(): void {
  if (bootstrapped) {
    return;
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const envPath = path.resolve(__dirname, "../../../.env");
  const result = config({ path: envPath, override: false });

  if (result.error && !process.env.DATABASE_URL) {
    throw new Error(`[worker] Failed to load .env from ${envPath}: ${result.error.message}`);
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("[worker] DATABASE_URL is required. Check repo-root .env");
  }

  bootstrapped = true;
}
