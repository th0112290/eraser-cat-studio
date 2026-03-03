import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

let bootstrapped = false;

export function bootstrapEnv(): void {
  if (bootstrapped) {
    return;
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const envPath = path.resolve(__dirname, "../../../.env");

  if (fs.existsSync(envPath)) {
    dotenv.config({
      path: envPath,
      override: true
    });
  }

  bootstrapped = true;
}
