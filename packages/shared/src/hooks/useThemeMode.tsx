import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export interface ThemeModeState {
  appearance: "standard" | "high-contrast";
  motion: "full" | "reduced";
}

export interface ThemeModeContextValue extends ThemeModeState {
  setAppearance: (mode: ThemeModeState["appearance"]) => void;
  setMotion: (mode: ThemeModeState["motion"]) => void;
  toggleAppearance: (mode?: ThemeModeState["appearance"]) => void;
  toggleMotion: (mode?: ThemeModeState["motion"]) => void;
}

const STORAGE_KEY = "llm-tutor:theme-mode";

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

function getStoredState(): ThemeModeState | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<ThemeModeState>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (parsed.appearance !== "high-contrast" && parsed.appearance !== "standard") {
      return null;
    }
    if (parsed.motion !== "reduced" && parsed.motion !== "full") {
      return null;
    }
    return {
      appearance: parsed.appearance,
      motion: parsed.motion
    };
  } catch (error) {
    console.warn("Failed to parse stored theme mode", error);
    return null;
  }
}

function querySystemState(): Partial<ThemeModeState> {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return {};
  }
  const systemAppearance = window.matchMedia("(prefers-contrast: more)").matches ? "high-contrast" : "standard";
  const systemMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "full";
  return {
    appearance: systemAppearance,
    motion: systemMotion
  };
}

function applyThemeAttributes(state: ThemeModeState): void {
  if (typeof document === "undefined") {
    return;
  }
  const body = document.body;
  if (!body) {
    return;
  }
  const appearanceAttr = state.appearance === "high-contrast" ? "contrast" : "standard";
  body.setAttribute("data-theme", appearanceAttr);
  body.setAttribute("data-motion", state.motion);
  body.dataset.appearance = state.appearance;
  if (state.motion === "reduced") {
    body.classList.add("motion-reduce");
  } else {
    body.classList.remove("motion-reduce");
  }
}

function persistState(state: ThemeModeState): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Failed to persist theme mode", error);
  }
}

function subscribeToMediaChanges(target: MediaQueryList, handler: () => void): () => void {
  if (typeof target.addEventListener === "function") {
    target.addEventListener("change", handler);
    return () => target.removeEventListener("change", handler);
  }
  target.addListener(handler);
  return () => target.removeListener(handler);
}

function createThemeChangeEvent(state: ThemeModeState): CustomEvent<ThemeModeState> {
  return new CustomEvent<ThemeModeState>("theme-mode:change", {
    detail: state
  });
}

function dispatchThemeChange(state: ThemeModeState): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(createThemeChangeEvent(state));
}

function useMediaSync(callback: () => void): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const contrastQuery = window.matchMedia("(prefers-contrast: more)");
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => callbackRef.current();
    const disposers = [subscribeToMediaChanges(contrastQuery, handler), subscribeToMediaChanges(motionQuery, handler)];
    return () => {
      for (const dispose of disposers) {
        dispose();
      }
    };
  }, []);
}

function computeInitialState(): ThemeModeState {
  const stored = getStoredState();
  if (stored) {
    return stored;
  }
  const system = querySystemState();
  return {
    appearance: system.appearance ?? "standard",
    motion: system.motion ?? "full"
  };
}

export interface ThemeModeProviderProps {
  children: ReactNode;
}

export const ThemeModeProvider: React.FC<ThemeModeProviderProps> = ({ children }) => {
  const [state, setState] = useState<ThemeModeState>(() => computeInitialState());

  useEffect(() => {
    applyThemeAttributes(state);
    persistState(state);
    dispatchThemeChange(state);
  }, [state]);

  useMediaSync(() => {
    setState((previous) => {
      const system = querySystemState();
      return {
        appearance: previous.appearance === "standard" && system.appearance ? system.appearance : previous.appearance,
        motion: previous.motion === "full" && system.motion ? system.motion : previous.motion
      };
    });
  });

  const setAppearance = useCallback((mode: ThemeModeState["appearance"]) => {
    setState((previous) => (previous.appearance === mode ? previous : { ...previous, appearance: mode }));
  }, []);

  const setMotion = useCallback((mode: ThemeModeState["motion"]) => {
    setState((previous) => (previous.motion === mode ? previous : { ...previous, motion: mode }));
  }, []);

  const toggleAppearance = useCallback((mode?: ThemeModeState["appearance"]) => {
    setState((previous) => {
      const next = mode ?? (previous.appearance === "high-contrast" ? "standard" : "high-contrast");
      return previous.appearance === next ? previous : { ...previous, appearance: next };
    });
  }, []);

  const toggleMotion = useCallback((mode?: ThemeModeState["motion"]) => {
    setState((previous) => {
      const next = mode ?? (previous.motion === "reduced" ? "full" : "reduced");
      return previous.motion === next ? previous : { ...previous, motion: next };
    });
  }, []);

  const value = useMemo<ThemeModeContextValue>(() => {
    return {
      appearance: state.appearance,
      motion: state.motion,
      setAppearance,
      setMotion,
      toggleAppearance,
      toggleMotion
    };
  }, [setAppearance, setMotion, state.appearance, state.motion, toggleAppearance, toggleMotion]);

  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
};

export function useThemeMode(): ThemeModeContextValue {
  const context = useContext(ThemeModeContext);
  if (!context) {
    throw new Error("useThemeMode must be used within a ThemeModeProvider");
  }
  return context;
}
