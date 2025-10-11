import type { ProviderType } from "@metaverse-systems/llm-tutor-shared";
import { useCallback, useEffect, useId, useMemo, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(",");

const CONSENT_NOTICE_VERSION = "llm-remote-provider-v1";

interface DiagnosticsBridgeLike {
  getState?: () => Promise<DiagnosticsStatePayloadLike>;
  updatePreferences?: (payload: DiagnosticsPreferenceUpdatePayloadLike) => Promise<unknown>;
}

interface DiagnosticsStatePayloadLike {
  preferences?: DiagnosticsPreferenceRecordLike | null;
  latestSnapshot?: {
    activePreferences?: DiagnosticsPreferenceRecordLike | null;
  } | null;
}

interface DiagnosticsPreferenceRecordLike {
  highContrastEnabled?: boolean;
  reducedMotionEnabled?: boolean;
  remoteProvidersEnabled?: boolean;
  consentSummary?: string;
}

interface DiagnosticsPreferenceUpdatePayloadLike {
  highContrastEnabled: boolean;
  reducedMotionEnabled: boolean;
  remoteProvidersEnabled: boolean;
  consentSummary: string;
  consentEvent?: ConsentEventLogPayloadLike;
}

interface ConsentEventLogPayloadLike {
  eventId: string;
  occurredAt: string;
  actor: "learner" | "maintainer";
  previousState: "disabled" | "enabled";
  nextState: "disabled" | "enabled";
  noticeVersion: string;
  channel: "ui-toggle" | "config-migration";
}

export interface ConsentDecision {
  providerType: ProviderType;
  providerName: string;
  consentGranted: boolean;
  timestamp: number;
}

export interface ConsentDialogProps {
  providerType: ProviderType;
  providerName: string;
  onAccept: (decision: ConsentDecision) => void;
  onCancel: (decision: ConsentDecision) => void;
  learnMoreHref?: string;
}

function getDiagnosticsBridge(): DiagnosticsBridgeLike | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.llmTutor?.diagnostics ?? null;
}

function generateEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `consent-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function logConsentDecision(decision: ConsentDecision): Promise<void> {
  const bridge = getDiagnosticsBridge();
  if (!bridge?.updatePreferences) {
    return;
  }

  let baseline: DiagnosticsPreferenceRecordLike | null = null;
  if (bridge.getState) {
    try {
      const state = await bridge.getState();
      baseline = state?.preferences ?? state?.latestSnapshot?.activePreferences ?? null;
    } catch (error) {
      console.warn("ConsentDialog: failed to read diagnostics preferences", error);
    }
  }

  const previousState = baseline?.remoteProvidersEnabled ? "enabled" : "disabled";
  const nextState = decision.consentGranted ? "enabled" : "disabled";

  const consentEvent: ConsentEventLogPayloadLike = {
    eventId: generateEventId(),
    occurredAt: new Date(decision.timestamp).toISOString(),
    actor: "learner",
    previousState,
    nextState,
    noticeVersion: CONSENT_NOTICE_VERSION,
    channel: "ui-toggle"
  };

  const payload: DiagnosticsPreferenceUpdatePayloadLike = {
    highContrastEnabled: baseline?.highContrastEnabled ?? false,
    reducedMotionEnabled: baseline?.reducedMotionEnabled ?? false,
    remoteProvidersEnabled: decision.consentGranted ? true : baseline?.remoteProvidersEnabled ?? false,
    consentSummary: decision.consentGranted
      ? `Remote providers enabled (${decision.providerName})`
      : "Remote providers are disabled",
    consentEvent
  };

  try {
    await bridge.updatePreferences(payload);
  } catch (error) {
    console.warn("ConsentDialog: failed to log consent decision", error);
  }
}

export const ConsentDialog: React.FC<ConsentDialogProps> = ({
  providerName,
  providerType,
  onAccept,
  onCancel,
  learnMoreHref
}) => {
  const dialogLabelId = useId();
  const dialogDescriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const handleDecision = useCallback(
    async (consentGranted: boolean) => {
      const decision: ConsentDecision = {
        providerName,
        providerType,
        consentGranted,
        timestamp: Date.now()
      };

      await logConsentDecision(decision);

      if (consentGranted) {
        onAccept(decision);
      } else {
        onCancel(decision);
      }
    },
    [onAccept, onCancel, providerName, providerType]
  );

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      restoreFocusRef.current = activeElement;
    }

    const node = dialogRef.current;
    const focusable = node?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [];
    const target = focusable[0] ?? node;

    target?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void handleDecision(false);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const currentNode = dialogRef.current;
      const focusables = currentNode?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [];
      if (!focusables.length) {
        event.preventDefault();
        currentNode?.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !currentNode?.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    node?.addEventListener("keydown", onKeyDown);

    return () => {
      node?.removeEventListener("keydown", onKeyDown);

      const returnTarget = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (returnTarget) {
        window.requestAnimationFrame(() => returnTarget.focus());
      }
    };
  }, [handleDecision]);

  const providerDescription = useMemo(() => {
    switch (providerType) {
      case "azure":
        return "Microsoft Azure OpenAI";
      case "custom":
        return "a remote HTTP LLM provider";
      default:
        return providerName;
    }
  }, [providerName, providerType]);

  const learnMoreUrl = learnMoreHref ??
    "https://github.com/metaverse-systems/llm-tutor/blob/main/docs/privacy-llm.md";

  return (
    <div
      ref={dialogRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={dialogLabelId}
      aria-describedby={dialogDescriptionId}
      className="settings__dialog"
      data-testid="consent-dialog"
      tabIndex={-1}
    >
      <div className="settings__dialog-card app-card">
        <header className="settings__dialog-header app-stack-xs">
          <h2 id={dialogLabelId}>Remote provider consent required</h2>
          <p id={dialogDescriptionId} className="settings__dialog-subtitle">
            Connecting to {providerDescription} will send prompts and responses over the internet.
            Review the privacy notice before proceeding.
          </p>
        </header>

        <div className="app-stack-md">
          <p>
            By continuing, you understand that your data may be processed by {providerDescription}. This includes any test prompts
            you run from the Settings panel.
          </p>
          <p>
            Read more about how we handle remote providers in our
            {' '}
            <a href={learnMoreUrl} target="_blank" rel="noreferrer" className="app-link">
              privacy documentation
            </a>
            .
          </p>
        </div>

        <footer className="settings__dialog-actions">
          <button
            type="button"
            className="app-button"
            onClick={() => void handleDecision(false)}
            data-testid="consent-cancel-button"
          >
            Cancel
          </button>
          <button
            type="button"
            className="app-button--primary"
            onClick={() => void handleDecision(true)}
            data-testid="consent-accept-button"
          >
            Accept &amp; continue
          </button>
        </footer>
      </div>
    </div>
  );
};

export default ConsentDialog;
