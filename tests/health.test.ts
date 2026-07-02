import { describe, it, expect } from "vitest";
import { programHealthScore, healthBand } from "@/state/model/health";
import { severityToken, trendSymbol } from "@/components/viz/tokens";

describe("programHealthScore", () => {
  it("is 100 with no risks", () => {
    expect(programHealthScore([])).toBe(100);
  });
  it("subtracts weighted penalties", () => {
    expect(programHealthScore(["CRITICAL", "HIGH"])).toBe(68); // 100 - 20 - 12
  });
  it("never goes below 0", () => {
    expect(programHealthScore(Array(20).fill("CRITICAL"))).toBe(0);
  });
});

describe("healthBand", () => {
  it("bands by score", () => {
    expect(healthBand(90)).toBe("Healthy");
    expect(healthBand(72)).toBe("At risk");
    expect(healthBand(30)).toBe("Critical");
  });
});

describe("tokens", () => {
  it("maps severity to a css var", () => {
    expect(severityToken("CRITICAL")).toBe("var(--sev-critical)");
    expect(severityToken(null)).toBe("var(--surface-2)");
  });
  it("maps trend to a symbol", () => {
    expect(trendSymbol("RISING")).toBe("▲");
    expect(trendSymbol("DROPPING")).toBe("▼");
    expect(trendSymbol("STABLE")).toBe("▬");
  });
});
