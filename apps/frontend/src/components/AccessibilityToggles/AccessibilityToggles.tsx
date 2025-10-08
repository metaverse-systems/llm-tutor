import React, { useMemo } from "react";

interface ToggleState {
  highContrast: boolean;
  reduceMotion: boolean;
}

interface AccessibilityTogglesProps {
  preferences: ToggleState;
  onChange: (next: ToggleState) => void | Promise<void>;
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
  const { highContrast, reduceMotion } = preferences;

  const switches = useMemo(
    () => [
      {
        id: "landing-accessibility-toggle-high-contrast",
        label: "High contrast",
        value: highContrast,
        description: "Increase contrast for text and key interface elements.",
        onToggle: () =>
          onChange({
            highContrast: !highContrast,
            reduceMotion
          })
      },
      {
        id: "landing-accessibility-toggle-reduce-motion",
        label: "Reduce motion",
        value: reduceMotion,
        description: "Disable animations that may trigger motion sensitivity.",
        onToggle: () =>
          onChange({
            highContrast,
            reduceMotion: !reduceMotion
          })
      }
    ],
    [highContrast, reduceMotion, onChange]
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
