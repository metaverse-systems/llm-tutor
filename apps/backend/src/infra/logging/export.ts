import { serializeDiagnosticsSnapshot, type DiagnosticsSnapshot } from "@metaverse-systems/llm-tutor-shared";
import type { DiagnosticsSnapshotStore } from "../../api/diagnostics/routes";

export interface DiagnosticsExportOptions {
  store: Pick<DiagnosticsSnapshotStore, "listSnapshots">;
  now?: () => Date;
}

export interface DiagnosticsExportResult {
  filename: string;
  contentType: string;
  body: string;
  snapshotCount: number;
}

function formatExportTimestamp(source: Date): string {
  const iso = source.toISOString();
  return iso.replace(/\.\d{3}Z$/, "Z").replace(/:/g, "");
}

function normalizeSnapshot(snapshot: DiagnosticsSnapshot): string {
  const payload = serializeDiagnosticsSnapshot(snapshot);
  return JSON.stringify(payload);
}

export async function createDiagnosticsExport(
  options: DiagnosticsExportOptions
): Promise<DiagnosticsExportResult | null> {
  const { store, now } = options;
  const snapshots = await store.listSnapshots();

  if (snapshots.length === 0) {
    return null;
  }

  const lines = snapshots.map(normalizeSnapshot);
  const body = `${lines.join("\n")}\n`;
  const generatedAt = now?.() ?? new Date();
  const filename = `diagnostics-snapshot-${formatExportTimestamp(generatedAt)}.jsonl`;

  return {
    filename,
    contentType: "application/x-ndjson",
    body,
    snapshotCount: snapshots.length
  };
}
