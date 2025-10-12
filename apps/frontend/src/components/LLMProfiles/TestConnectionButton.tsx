import type { LLMProfile, TestPromptResult } from "@metaverse-systems/llm-tutor-shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { TestTranscriptPanel } from "./TestTranscriptPanel";

type ConnectionStatus = "idle" | "loading" | "success" | "error";

interface TestConnectionButtonProps {
  profile: LLMProfile;
  testPrompt: (profileId?: string, promptText?: string) => Promise<TestPromptResult>;
  getTranscriptHistory?: (profileId: string) => TestPromptResult[];
  announce?: (message: string) => void;
  timeoutMs?: number;
}

const TIMEOUT_MS = 10_000;
const RESPONSE_PREVIEW_LIMIT = 100;

function formatLatency(latency: number | null | undefined): string | null {
  if (typeof latency !== "number" || Number.isNaN(latency) || latency < 0) {
    return null;
  }

  if (latency < 1000) {
    return `${Math.round(latency)} ms`;
  }

  const seconds = latency / 1000;
  return `${seconds.toFixed(1)} s`;
}

function truncateResponse(text: string | null | undefined): string | null {
  if (!text || text.trim().length === 0) {
    return null;
  }

  const normalized = text.trim();
  if (normalized.length <= RESPONSE_PREVIEW_LIMIT) {
    return normalized;
  }

  return `${normalized.slice(0, RESPONSE_PREVIEW_LIMIT).trimEnd()}…`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || "Test connection failed";
  }

  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  return "Test connection failed";
}

function formatTimeoutLabel(duration: number): string {
  if (!Number.isFinite(duration) || duration <= 0) {
    return "0 ms";
  }

  if (duration < 1000) {
    return `${Math.round(duration)} ms`;
  }

  const seconds = duration / 1000;
  if (Number.isInteger(seconds)) {
    return `${seconds} seconds`;
  }

  return `${seconds.toFixed(1)} seconds`;
}

export const TestConnectionButton: React.FC<TestConnectionButtonProps> = ({
  profile,
  testPrompt,
  getTranscriptHistory,
  announce,
  timeoutMs = TIMEOUT_MS
}) => {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [result, setResult] = useState<TestPromptResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const effectiveTimeout = Math.max(0, timeoutMs ?? TIMEOUT_MS);

  // Get transcript history for this profile
  const transcripts = getTranscriptHistory ? getTranscriptHistory(profile.id) : [];

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const clearPendingTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const updateStatus = useCallback(
    (nextStatus: ConnectionStatus, nextResult: TestPromptResult | null, nextError: string | null) => {
      if (!isMountedRef.current) {
        return;
      }

      setStatus(nextStatus);
      setResult(nextResult);
      setError(nextError);
    },
    []
  );

  const runTest = useCallback(async () => {
    if (status === "loading") {
      return;
    }

    const currentRequestId = requestIdRef.current + 1;
    requestIdRef.current = currentRequestId;

    updateStatus("loading", null, null);
    announce?.(`Testing ${profile.name}`);

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutRef.current = setTimeout(() => {
        reject(new Error(`Connection test timed out after ${formatTimeoutLabel(effectiveTimeout)}`));
      }, effectiveTimeout);
    });

    try {
      const raceResult = await Promise.race([testPrompt(profile.id), timeoutPromise]);

      if (requestIdRef.current !== currentRequestId) {
        return;
      }

      clearPendingTimeout();

      if (!raceResult.success) {
        const message = raceResult.errorMessage || "Test connection failed";
        updateStatus("error", null, message);
        announce?.(message);
        return;
      }

      updateStatus("success", raceResult, null);
      const latencyLabel = formatLatency(raceResult.latencyMs);
      const latencySuffix = latencyLabel ? ` in ${latencyLabel}` : "";
      announce?.(`Connection succeeded for ${profile.name}${latencySuffix}`);
    } catch (caughtError) {
      if (requestIdRef.current !== currentRequestId) {
        return;
      }

      clearPendingTimeout();
      const message = getErrorMessage(caughtError);
      updateStatus("error", null, message);
      announce?.(message);
    }
  }, [announce, clearPendingTimeout, effectiveTimeout, profile.id, profile.name, status, testPrompt, updateStatus]);

  const latencyLabel = formatLatency(result?.latencyMs ?? null);
  const responsePreview = truncateResponse(result?.responseText ?? null);

  return (
    <div className="settings__test-connection">
      <button
        type="button"
        className="app-button"
        onClick={() => void runTest()}
        disabled={status === "loading"}
        aria-busy={status === "loading"}
        data-testid={`test-connection-${profile.id}`}
      >
        {status === "loading" ? (
          <>
            <span className="settings__test-spinner" aria-hidden="true" data-testid="test-connection-spinner" />
            Testing…
          </>
        ) : (
          "Test connection"
        )}
      </button>

      <div
        className={`settings__test-status settings__test-status--${status}`}
        role="status"
        aria-live="polite"
        data-testid={`test-connection-status-${profile.id}`}
      >
        {status === "success" && result ? (
          <>
            <div className="settings__test-status-line" data-testid="test-connection-success">
              <span className="settings__test-status-icon settings__test-status-icon--success" aria-hidden="true">
                ✓
              </span>
              <span className="settings__test-status-message">
                Connected{latencyLabel ? ` (${latencyLabel})` : ""}
              </span>
            </div>
            {responsePreview ? (
              <p className="settings__test-status-preview" data-testid="test-connection-preview">
                {responsePreview}
              </p>
            ) : (
              <p className="settings__test-status-preview" data-testid="test-connection-preview-empty">
                No response preview available
              </p>
            )}
          </>
        ) : null}

        {status === "error" && error ? (
          <div className="settings__test-status-line" data-testid="test-connection-error">
            <span className="settings__test-status-icon settings__test-status-icon--error" aria-hidden="true">
              ✕
            </span>
            <span className="settings__test-status-message">{error}</span>
          </div>
        ) : null}

        {status === "loading" ? (
          <div className="settings__test-status-line" data-testid="test-connection-loading">
            <span className="settings__test-status-message">Testing connection…</span>
          </div>
        ) : null}
      </div>

      {transcripts.length > 0 && (
        <TestTranscriptPanel transcripts={transcripts} profileName={profile.name} />
      )}
    </div>
  );
};

export type { ConnectionStatus as TestConnectionStatus };
