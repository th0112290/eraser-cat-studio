import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");
const LOCAL_STORAGE_ROOT = path.join(REPO_ROOT, "out", "storage");

const S3_ENDPOINT = process.env.S3_ENDPOINT?.trim();
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY?.trim();
const S3_SECRET_KEY = process.env.S3_SECRET_KEY?.trim();
const S3_BUCKET = process.env.S3_BUCKET?.trim() || "artifacts";
const S3_REGION = process.env.S3_REGION?.trim() || "us-east-1";

let s3Client: S3Client | null = null;
let bucketReady = false;

function isS3Configured(): boolean {
  return Boolean(S3_ENDPOINT && S3_ACCESS_KEY && S3_SECRET_KEY && S3_BUCKET);
}

function getS3Client(): S3Client | null {
  if (!isS3Configured()) {
    return null;
  }

  if (!s3Client) {
    s3Client = new S3Client({
      endpoint: S3_ENDPOINT,
      region: S3_REGION,
      forcePathStyle: true,
      credentials: {
        accessKeyId: S3_ACCESS_KEY!,
        secretAccessKey: S3_SECRET_KEY!
      }
    });
  }

  return s3Client;
}

async function ensureBucket(client: S3Client): Promise<void> {
  if (bucketReady) {
    return;
  }

  try {
    await client.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: S3_BUCKET }));
  }

  bucketReady = true;
}

function assertSafeKey(key: string): string {
  const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) {
    throw new Error("Storage key is required");
  }
  if (normalized.includes("..")) {
    throw new Error("Invalid storage key");
  }
  return normalized;
}

function localPathFromKey(key: string): string {
  const safeKey = assertSafeKey(key);
  return path.join(LOCAL_STORAGE_ROOT, safeKey);
}

async function writeLocal(key: string, data: Buffer): Promise<string> {
  const localPath = localPathFromKey(key);
  await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
  await fs.promises.writeFile(localPath, data);
  return localPath;
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) {
    throw new Error("Empty object body");
  }

  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  const maybeTransform = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof maybeTransform.transformToByteArray === "function") {
    const bytes = await maybeTransform.transformToByteArray();
    return Buffer.from(bytes);
  }

  if (typeof (body as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === "function") {
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<unknown>) {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      } else if (chunk instanceof Uint8Array) {
        chunks.push(Buffer.from(chunk));
      } else if (typeof chunk === "string") {
        chunks.push(Buffer.from(chunk));
      } else {
        throw new Error("Unsupported stream chunk type");
      }
    }
    return Buffer.concat(chunks);
  }

  throw new Error("Unsupported object body type");
}

export async function putAssetObject(key: string, data: Buffer, contentType: string): Promise<{ backend: "minio" | "local"; localPath: string; minioError?: string }> {
  const safeKey = assertSafeKey(key);
  const localPath = await writeLocal(safeKey, data);

  const client = getS3Client();
  if (!client) {
    return {
      backend: "local",
      localPath
    };
  }

  try {
    await ensureBucket(client);
    await client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: safeKey,
        Body: data,
        ContentType: contentType
      })
    );

    return {
      backend: "minio",
      localPath
    };
  } catch (error) {
    return {
      backend: "local",
      localPath,
      minioError: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function getAssetObject(key: string): Promise<Buffer> {
  const safeKey = assertSafeKey(key);
  const localPath = localPathFromKey(safeKey);

  try {
    return await fs.promises.readFile(localPath);
  } catch {
    const client = getS3Client();
    if (!client) {
      throw new Error(`Asset not found in local storage: ${safeKey}`);
    }

    await ensureBucket(client);
    const response = await client.send(
      new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: safeKey
      })
    );

    return streamToBuffer(response.Body);
  }
}

export async function putJsonObject(key: string, value: unknown): Promise<{ backend: "minio" | "local"; localPath: string; minioError?: string }> {
  const body = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  return putAssetObject(key, body, "application/json");
}

export function makeStorageKey(prefix: string, filename: string): string {
  const cleanPrefix = assertSafeKey(prefix);
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${cleanPrefix}/${safeFilename}`;
}

export function getLocalStorageRoot(): string {
  return LOCAL_STORAGE_ROOT;
}