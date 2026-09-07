import type { BookSnapshotPayload } from "@/lib/book-snapshot";
import { captureBookPayload } from "@/lib/book-snapshot";
import { bookChecksum, type BookChecksum } from "@/lib/dr/checksum";
import { readDrConfig, type DrConfig } from "@/lib/dr/config";
import { encryptUtf8, parseEncryptionKey } from "@/lib/dr/encrypt";
import { putObject } from "@/lib/dr/s3";
import { purgeExpiredColdSnapshots, type ColdRetentionResult } from "@/lib/dr/retention";
import type { WalBackupCheck } from "@/lib/dr/wal-backups";
import { verifyWalBackups } from "@/lib/dr/wal-backups";
import { supabaseProjectRef } from "@/lib/supabase/env";
import type { SupabaseClient } from "@supabase/supabase-js";

export const COLD_SNAPSHOT_VERSION = 1 as const;

export type ColdBookSnapshot = {
  version: typeof COLD_SNAPSHOT_VERSION;
  capturedAt: string;
  kind: "cold";
  payload: BookSnapshotPayload;
  checksum: BookChecksum;
};

export type ColdManifest = {
  version: typeof COLD_SNAPSHOT_VERSION;
  capturedAt: string;
  objectKey: string;
  checksum: BookChecksum;
  wal: WalBackupCheck;
  encryption: "aes-256-gcm";
};

export type ColdExportResult = {
  uploaded: boolean;
  skipped?: boolean;
  reason: string;
  objectKey?: string;
  manifestKey?: string;
};

export type DrJobResult = {
  ok: boolean;
  capturedAt: string;
  checksum: BookChecksum | null;
  wal: WalBackupCheck;
  cold: ColdExportResult;
  retention: ColdRetentionResult | null;
  warnings: string[];
};

function objectKeys(capturedAt: Date, prefix: string): {
  objectKey: string;
  manifestKey: string;
} {
  const iso = capturedAt.toISOString();
  const day = iso.slice(0, 10);
  const [y, m, d] = day.split("-");
  const stamp = iso.replace(/[:.]/g, "-");
  const base = `${prefix}/${y}/${m}/${d}/book-${stamp}`;
  return {
    objectKey: `${base}.json.ulenc`,
    manifestKey: `${base}.manifest.json`,
  };
}

export async function exportEncryptedBook(opts: {
  payload: BookSnapshotPayload;
  checksum: BookChecksum;
  wal: WalBackupCheck;
  config: DrConfig;
  capturedAt?: Date;
}): Promise<ColdExportResult> {
  const { payload, checksum, wal, config } = opts;
  const capturedAt = opts.capturedAt ?? new Date();
  if (!config.cold) {
    return {
      uploaded: false,
      skipped: true,
      reason:
        "Cold storage skipped. Set DR_S3_BUCKET, DR_S3_ACCESS_KEY_ID, and DR_S3_SECRET_ACCESS_KEY (R2: also DR_S3_ENDPOINT).",
    };
  }
  if (!config.encryptionKey) {
    return {
      uploaded: false,
      skipped: true,
      reason:
        "Cold storage skipped. SNAPSHOT_ENCRYPTION_KEY is required so the book is never written in the clear.",
    };
  }
  const key = parseEncryptionKey(config.encryptionKey);
  const snapshot: ColdBookSnapshot = {
    version: COLD_SNAPSHOT_VERSION,
    capturedAt: capturedAt.toISOString(),
    kind: "cold",
    payload,
    checksum,
  };
  const { objectKey, manifestKey } = objectKeys(capturedAt, config.cold.prefix);
  const encrypted = encryptUtf8(JSON.stringify(snapshot), key);
  const manifest: ColdManifest = {
    version: COLD_SNAPSHOT_VERSION,
    capturedAt: snapshot.capturedAt,
    objectKey,
    checksum,
    wal,
    encryption: "aes-256-gcm",
  };
  await putObject(
    config.cold,
    objectKey,
    Buffer.from(encrypted, "utf8")
  );
  await putObject(
    config.cold,
    manifestKey,
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  );
  return {
    uploaded: true,
    reason: `Encrypted book uploaded to ${objectKey}.`,
    objectKey,
    manifestKey,
  };
}

/*
  A nightly job that throws says only what the provider said.

  On 7 September 2026 the run died and the alert read "Disaster recovery
  failed: JWT issued at future" -- PostgREST's PGRST303, a clock skew
  between Supabase's own services, and nothing whatever about which of
  this job's steps was holding the connection when it happened. Reading
  the book, listing the backups and writing to R2 are three different
  faults with three different answers, and the message that summons a
  human at 03:00 named none of them.

  So each step says what it was doing. The provider's own sentence is kept
  verbatim after it, because that is the part that is searchable, and the
  original is kept as the `cause` so nothing is lost by the wrapping.
*/
async function during<T>(what: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`${what}: ${detail}`, { cause: err });
  }
}

export async function runDisasterRecoveryJob(opts: {
  supabase: SupabaseClient;
  config?: DrConfig;
  now?: Date;
  fetchImpl?: typeof fetch;
}): Promise<DrJobResult> {
  const config = opts.config ?? readDrConfig();
  const capturedAt = opts.now ?? new Date();
  const warnings: string[] = [];

  const wal = await during("while listing the Supabase backups", () =>
    verifyWalBackups({
      projectRef: supabaseProjectRef(),
      accessToken: config.accessToken,
      maxAgeHours: config.backupMaxAgeHours,
      fetchImpl: opts.fetchImpl,
      now: capturedAt,
    })
  );
  if (!wal.skipped && !wal.ok) warnings.push(wal.reason);

  const payload = await during("while reading the book from Supabase", () =>
    captureBookPayload(opts.supabase)
  );
  const checksum = bookChecksum(payload);
  const cold = await during("while writing the encrypted cold copy", () =>
    exportEncryptedBook({
      payload,
      checksum,
      wal,
      config,
      capturedAt,
    })
  );
  if (cold.skipped) warnings.push(cold.reason);

  let retention: ColdRetentionResult | null = null;
  if (config.cold) {
    try {
      retention = await purgeExpiredColdSnapshots({
        config: config.cold,
        retentionDays: config.coldRetentionDays,
        now: capturedAt,
      });
      if (retention.errors.length) {
        warnings.push(
          `Cold retention purge had ${retention.errors.length} error(s): ${retention.errors.join(" | ")}`
        );
      }
    } catch (err) {
      warnings.push(
        `Cold retention purge failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const ok =
    checksum.portfolioCount >= 0 &&
    (wal.skipped || wal.ok) &&
    (cold.skipped || cold.uploaded);

  return {
    ok,
    capturedAt: capturedAt.toISOString(),
    checksum,
    wal,
    cold,
    retention,
    warnings,
  };
}
