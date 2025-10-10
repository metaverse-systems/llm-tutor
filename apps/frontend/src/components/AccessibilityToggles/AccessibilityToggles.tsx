import { useThemeMode } from "@metaverse-systems/llm-tutor-shared";
import React, { useCallback, useMemo } from "react";

interface ToggleState {
  highContrast: boolean;
  reduceMotion: boolean;
  remoteProviders: boolean;
}

interface AccessibilityTogglesProps {
  remoteProviders: boolean;
  onChange: (next: ToggleState) => void | Promise<void>;
  isPersisting?: boolean;
}

interface ToggleConfig {
  id: string;
  label: string;
  value: boolean;
  description: string;
  onToggle: () => Promise<void> | void;
}

function createSwitchAriaLabel(label: string, value: boolean): string {
  return `${label} ${value ? "on" : "off"}`;
}

export const AccessibilityToggles: React.FC<AccessibilityTogglesProps> = ({
  remoteProviders,
  onChange,
  isPersisting = false
}) => {
  const { appearance, motion, toggleAppearance, toggleMotion } = useThemeMode();
  const highContrast = appearance === "high-contrast";
  const reduceMotion = motion === "reduced";

  const currentState = useMemo<ToggleState>(
    () => ({ highContrast, reduceMotion, remoteProviders }),
    [highContrast, reduceMotion, remoteProviders]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, toggleAction: () => void | Promise<void>) => {
      if (event.key === " " || event.key === "Space" || event.key === "Spacebar" || event.key === "Enter") {
        event.preventDefault();
        void toggleAction();
      }
    },
    []
  );

  const switches = useMemo<ToggleConfig[]>(
    () => [
      {
        id: "landing-accessibility-toggle-high-contrast",
        label: "High contrast",
        value: highContrast,
        description: "Increase contrast for text and key interface elements.",
        onToggle: async () => {
          const nextState: ToggleState = { ...currentState, highContrast: !currentState.highContrast };
          toggleAppearance(nextState.highContrast ? "high-contrast" : "standard");
          await onChange(nextState);
        }
      },
      {
        id: "landing-accessibility-toggle-reduce-motion",
        label: "Reduce motion",
        value: reduceMotion,
        description: "Disable animations that may trigger motion sensitivity.",
        onToggle: async () => {
          const nextState: ToggleState = { ...currentState, reduceMotion: !currentState.reduceMotion };
          toggleMotion(nextState.reduceMotion ? "reduced" : "full");
          await onChange(nextState);
        }
      },
      {
        id: "landing-accessibility-toggle-remote-providers",
        label: "Remote providers",
        value: remoteProviders,
        description: "Share remote provider status within diagnostics exports and consent logs.",
        onToggle: async () => {
          const nextState: ToggleState = { ...currentState, remoteProviders: !currentState.remoteProviders };
          await onChange(nextState);
        }
      }
    ],
    [currentState, highContrast, onChange, reduceMotion, remoteProviders, toggleAppearance, toggleMotion]
  );

  return (
    <section aria-labelledby="accessibility-preferences-heading" className="theme-card">
      <div className="flex flex-col gap-spacing-xs">
        <h2 id="accessibility-preferences-heading" className="text-heading font-heading text-text-primary">
          Accessibility preferences
        </h2>
        <p className="text-sm text-text-muted">Adjust renderer settings to match your comfort and reduce fatigue.</p>
      </div>

      <div role="group" aria-label="Accessibility toggles" className="flex flex-col gap-spacing-sm">
        {switches.map((toggle) => (
          <button
            key={toggle.id}
            type="button"
            role="switch"
            aria-checked={toggle.value}
            aria-label={createSwitchAriaLabel(toggle.label, toggle.value)}
            aria-describedby={`${toggle.id}-description`}
            data-testid={toggle.id}
            className={`theme-button w-full justify-between ${toggle.value ? "bg-surface-muted" : "bg-surface-canvas"}`}
            onClick={() => void toggle.onToggle()}
            onKeyDown={(event) => handleKeyDown(event, toggle.onToggle)}
            disabled={isPersisting}
          >
            <span className="flex flex-col items-start gap-spacing-2xs text-left">
              <span className="text-sm font-medium text-text-primary">{toggle.label}</span>
              <span id={`${toggle.id}-description`} className="text-xs text-text-muted">
                {toggle.description}
              </span>
            </span>
            <span className="text-sm font-semibold text-text-primary" aria-hidden="true">
              {toggle.value ? "On" : "Off"}
            </span>
          </button>
        ))}
      </div>

      {isPersisting ? (
        <p role="status" aria-live="polite" className="text-sm text-text-muted">
          Saving preferences…
        </p>
      ) : null}
    </section>
  );
};

export default AccessibilityToggles;
