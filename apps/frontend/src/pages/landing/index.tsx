import type { DiagnosticsPreferenceRecordPayload } from "@metaverse-systems/llm-tutor-shared";
import { useThemeMode } from "@metaverse-systems/llm-tutor-shared";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AccessibilityToggles } from "../../components/AccessibilityToggles/AccessibilityToggles";
import { DiagnosticsPanel } from "../../components/DiagnosticsPanel/DiagnosticsPanel";
import { Header } from "../../components/Header/Header";
import { useDiagnostics } from "../../hooks/useDiagnostics";

type ToastTone = "info" | "success" | "warning" | "error";

interface ToastMessage {
  id: string;
  message: string;
  tone: ToastTone;
  testId?: string;
}
export const LandingPage: React.FC = () => {
  const diagnostics = useDiagnostics();
  const { appearance, motion, setAppearance, setMotion } = useThemeMode();
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastIdRef = useRef(0);
  const seenWarningsRef = useRef<Set<string>>(new Set());
  const seenStorageAlertsRef = useRef<Set<string>>(new Set());
  const exportButtonRef = useRef<HTMLButtonElement | null>(null);
  const [previewPreferences, setPreviewPreferences] = useState<{
    highContrast: boolean;
    reduceMotion: boolean;
    remoteProviders: boolean;
  } | null>(null);

  const previewPreferenceRecord = useMemo((): DiagnosticsPreferenceRecordPayload | null => {
    if (!previewPreferences) {
      return null;
    }

    const baseline = diagnostics.preferences ?? diagnostics.snapshot?.activePreferences ?? null;
    const consentSummary = previewPreferences.remoteProviders ? "Remote providers enabled" : "Remote providers are disabled";

    return {
      id: baseline?.id ?? "preview-preferences",
      highContrastEnabled: previewPreferences.highContrast,
      reducedMotionEnabled: previewPreferences.reduceMotion,
      remoteProvidersEnabled: previewPreferences.remoteProviders,
      consentSummary,
      updatedBy: "renderer",
      lastUpdatedAt: new Date().toISOString(),
      consentEvents: baseline?.consentEvents ?? [],
      storageHealth: baseline?.storageHealth ?? null
    };
  }, [diagnostics.preferences, diagnostics.snapshot?.activePreferences, previewPreferences]);

  const activePreferences = useMemo(() => {
    return previewPreferenceRecord ?? diagnostics.preferences ?? diagnostics.snapshot?.activePreferences ?? null;
  }, [diagnostics.preferences, diagnostics.snapshot?.activePreferences, previewPreferenceRecord]);

  const derivedPreferences = useMemo(() => {
    if (previewPreferences) {
      return previewPreferences;
    }
    return {
      highContrast: activePreferences?.highContrastEnabled ?? false,
      reduceMotion: activePreferences?.reducedMotionEnabled ?? false,
      remoteProviders: activePreferences?.remoteProvidersEnabled ?? false
    };
  }, [activePreferences, previewPreferences]);

  const storageHealthAlert = useMemo(() => {
    return diagnostics.storageHealth ?? activePreferences?.storageHealth ?? null;
  }, [diagnostics.storageHealth, activePreferences?.storageHealth]);

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
    if (previewPreferences) {
      return;
    }

    const nextAppearance = derivedPreferences.highContrast ? "high-contrast" : "standard";
    const nextMotion = derivedPreferences.reduceMotion ? "reduced" : "full";

    if (appearance !== nextAppearance) {
      setAppearance(nextAppearance);
    }
    if (motion !== nextMotion) {
      setMotion(nextMotion);
    }
  }, [appearance, derivedPreferences.highContrast, derivedPreferences.reduceMotion, motion, previewPreferences, setAppearance, setMotion]);

  useEffect(() => {
    if (!previewPreferences) {
      return;
    }

    const nextPreferences = diagnostics.preferences;
    if (!nextPreferences) {
      return;
    }

    const matchesPersistedPreferences =
      nextPreferences.highContrastEnabled === previewPreferences.highContrast &&
      nextPreferences.reducedMotionEnabled === previewPreferences.reduceMotion &&
      nextPreferences.remoteProvidersEnabled === previewPreferences.remoteProviders;

    if (matchesPersistedPreferences) {
      setPreviewPreferences(null);
    }
  }, [diagnostics.preferences, previewPreferences]);

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
    if (!storageHealthAlert || storageHealthAlert.status === "ok") {
      return;
    }
    const key = `${storageHealthAlert.detectedAt}:${storageHealthAlert.message}`;
    const seen = seenStorageAlertsRef.current;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    addToast(
      `${storageHealthAlert.message}. ${storageHealthAlert.recommendedAction}`,
      "error",
      { testId: "diagnostics-storage-alert-toast" }
    );
  }, [storageHealthAlert, addToast]);

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
    async (next: { highContrast: boolean; reduceMotion: boolean; remoteProviders: boolean }) => {
      setPreviewPreferences(next);

      const summary = next.remoteProviders ? "Remote providers enabled" : "Remote providers are disabled";

      try {
        if (typeof window !== "undefined") {
          window.__diagnosticsDebug = {
            ...(window.__diagnosticsDebug ?? {}),
            previewPreferences: next
          };
        }

        const outcome = await diagnostics.updatePreferences({
          highContrastEnabled: next.highContrast,
          reducedMotionEnabled: next.reduceMotion,
          remoteProvidersEnabled: next.remoteProviders,
          consentSummary: summary
        });

        if (typeof window !== "undefined") {
          window.__diagnosticsDebug = {
            ...(window.__diagnosticsDebug ?? {}),
            lastPreferenceOutcome: outcome
          };
        }

        if (!outcome) {
          return;
        }
      } catch (error) {
        console.warn("Failed to persist diagnostics preferences", error);
        addToast("Diagnostics preferences could not be saved. Check logs for details.", "error");
      }
    },
    [addToast, diagnostics]
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
    <>
      <Header />
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
            <p
            className="landing__meta"
            data-testid="diagnostics-snapshot-status"
            role="status"
            aria-live="polite"
          >
            {diagnostics.snapshot ? "Snapshot ready" : "Snapshot pending…"}
          </p>
        </div>
      </header>

      {diagnostics.isOffline ? (
        <div className="landing__alert" role="alert">
          Diagnostics service is offline. We&rsquo;ll retry automatically.
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
        disableAnimations={derivedPreferences.reduceMotion}
        preferences={activePreferences}
        storageHealth={storageHealthAlert}
      />

      <AccessibilityToggles
        remoteProviders={derivedPreferences.remoteProviders}
        onChange={handleToggleChange}
        isPersisting={diagnostics.isUpdatingPreferences}
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
    </>
  );
};

export default LandingPage;
