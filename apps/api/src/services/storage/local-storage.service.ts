import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import type { StorageService, StoredObject } from "./storage.service.js";

export class LocalStorageService implements StorageService {
  constructor(private readonly root: string) {}

  async put(key: string, content: Readable): Promise<StoredObject> {
    const target = this.resolveKey(key);
    const temporary = `${target}.${crypto.randomUUID()}.tmp`;
    await mkdir(path.dirname(target), { recursive: true });

    try {
      await pipeline(content, createWriteStream(temporary, { flags: "wx" }));
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }

    const metadata = await stat(target);
    return { key, size: metadata.size };
  }

  async get(key: string): Promise<Readable> {
    const target = this.resolveKey(key);
    await access(target);
    return createReadStream(target);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }

  private resolveKey(key: string): string {
    if (!key || path.isAbsolute(key) || key.includes("..") || key.includes("\\")) {
      throw new Error("Invalid storage key");
    }

    const root = path.resolve(this.root);
    const target = path.resolve(root, key);

    if (!target.startsWith(`${root}${path.sep}`)) {
      throw new Error("Invalid storage key");
    }

    return target;
  }
}
