import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { after, before, test } from "node:test";
import { LocalStorageService } from "../src/services/storage/local-storage.service.js";

let root: string;
let storage: LocalStorageService;

before(async () => {
  root = await mkdtemp(path.join(tmpdir(), "nexora-storage-"));
  storage = new LocalStorageService(root);
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

test("stores, reads and removes an object", async () => {
  const stored = await storage.put("tenant/document/version.txt", Readable.from(["nexora"]));

  assert.deepEqual(stored, { key: "tenant/document/version.txt", size: 6 });
  assert.equal(await storage.exists(stored.key), true);

  const content = await storage.get(stored.key);
  let value = "";
  for await (const chunk of content) {
    value += chunk.toString();
  }

  assert.equal(value, "nexora");

  await storage.delete(stored.key);
  assert.equal(await storage.exists(stored.key), false);
});

test("rejects keys that can escape the storage root", async () => {
  await assert.rejects(
    storage.put("../outside.txt", Readable.from(["blocked"])),
    /Invalid storage key/
  );
  await assert.rejects(
    storage.put("folder\\outside.txt", Readable.from(["blocked"])),
    /Invalid storage key/
  );
});
