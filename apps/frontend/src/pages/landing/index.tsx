import React, { useCallback, useEffect, useMemo, useState } from "react";
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

  const handleExportClick = useCallback(async () => {
    const success = await diagnostics.openLogDirectory();
    if (!success) {
      console.info("Diagnostics export bridge unavailable or declined");
    }
  }, [diagnostics]);

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
    </main>
  );
};

export default LandingPage;
