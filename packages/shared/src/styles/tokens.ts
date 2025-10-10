import { z } from "zod";

export const tokenValueSchema = z.union([
  z.object({
    type: z.literal("color"),
    hex: z.string().regex(/^#[0-9A-F]{6}$/),
    alpha: z.number().int().min(0).max(100).optional()
  }),
  z.object({
    type: z.literal("typography"),
    fontFamily: z.string(),
    fontSize: z.string(),
    lineHeight: z.string(),
    fontWeight: z.number().int().positive().max(900).optional()
  }),
  z.object({
    type: z.literal("spacing"),
    rem: z.number().positive()
  }),
  z.object({
    type: z.literal("radius"),
    rem: z.number().positive()
  }),
  z.object({
    type: z.literal("shadow"),
    value: z.string()
  }),
  z.object({
    type: z.literal("motion"),
    durationMs: z.number().nonnegative(),
    easing: z.string()
  }),
  z.object({
    type: z.literal("opacity"),
    value: z.number().min(0).max(1)
  })
]);

export const themeTokenSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  role: z.union([
    z.literal("surface"),
    z.literal("text"),
    z.literal("border"),
    z.literal("accent"),
    z.literal("state"),
    z.literal("shadow"),
    z.literal("motion"),
    z.literal("spacing"),
    z.literal("radius")
  ]),
  value: tokenValueSchema,
  contrast: z.object({
    high: tokenValueSchema
  }),
  metadata: z
    .object({
      description: z.string().optional(),
      minContrastRatio: z.number().positive().optional(),
      references: z.array(z.string()).optional()
    })
    .optional()
});

export type ThemeToken = z.infer<typeof themeTokenSchema>;
export type ThemeTokenRole = ThemeToken["role"];

function color(hex: string) {
  return { type: "color" as const, hex };
}

function typography(options: { id: string; fontFamily: string; fontSize: string; lineHeight: string; fontWeight?: number }) {
  return {
    type: "typography" as const,
    fontFamily: options.fontFamily,
    fontSize: options.fontSize,
    lineHeight: options.lineHeight,
    fontWeight: options.fontWeight
  };
}

function spacing(rem: number) {
  return { type: "spacing" as const, rem };
}

function radius(rem: number) {
  return { type: "radius" as const, rem };
}

function shadow(value: string) {
  return { type: "shadow" as const, value };
}

function motion(durationMs: number, easing: string) {
  return { type: "motion" as const, durationMs, easing };
}

export const themeTokens: ThemeToken[] = [
  {
    id: "surface-canvas",
    role: "surface",
    value: color("#FFFFFF"),
    contrast: { high: color("#0A0A0A") },
    metadata: {
      description: "Primary canvas background for application surfaces",
      minContrastRatio: 4.5
    }
  },
  {
    id: "surface-elevated",
    role: "surface",
    value: color("#F8FAFF"),
    contrast: { high: color("#121A2A") },
    metadata: {
      description: "Raised containers such as cards and panels"
    }
  },
  {
    id: "surface-muted",
    role: "surface",
    value: color("#EDF2FF"),
    contrast: { high: color("#18253D") }
  },
  {
    id: "surface-overlay",
    role: "surface",
    value: color("#1A2136"),
    contrast: { high: color("#0D101B") },
    metadata: {
      description: "Backdrop overlay for dialogs"
    }
  },
  {
    id: "text-primary",
    role: "text",
    value: color("#1B1F32"),
    contrast: { high: color("#FFFFFF") },
    metadata: {
      minContrastRatio: 7
    }
  },
  {
    id: "text-muted",
    role: "text",
    value: color("#475072"),
    contrast: { high: color("#F5F7FF") },
    metadata: {
      minContrastRatio: 4.5
    }
  },
  {
    id: "text-inverse",
    role: "text",
    value: color("#FFFFFF"),
    contrast: { high: color("#0B1120") }
  },
  {
    id: "text-accent",
    role: "text",
    value: color("#2B50FF"),
    contrast: { high: color("#E8EDFF") },
    metadata: {
      description: "Interactive accent text"
    }
  },
  {
    id: "border-subtle",
    role: "border",
    value: color("#CCD4EE"),
    contrast: { high: color("#5C6C9E") }
  },
  {
    id: "border-strong",
    role: "border",
    value: color("#1F2A44"),
    contrast: { high: color("#FFFFFF") }
  },
  {
    id: "accent-primary",
    role: "accent",
    value: color("#3F5DFF"),
    contrast: { high: color("#C7D2FF") },
    metadata: {
      description: "Primary brand accent"
    }
  },
  {
    id: "accent-emphasis",
    role: "accent",
    value: color("#2036C5"),
    contrast: { high: color("#F0F3FF") }
  },
  {
    id: "state-success",
    role: "state",
    value: color("#0F9D58"),
    contrast: { high: color("#E6F4EA") }
  },
  {
    id: "state-warning",
    role: "state",
    value: color("#F4B400"),
    contrast: { high: color("#FFF4D6") }
  },
  {
    id: "state-danger",
    role: "state",
    value: color("#DB4437"),
    contrast: { high: color("#FFE6E3") }
  },
  {
    id: "spacing-2xs",
    role: "spacing",
    value: spacing(0.25),
    contrast: { high: spacing(0.25) }
  },
  {
    id: "spacing-xs",
    role: "spacing",
    value: spacing(0.5),
    contrast: { high: spacing(0.5) }
  },
  {
    id: "spacing-sm",
    role: "spacing",
    value: spacing(0.75),
    contrast: { high: spacing(0.75) }
  },
  {
    id: "spacing-md",
    role: "spacing",
    value: spacing(1),
    contrast: { high: spacing(1) }
  },
  {
    id: "spacing-lg",
    role: "spacing",
    value: spacing(1.5),
    contrast: { high: spacing(1.5) }
  },
  {
    id: "spacing-xl",
    role: "spacing",
    value: spacing(2),
    contrast: { high: spacing(2) }
  },
  {
    id: "radius-sm",
    role: "radius",
    value: radius(0.375),
    contrast: { high: radius(0.375) }
  },
  {
    id: "radius-md",
    role: "radius",
    value: radius(0.75),
    contrast: { high: radius(0.75) }
  },
  {
    id: "radius-lg",
    role: "radius",
    value: radius(1.25),
    contrast: { high: radius(1.25) }
  },
  {
    id: "shadow-sm",
    role: "shadow",
    value: shadow("0 1px 2px rgba(31, 42, 68, 0.08), 0 1px 1px rgba(31, 42, 68, 0.04)"),
    contrast: { high: shadow("0 0 0 2px rgba(255, 255, 255, 0.4)") }
  },
  {
    id: "shadow-md",
    role: "shadow",
    value: shadow("0 8px 20px rgba(17, 24, 39, 0.12), 0 2px 6px rgba(17, 24, 39, 0.08)"),
    contrast: { high: shadow("0 0 0 2px rgba(255, 255, 255, 0.6)") }
  },
  {
    id: "shadow-lg",
    role: "shadow",
    value: shadow("0 18px 42px rgba(15, 23, 42, 0.18), 0 6px 14px rgba(15, 23, 42, 0.14)"),
    contrast: { high: shadow("0 0 0 3px rgba(255, 255, 255, 0.6)") }
  },
  {
    id: "motion-quick",
    role: "motion",
    value: motion(120, "cubic-bezier(0.4, 0, 0.2, 1)"),
    contrast: { high: motion(80, "linear") }
  },
  {
    id: "motion-standard",
    role: "motion",
    value: motion(180, "cubic-bezier(0.2, 0, 0.13, 1)"),
    contrast: { high: motion(120, "cubic-bezier(0.4, 0, 1, 1)") }
  },
  {
    id: "motion-gentle",
    role: "motion",
    value: motion(260, "cubic-bezier(0.33, 1, 0.68, 1)"),
    contrast: { high: motion(160, "linear") }
  },
  {
    id: "font-body",
    role: "text",
    value: typography({
      id: "font-body",
      fontFamily: "'InterVariable', 'Inter', system-ui, sans-serif",
      fontSize: "1rem",
      lineHeight: "1.5"
    }),
    contrast: {
      high: typography({
        id: "font-body",
        fontFamily: "'InterVariable', 'Inter', system-ui, sans-serif",
        fontSize: "1rem",
        lineHeight: "1.6"
      })
    }
  },
  {
    id: "font-heading",
    role: "text",
    value: typography({
      id: "font-heading",
      fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif",
      fontSize: "1.5rem",
      lineHeight: "1.3",
      fontWeight: 600
    }),
    contrast: {
      high: typography({
        id: "font-heading",
        fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif",
        fontSize: "1.5rem",
        lineHeight: "1.4",
        fontWeight: 700
      })
    }
  },
  {
    id: "font-mono",
    role: "text",
    value: typography({
      id: "font-mono",
      fontFamily: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace",
      fontSize: "0.95rem",
      lineHeight: "1.5"
    }),
    contrast: {
      high: typography({
        id: "font-mono",
        fontFamily: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace",
        fontSize: "0.95rem",
        lineHeight: "1.55"
      })
    }
  }
];

export type ThemeTokenMap = Record<string, ThemeToken>;

export function createThemeTokenMap(tokens: readonly ThemeToken[] = themeTokens): ThemeTokenMap {
  return tokens.reduce<ThemeTokenMap>((acc, token) => {
    acc[token.id] = token;
    return acc;
  }, {});
}

export function resolveThemeToken(id: string, tokens: readonly ThemeToken[] = themeTokens): ThemeToken | null {
  return tokens.find((token) => token.id === id) ?? null;
}

export interface ThemeCollections {
  colors: Record<string, Record<string, ThemeToken>>;
  spacing: Record<string, ThemeToken>;
  radius: Record<string, ThemeToken>;
  typography: Record<string, ThemeToken>;
  shadows: Record<string, ThemeToken>;
  motion: Record<string, ThemeToken>;
}

function splitIdentifier(id: string): { group: string; name: string } {
  const [group, ...rest] = id.split("-");
  return {
    group,
    name: rest.join("-") || group
  };
}

export function buildThemeCollections(tokens: readonly ThemeToken[] = themeTokens): ThemeCollections {
  const collections: ThemeCollections = {
    colors: {
      surface: {},
      text: {},
      border: {},
      accent: {},
      state: {}
    },
    spacing: {},
    radius: {},
    typography: {},
    shadows: {},
    motion: {}
  };

  for (const token of tokens) {
  const { name } = splitIdentifier(token.id);
    switch (token.role) {
      case "surface":
      case "text":
      case "border":
      case "accent":
      case "state":
        if (token.value.type === "color") {
          collections.colors[token.role][name] = token;
        }
        break;
      case "spacing":
        collections.spacing[name] = token;
        break;
      case "radius":
        collections.radius[name] = token;
        break;
      case "shadow":
        collections.shadows[name] = token;
        break;
      case "motion":
        collections.motion[name] = token;
        break;
      default:
        if (token.value.type === "typography") {
          collections.typography[name] = token;
        }
        break;
    }

    if (token.value.type === "typography") {
      collections.typography[name] = token;
    }
  }

  return collections;
}
