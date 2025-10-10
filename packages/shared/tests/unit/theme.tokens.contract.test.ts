import { describe, expect, it } from "vitest";
import { z } from "zod";

import { themeTokenSchema, themeTokens } from "../../src/styles/tokens";

describe("theme tokens contract", () => {
  it("matches the published theme token schema", () => {
    const schema = themeTokenSchema ?? z.never();

    const results = themeTokens.map((token: unknown) => schema.parse(token));
    expect(results).toHaveLength(themeTokens.length);
  });

  it("includes high-contrast variants for every semantic token", () => {
    const missingContrast = themeTokens.filter((token: any) => !token.contrast?.high);

    expect(missingContrast).toEqual([]);
  });
});
