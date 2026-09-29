import type { Readable } from "node:stream";

export interface StoredObject {
  key: string;
  size: number;
}

export interface StorageService {
  put(key: string, content: Readable): Promise<StoredObject>;
  get(key: string): Promise<Readable>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}
