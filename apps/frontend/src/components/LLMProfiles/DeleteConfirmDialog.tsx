import type { LLMProfile } from "@metaverse-systems/llm-tutor-shared";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(",");

export interface DeleteConfirmDialogProps {
  profile: LLMProfile;
  alternateProfiles: LLMProfile[];
  onConfirm: (alternateProfileId?: string) => Promise<void> | void;
  onCancel: () => void;
}

export const DeleteConfirmDialog: React.FC<DeleteConfirmDialogProps> = ({
  profile,
  alternateProfiles,
  onConfirm,
  onCancel
}) => {
  const dialogLabelId = useId();
  const dialogDescriptionId = useId();
  const selectLabelId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedAlternateId, setSelectedAlternateId] = useState<string>("");

  const requiresAlternate = profile.isActive;
  const hasAlternates = alternateProfiles.length > 0;

  useEffect(() => {
    if (!requiresAlternate) {
      setSelectedAlternateId("");
      return;
    }

    if (alternateProfiles.length === 0) {
      setSelectedAlternateId("");
      return;
    }

    const currentSelection = alternateProfiles.find((candidate) => candidate.id === selectedAlternateId);
    if (!currentSelection) {
      setSelectedAlternateId(alternateProfiles[0]?.id ?? "");
    }
  }, [alternateProfiles, requiresAlternate, selectedAlternateId]);

  const alternateOptions = useMemo(() => {
    return alternateProfiles.map((candidate) => ({
      id: candidate.id,
      name: candidate.name
    }));
  }, [alternateProfiles]);

  const setInitialFocus = useCallback(() => {
    const node = dialogRef.current;
    if (!node) {
      return;
    }

    if (requiresAlternate && hasAlternates && selectRef.current) {
      selectRef.current.focus();
      return;
    }

    const focusables = node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (focusables.length > 0) {
      focusables[0].focus();
      return;
    }

    node.focus();
  }, [hasAlternates, requiresAlternate]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      restoreFocusRef.current = activeElement;
    }

    setInitialFocus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const container = dialogRef.current;
      if (!container) {
        return;
      }

      const focusables = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!focusables.length) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !container.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const node = dialogRef.current;
    node?.addEventListener("keydown", onKeyDown);

    return () => {
      node?.removeEventListener("keydown", onKeyDown);

      const returnTarget = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (returnTarget) {
        window.requestAnimationFrame(() => returnTarget.focus());
      }
    };
  }, [onCancel, setInitialFocus]);

  const runConfirm = useCallback(async () => {
    if (isSubmitting) {
      return;
    }

    if (requiresAlternate) {
      if (!hasAlternates) {
        setFormError("Add another profile before deleting the active profile.");
        cancelButtonRef.current?.focus();
        return;
      }

      if (!selectedAlternateId) {
        setFormError("Select a profile to activate after deletion.");
        selectRef.current?.focus();
        return;
      }
    }

    setFormError(null);
    setIsSubmitting(true);

    try {
      await onConfirm(selectedAlternateId || undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete profile";
      setFormError(message);
      setIsSubmitting(false);
      deleteButtonRef.current?.focus();
      return;
    }
  }, [hasAlternates, isSubmitting, onConfirm, requiresAlternate, selectedAlternateId]);

  const dangerNote = requiresAlternate
    ? "Select another profile to activate before deleting."
    : "This action permanently removes the profile and stored credentials.";

  return (
    <div
      ref={dialogRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={dialogLabelId}
      aria-describedby={dialogDescriptionId}
      className="settings__dialog"
      data-testid="delete-confirm-dialog"
      tabIndex={-1}
    >
      <div className="settings__dialog-card app-card app-card--danger">
        <header className="settings__dialog-header app-stack-xs">
          <h2 id={dialogLabelId}>Delete {profile.name}?</h2>
          <p id={dialogDescriptionId} className="settings__dialog-subtitle">
            {dangerNote}
          </p>
        </header>

        <div className="app-stack-md">
          <p>
            Deleting this profile removes encrypted credentials and recent test results. This cannot be undone.
          </p>

          {requiresAlternate ? (
            <div className="app-stack-sm">
              <label id={selectLabelId} htmlFor="delete-alternate-select">
                Choose a profile to activate after deletion
              </label>
              <select
                id="delete-alternate-select"
                ref={selectRef}
                value={selectedAlternateId}
                onChange={(event) => setSelectedAlternateId(event.target.value)}
                aria-labelledby={selectLabelId}
                aria-describedby={formError ? `${selectLabelId}-error` : undefined}
                disabled={!hasAlternates || isSubmitting}
              >
                {alternateOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
              {!hasAlternates ? (
                <p className="settings__field-error" id={`${selectLabelId}-error`} role="alert">
                  Add another profile before deleting the active profile.
                </p>
              ) : null}
            </div>
          ) : (
            <p>This profile is inactive. You can safely remove it without impacting other connections.</p>
          )}

          {formError ? (
            <div className="settings__form-error" role="alert">
              {formError}
            </div>
          ) : null}
        </div>

        <footer className="settings__dialog-actions">
          <button
            type="button"
            className="app-button"
            onClick={onCancel}
            disabled={isSubmitting}
            ref={cancelButtonRef}
          >
            Cancel
          </button>
          <button
            type="button"
            className="app-button--danger"
            onClick={() => void runConfirm()}
            disabled={isSubmitting || (requiresAlternate && !hasAlternates)}
            aria-busy={isSubmitting}
            ref={deleteButtonRef}
          >
            {isSubmitting ? "Deleting…" : "Delete"}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default DeleteConfirmDialog;
