/**
 * Proves the backup can be restored, rather than that a backup exists.
 *
 * Every stage of disaster recovery already has a test of its own: the
 * encryption round-trips, the checksum notices drift, the export builds a
 * snapshot, the restore reads one. What none of them covers is the chain,
 * and the chain is where a backup fails silently. A field dropped between
 * capture and restore, a checksum taken over a different shape, a manifest
 * pointing at a key nothing wrote: each of those passes every unit test
 * above and loses the book.
 *
 * So this runs the whole thing in one go, through the real code, against an
 * in-memory object store: capture, checksum, encrypt, sign, upload, fetch
 * back, decrypt, restore, and compare the money that comes out against the
 * money that went in. It needs no credentials and no Postgres, so it runs
 * on every pull request.
 *
 * What it cannot prove is that the nightly job is pointed at the right
 * database. What it does prove is that the export, the encryption, the
 * decryption and the restore all work, which is every step that has ever
 * failed quietly.
 *
 * Upside Arena proves the same thing a different way, in
 * `scripts/restore-rehearsal.sh`, because its backup is a `pg_dump` and
 * this one is a JSON snapshot. Same rehearsal, different plumbing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bookChecksum } from "@/lib/dr/checksum";
import type { ColdStorageConfig, DrConfig } from "@/lib/dr/config";
import { decryptUtf8, isEncryptedSnapshot, parseEncryptionKey } from "@/lib/dr/encrypt";
import { exportEncryptedBook } from "@/lib/dr/export-book";
import { getObject } from "@/lib/dr/s3";
import { restoreInMemory } from "@/lib/dr/restore-schema";
import type { BookSnapshotPayload } from "@/lib/book-snapshot";

/** 32 bytes, base64, which is what `SNAPSHOT_ENCRYPTION_KEY` holds. */
const KEY = Buffer.alloc(32, 7).toString("base64");

const cold: ColdStorageConfig = {
  endpoint: "https://abc.r2.cloudflarestorage.com",
  region: "auto",
  bucket: "upside-lab-backups",
  accessKeyId: "AKIATEST",
  secretAccessKey: "secretsecret",
  prefix: "upside-lab/book-snapshots",
};

const config: DrConfig = {
  encryptionKey: KEY,
  accessToken: undefined,
  backupMaxAgeHours: 24,
  coldRetentionDays: 30,
  cold,
};

/** A book worth losing: two portfolios, four holdings, cash on both sides. */
function book(): BookSnapshotPayload {
  return {
    portfolios: [
      { id: "p1", name: "Aasad", cash_balance: -7000 },
      { id: "p2", name: "Karud", cash_balance: 12_500.25 },
    ],
    holdings: [
      { id: "h1", portfolio_id: "p1", ticker: "NBIS", shares: 500, buy_price: 109.96 },
      { id: "h2", portfolio_id: "p1", ticker: "CRWV", shares: 1100, buy_price: 83.27 },
      { id: "h3", portfolio_id: "p2", ticker: "RKLB", shares: 200, buy_price: 68.65 },
      { id: "h4", portfolio_id: "p2", ticker: "VST", shares: 0.5, buy_price: 145 },
    ],
    marks: { navByPortfolio: { p1: 1, p2: 2 } } as never,
  };
}

/** An object store that lives for one test, so the real signing runs. */
const stored = new Map<string, Buffer>();

beforeEach(() => {
  stored.clear();
  vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
    // The signer may put the bucket in the path or in the host depending on
    // the endpoint, so store under the object key either way.
    const key = new URL(String(url)).pathname
      .replace(/^\/+/, "")
      .replace(new RegExp(`^${cold.bucket}/`), "");
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "PUT") {
      const body = init?.body as Uint8Array | undefined;
      stored.set(key, Buffer.from(body ?? new Uint8Array()));
      return new Response(null, { status: 200 });
    }
    const hit = stored.get(key);
    if (!hit) return new Response("no such key", { status: 404 });
    return new Response(new Uint8Array(hit), { status: 200 });
  });
});

describe("the backup restores", () => {
  it("gives back the same money it was handed", async () => {
    const payload = book();
    const before = bookChecksum(payload);

    const result = await exportEncryptedBook({
      payload,
      checksum: before,
      wal: { ok: true, reason: "rehearsal" } as never,
      config,
      capturedAt: new Date("2026-08-24T03:00:00.000Z"),
    });
    expect(result.uploaded).toBe(true);
    expect(result.objectKey).toBeTruthy();

    // Down the wire and back, through the real signer and the real reader.
    const fetched = await getObject(cold, result.objectKey!);
    const token = fetched.toString("utf8");

    // Never in the clear. This is the whole reason for the encryption step.
    expect(isEncryptedSnapshot(token)).toBe(true);
    expect(token).not.toContain("NBIS");
    expect(token).not.toContain("Aasad");

    const snapshot = JSON.parse(decryptUtf8(token, parseEncryptionKey(KEY))) as {
      payload: BookSnapshotPayload;
    };
    const report = restoreInMemory(snapshot.payload);

    expect(report.ok).toBe(true);
    expect(report.restored.bookSum).toBe(before.bookSum);
    expect(report.restored.sha256).toBe(before.sha256);
  });

  it("writes a manifest beside it that names the object", async () => {
    const payload = book();
    const result = await exportEncryptedBook({
      payload,
      checksum: bookChecksum(payload),
      wal: { ok: true, reason: "rehearsal" } as never,
      config,
      capturedAt: new Date("2026-08-24T03:00:00.000Z"),
    });

    const manifest = JSON.parse(
      (await getObject(cold, result.manifestKey!)).toString("utf8")
    ) as { objectKey: string; encryption: string; checksum: { sha256: string } };

    // A manifest pointing at a key nothing wrote is a backup nobody can find.
    expect(manifest.objectKey).toBe(result.objectKey);
    expect(stored.has(manifest.objectKey)).toBe(true);
    expect(manifest.encryption).toBe("aes-256-gcm");
    expect(manifest.checksum.sha256).toBe(bookChecksum(payload).sha256);
  });

  it("refuses a snapshot somebody has edited", async () => {
    const payload = book();
    const result = await exportEncryptedBook({
      payload,
      checksum: bookChecksum(payload),
      wal: { ok: true, reason: "rehearsal" } as never,
      config,
      capturedAt: new Date("2026-08-24T03:00:00.000Z"),
    });

    const token = (await getObject(cold, result.objectKey!)).toString("utf8");
    const tampered = `${token.slice(0, -6)}ffffff`;
    expect(() => decryptUtf8(tampered, parseEncryptionKey(KEY))).toThrow();
  });

  it("notices when a holding does not come back", async () => {
    // The failure this exists to catch: the restore runs, reports success,
    // and the book is quietly short one position.
    const payload = book();
    const before = bookChecksum(payload);
    const short = { ...payload, holdings: payload.holdings.slice(0, 3) };

    const report = restoreInMemory(short);
    expect(report.restored.bookSum).not.toBe(before.bookSum);
  });

  it("will not write the book in the clear when the key is missing", async () => {
    const result = await exportEncryptedBook({
      payload: book(),
      checksum: bookChecksum(book()),
      wal: { ok: true, reason: "rehearsal" } as never,
      config: { ...config, encryptionKey: undefined },
      capturedAt: new Date("2026-08-24T03:00:00.000Z"),
    });
    expect(result.uploaded).toBe(false);
    expect(result.skipped).toBe(true);
    expect(stored.size).toBe(0);
  });
});
