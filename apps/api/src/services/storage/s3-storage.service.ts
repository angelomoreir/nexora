import type { Readable } from "node:stream";
import type { StorageService, StoredObject } from "./storage.service.js";

// S3-compatible storage adapter — works with AWS S3, Cloudflare R2, MinIO, etc.
// Requires @aws-sdk/client-s3 and @aws-sdk/lib-storage to be installed.
// This is a lazy-loaded adapter — the SDK is only imported when configured.

export interface S3StorageConfig {
  endpoint?: string; // Required for R2/MinIO
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean; // true for MinIO/R2
  publicBaseUrl?: string; // For generating public URLs
}

export class S3StorageService implements StorageService {
  private client: unknown | null = null;
  private readonly config: S3StorageConfig;

  constructor(config: S3StorageConfig) {
    this.config = config;
  }

  private async getClient() {
    if (this.client) return this.client;
    // Lazy import — only loads the SDK when S3 is actually used
    const { S3Client } = await import("@aws-sdk/client-s3");
    this.client = new S3Client({
      endpoint: this.config.endpoint,
      region: this.config.region,
      credentials: { accessKeyId: this.config.accessKeyId, secretAccessKey: this.config.secretAccessKey },
      forcePathStyle: this.config.forcePathStyle
    });
    return this.client;
  }

  async put(key: string, content: Readable): Promise<StoredObject> {
    const { Upload } = await import("@aws-sdk/lib-storage");
    const client = await this.getClient();

    const upload = new Upload({
      client: client as never,
      params: { Bucket: this.config.bucket, Key: key, Body: content }
    });
    const result = await upload.done();
    const size = (result as { ContentLength?: number })?.ContentLength ?? 0;
    return { key, size };
  }

  async get(key: string): Promise<Readable> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();
    const response = await (client as { send: (cmd: unknown) => Promise<{ Body?: Readable }> }).send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key }));
    if (!response.Body) throw new Error(`Object not found: ${key}`);
    return response.Body;
  }

  async exists(key: string): Promise<boolean> {
    const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();
    try {
      await (client as { send: (cmd: unknown) => Promise<unknown> }).send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.getClient();
    await (client as { send: (cmd: unknown) => Promise<unknown> }).send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }
}
