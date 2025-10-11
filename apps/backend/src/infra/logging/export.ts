import { serializeDiagnosticsSnapshot, type DiagnosticsSnapshot } from "@metaverse-systems/llm-tutor-shared";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { DIAGNOSTICS_EVENTS_FILE_NAME } from "./diagnostics-logger.js";
import type { DiagnosticsSnapshotStore } from "../../api/diagnostics/routes.js";

export interface DiagnosticsExportOptions {
  store: Pick<DiagnosticsSnapshotStore, "listSnapshots">;
  now?: () => Date;
  eventsDirectory?: string | null;
  eventsFileName?: string;
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

async function loadDiagnosticsEventLines(options: {
  directory?: string | null | undefined;
  fileName?: string;
}): Promise<string[]> {
  const directory = options.directory?.trim();
  if (!directory) {
    return [];
  }

  const fileName = options.fileName && options.fileName.trim().length > 0
    ? options.fileName.trim()
    : DIAGNOSTICS_EVENTS_FILE_NAME;
  const target = path.join(directory, fileName);

  let contents: string;
  try {
    contents = await readFile(target, "utf-8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return [];
    }
    return [];
  }

  const lines: string[] = [];
  for (const rawLine of contents.split(/\r?\n/u)) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      lines.push(JSON.stringify(parsed));
    } catch {
      continue;
    }
  }

  return lines;
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
  const fallbackDirectory = snapshots
    .map((snapshot) => snapshot.logDirectory)
    .filter((directory): directory is string => typeof directory === "string" && directory.length > 0)
    .at(-1);
  const eventLines = await loadDiagnosticsEventLines({
    directory: options.eventsDirectory ?? fallbackDirectory,
    fileName: options.eventsFileName
  });

  const bodyLines = [...lines, ...eventLines];
  const body = `${bodyLines.join("\n")}\n`;
  const generatedAt = now?.() ?? new Date();
  const filename = `diagnostics-snapshot-${formatExportTimestamp(generatedAt)}.jsonl`;

  return {
    filename,
    contentType: "application/x-ndjson",
    body,
    snapshotCount: snapshots.length
  };
}
