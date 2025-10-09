import React, { useCallback, useMemo } from "react";

interface ToggleState {
  highContrast: boolean;
  reduceMotion: boolean;
  remoteProviders: boolean;
}

interface AccessibilityTogglesProps {
  preferences: ToggleState;
  onChange: (updater: (previous: ToggleState) => ToggleState) => void | Promise<void>;
  isPersisting?: boolean;
}

function createSwitchAriaLabel(label: string, value: boolean): string {
  return `${label} ${value ? "on" : "off"}`;
}

export const AccessibilityToggles: React.FC<AccessibilityTogglesProps> = ({
  preferences,
  onChange,
  isPersisting = false
}) => {
  const { highContrast, reduceMotion, remoteProviders } = preferences;

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, toggleAction: () => void | Promise<void>) => {
      if (event.key === " " || event.key === "Space" || event.key === "Spacebar" || event.key === "Enter") {
        event.preventDefault();
        void toggleAction();
      }
    },
    []
  );

  const switches = useMemo(
    () => [
      {
        id: "landing-accessibility-toggle-high-contrast",
        label: "High contrast",
        value: highContrast,
        description: "Increase contrast for text and key interface elements.",
        onToggle: () => {
          return onChange((previous) => ({
            ...previous,
            highContrast: !previous.highContrast
          }));
        }
      },
      {
        id: "landing-accessibility-toggle-reduce-motion",
        label: "Reduce motion",
        value: reduceMotion,
        description: "Disable animations that may trigger motion sensitivity.",
        onToggle: () => {
          return onChange((previous) => ({
            ...previous,
            reduceMotion: !previous.reduceMotion
          }));
        }
      },
      {
        id: "landing-accessibility-toggle-remote-providers",
        label: "Remote providers",
        value: remoteProviders,
        description: "Share remote provider status within diagnostics exports and consent logs.",
        onToggle: () => {
          return onChange((previous) => ({
            ...previous,
            remoteProviders: !previous.remoteProviders
          }));
        }
      }
    ],
    [highContrast, reduceMotion, remoteProviders, onChange]
  );

  return (
    <section
      aria-labelledby="accessibility-preferences-heading"
      className="accessibility-toggles"
    >
      <div className="accessibility-toggles__header">
        <h2 id="accessibility-preferences-heading">Accessibility preferences</h2>
        <p>Adjust renderer settings to match your comfort and reduce fatigue.</p>
      </div>

      <div role="group" aria-label="Accessibility toggles" className="accessibility-toggles__group">
        {switches.map((toggle) => (
          <button
            key={toggle.id}
            type="button"
            role="switch"
            aria-checked={toggle.value}
            aria-label={createSwitchAriaLabel(toggle.label, toggle.value)}
            aria-describedby={`${toggle.id}-description`}
            data-testid={toggle.id}
            className={`accessibility-toggles__switch accessibility-toggles__switch--${
              toggle.value ? "on" : "off"
            }`}
            onClick={() => void toggle.onToggle()}
            onKeyDown={(event) => handleKeyDown(event, toggle.onToggle)}
            disabled={isPersisting}
          >
            <span className="accessibility-toggles__switch-label">{toggle.label}</span>
            <span className="accessibility-toggles__switch-state" aria-hidden="true">
              {toggle.value ? "On" : "Off"}
            </span>
            <span id={`${toggle.id}-description`} className="accessibility-toggles__hint">
              {toggle.description}
            </span>
          </button>
        ))}
      </div>



      {isPersisting ? (
        <p role="status" aria-live="polite" className="accessibility-toggles__status">
          Saving preferences…
        </p>
      ) : null}
    </section>
  );
};

export default AccessibilityToggles;
