import { env } from "../../config/env.js";
import { LocalStorageService } from "./local-storage.service.js";
import { S3StorageService } from "./s3-storage.service.js";
import type { StorageService } from "./storage.service.js";

function createStorage(): StorageService {
  switch (env.STORAGE_DRIVER) {
    case "local":
      return new LocalStorageService(env.STORAGE_LOCAL_ROOT);
    case "s3":
      if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
        throw new Error("S3 storage requires S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY");
      }
      return new S3StorageService({
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        bucket: env.S3_BUCKET,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        forcePathStyle: env.S3_FORCE_PATH_STYLE
      });
    default:
      return new LocalStorageService(env.STORAGE_LOCAL_ROOT);
  }
}

export const storage = createStorage();
export type { StorageService, StoredObject } from "./storage.service.js";
