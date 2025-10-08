import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AccessibilityPreferencePayload } from "@metaverse-systems/llm-tutor-shared";

import { DiagnosticsPanel } from "../../components/DiagnosticsPanel/DiagnosticsPanel";
import { AccessibilityToggles } from "../../components/AccessibilityToggles/AccessibilityToggles";
import { useDiagnostics } from "../../hooks/useDiagnostics";

interface AccessibilityPreferencesState {
  highContrast: boolean;
  reduceMotion: boolean;
  updatedAt: Date;
}

type TogglePreferences = Pick<AccessibilityPreferencesState, "highContrast" | "reduceMotion">;

interface DiagnosticsPreferencesBridge {
  setAccessibilityPreference?: (preference: AccessibilityPreferencePayload) => Promise<void>;
  saveAccessibilityPreference?: (preference: AccessibilityPreferencePayload) => Promise<void>;
  updateAccessibilityPreference?: (preference: AccessibilityPreferencePayload) => Promise<void>;
}

type ToastTone = "info" | "success" | "warning" | "error";

interface ToastMessage {
  id: string;
  message: string;
  tone: ToastTone;
  testId?: string;
}

const STORAGE_KEY = "llm-tutor:accessibility-preferences";

function defaultPreferences(): AccessibilityPreferencesState {
  return {
    highContrast: false,
    reduceMotion: false,
    updatedAt: new Date()
  };
}

function readStoredPreferences(): AccessibilityPreferencesState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<AccessibilityPreferencePayload>;
    if (typeof parsed.highContrast === "boolean" && typeof parsed.reduceMotion === "boolean") {
      const updatedAt = parsed.updatedAt ? new Date(parsed.updatedAt) : new Date();
      if (!Number.isNaN(updatedAt.getTime())) {
        return {
          highContrast: parsed.highContrast,
          reduceMotion: parsed.reduceMotion,
          updatedAt
        };
      }
    }
  } catch (error) {
    console.warn("Unable to read stored accessibility preferences", error);
  }

  return null;
}

function persistPreferencesLocally(preferences: AccessibilityPreferencesState): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const payload: AccessibilityPreferencePayload = {
      highContrast: preferences.highContrast,
      reduceMotion: preferences.reduceMotion,
      updatedAt: preferences.updatedAt.toISOString()
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("Unable to persist accessibility preferences", error);
  }
}

async function persistPreferencesThroughBridge(
  preferences: AccessibilityPreferencesState
): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }

  const bridge = window.llmTutor?.diagnostics as (DiagnosticsPreferencesBridge & {
    refreshSnapshot?: () => Promise<unknown>;
  }) | undefined;

  if (!bridge) {
    return false;
  }

  const payload: AccessibilityPreferencePayload = {
    highContrast: preferences.highContrast,
    reduceMotion: preferences.reduceMotion,
    updatedAt: preferences.updatedAt.toISOString()
  };

  const candidate =
    bridge.setAccessibilityPreference ??
    bridge.saveAccessibilityPreference ??
    bridge.updateAccessibilityPreference;

  if (typeof candidate !== "function") {
    return false;
  }

  try {
    await candidate(payload);
    return true;
  } catch (error) {
    console.warn("Diagnostics bridge failed to persist accessibility preferences", error);
    return false;
  }
}

function applyDocumentPreferences(preferences: AccessibilityPreferencesState): void {
  if (typeof document === "undefined") {
    return;
  }
  const body = document.body;
  if (!body) {
    return;
  }
  body.setAttribute("data-color-mode", preferences.highContrast ? "high-contrast" : "standard");
  body.setAttribute("data-reduce-motion", preferences.reduceMotion ? "true" : "false");
}

export const LandingPage: React.FC = () => {
  const diagnostics = useDiagnostics();
  const [preferences, setPreferences] = useState<AccessibilityPreferencesState>(() => {
    return readStoredPreferences() ?? defaultPreferences();
  });
  const [isPersisting, setIsPersisting] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastIdRef = useRef(0);
  const seenWarningsRef = useRef<Set<string>>(new Set());
  const exportButtonRef = useRef<HTMLButtonElement | null>(null);

  const createToastId = useCallback(() => {
    toastIdRef.current += 1;
    return `toast-${toastIdRef.current}`;
  }, []);

  const addToast = useCallback(
    (message: string, tone: ToastTone, options?: { testId?: string }) => {
      const id = createToastId();
      setToasts((current) => {
        const next = [...current.slice(-4), { id, message, tone, testId: options?.testId }];
        return next;
      });
    },
    [createToastId]
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    applyDocumentPreferences(preferences);
    return () => {
      applyDocumentPreferences(defaultPreferences());
    };
  }, [preferences]);

  useEffect(() => {
    const snapshotPreferences = diagnostics.snapshot?.activePreferences;
    if (!snapshotPreferences) {
      return;
    }

    const nextUpdatedAt = snapshotPreferences.updatedAt
      ? new Date(snapshotPreferences.updatedAt)
      : diagnostics.lastUpdatedAt ?? new Date();

    if (Number.isNaN(nextUpdatedAt.getTime())) {
      return;
    }

    setPreferences((current) => {
      if (nextUpdatedAt.getTime() <= current.updatedAt.getTime()) {
        return current;
      }
      const next: AccessibilityPreferencesState = {
        highContrast: snapshotPreferences.highContrast,
        reduceMotion: snapshotPreferences.reduceMotion,
        updatedAt: nextUpdatedAt
      };
      persistPreferencesLocally(next);
      return next;
    });
  }, [diagnostics.snapshot?.activePreferences, diagnostics.lastUpdatedAt]);

  useEffect(() => {
    const seen = seenWarningsRef.current;
    diagnostics.warnings.forEach((warning) => {
      if (!warning || seen.has(warning)) {
        return;
      }
      seen.add(warning);
      addToast(warning, "warning", { testId: "diagnostics-warning-toast" });
    });
  }, [diagnostics.warnings, addToast]);

  useEffect(() => {
    if (!isExportDialogOpen) {
      return;
    }

    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsExportDialogOpen(false);
      }
    };

    window.addEventListener("keydown", handler);
    exportButtonRef.current?.focus();

    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [isExportDialogOpen]);

  const handleToggleChange = useCallback(
    async (next: TogglePreferences) => {
      const nextState: AccessibilityPreferencesState = {
        highContrast: next.highContrast,
        reduceMotion: next.reduceMotion,
        updatedAt: new Date()
      };

      setPreferences(nextState);
      persistPreferencesLocally(nextState);

      setIsPersisting(true);
      const persisted = await persistPreferencesThroughBridge(nextState);
      if (persisted) {
        void diagnostics.requestSummary().catch(() => undefined);
      }
      setIsPersisting(false);
    },
    [diagnostics]
  );

  const handleExportClick = useCallback(() => {
    setIsExportDialogOpen(true);
  }, []);

  const handleExportDownload = useCallback(async () => {
    setIsExporting(true);
    const result = await diagnostics.exportSnapshot();
    setIsExporting(false);

    if (result.success) {
      const filename = result.filename ? `Saved ${result.filename}` : "Diagnostics snapshot ready";
      addToast(filename, "success");
      setIsExportDialogOpen(false);
    } else {
      addToast("Diagnostics export failed. Check logs for details.", "error");
    }
  }, [addToast, diagnostics]);

  const handleOpenDirectory = useCallback(async () => {
    const success = await diagnostics.openLogDirectory();
    if (!success) {
      addToast("Unable to open diagnostics directory.", "error");
    }
  }, [addToast, diagnostics]);

  const handleCloseExportDialog = useCallback(() => {
    setIsExportDialogOpen(false);
  }, []);

  const lastUpdatedLabel = useMemo(() => {
    if (!diagnostics.lastUpdatedAt) {
      return "Awaiting first snapshot";
    }

    try {
      const formatter = new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
      });
      return formatter.format(diagnostics.lastUpdatedAt);
    } catch (error) {
      console.warn("Unable to format diagnostics timestamp", error);
      return diagnostics.lastUpdatedAt.toLocaleString();
    }
  }, [diagnostics.lastUpdatedAt]);

  return (
    <main role="main" className="landing" aria-busy={diagnostics.isLoading}>
      <header className="landing__hero">
        <h1>Diagnostics overview</h1>
        <p className="landing__lead">
          Monitor the local-only LLM Tutor runtime, confirm llama.cpp status, and keep accessibility front-of-mind.
        </p>
        <div className="landing__cta">
          <button
            type="button"
            onClick={handleExportClick}
            data-testid="landing-diagnostics-cta"
            className="landing__cta-button"
          >
            Export diagnostics snapshot
          </button>
          <p className="landing__meta" role="status" aria-live="polite">
            Last updated: {lastUpdatedLabel}
          </p>
        </div>
      </header>

      {diagnostics.isOffline ? (
        <div className="landing__alert" role="alert">
          Diagnostics service is offline. We'll retry automatically.
          {diagnostics.error ? ` (${diagnostics.error})` : ""}
        </div>
      ) : null}

      {toasts.length > 0 ? (
        <div className="landing__toasts" role="region" aria-live="assertive" aria-label="Diagnostics notifications">
          <ul>
            {toasts.map((toast) => (
              <li
                key={toast.id}
                role="alert"
                className={`landing__toast landing__toast--${toast.tone}`}
                data-testid={toast.testId}
              >
                <span>{toast.message}</span>
                <button
                  type="button"
                  aria-label="Dismiss notification"
                  onClick={() => dismissToast(toast.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <DiagnosticsPanel
        snapshot={diagnostics.snapshot}
        backend={diagnostics.backend}
        warnings={diagnostics.warnings}
        isLoading={diagnostics.isLoading}
        disableAnimations={preferences.reduceMotion}
      />

      <AccessibilityToggles
        preferences={{
          highContrast: preferences.highContrast,
          reduceMotion: preferences.reduceMotion
        }}
        onChange={handleToggleChange}
        isPersisting={isPersisting}
      />

      {isExportDialogOpen ? (
        <div className="landing__export-overlay" role="presentation">
          <div
            className="landing__export-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="diagnostics-export-heading"
          >
            <header className="landing__export-header">
              <h2 id="diagnostics-export-heading">Export diagnostics snapshot</h2>
              <button type="button" className="landing__export-close" onClick={handleCloseExportDialog} aria-label="Close export dialog">
                ×
              </button>
            </header>
            <p className="landing__export-copy">
              Export the most recent diagnostics snapshot as a JSONL file or open the diagnostics directory to review historical logs.
            </p>
            <div className="landing__export-actions">
              <button
                type="button"
                ref={exportButtonRef}
                data-testid="diagnostics-export-button"
                className="landing__export-primary"
                onClick={handleExportDownload}
                disabled={isExporting}
                aria-busy={isExporting}
              >
                {isExporting ? "Preparing export…" : "Download latest snapshot"}
              </button>
              <button
                type="button"
                className="landing__export-secondary"
                onClick={handleOpenDirectory}
              >
                Open diagnostics directory
              </button>
            </div>
            <footer className="landing__export-footer">
              <button type="button" className="landing__export-cancel" onClick={handleCloseExportDialog}>
                Cancel
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </main>
  );
};

export default LandingPage;
