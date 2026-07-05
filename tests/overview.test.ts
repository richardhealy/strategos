import { describe, it, expect } from "vitest";
import { progressOf, bucketOpenByPriority, rollupKpis, progressBand } from "@/state/model/overview";

// Linear priority scale: 1 Urgent, 2 High, 3 Medium, 4 Low, 0/undefined None.
const t = (status: string, priority?: number | null) => ({ status, priority });

describe("progressOf", () => {
  it("counts DONE over total as a 0..1 fraction", () => {
    expect(progressOf([t("DONE"), t("DONE"), t("IN_PROGRESS"), t("IN_PROGRESS")]))
      .toEqual({ done: 2, total: 4, pct: 0.5 });
  });

  it("returns pct 0 for an initiative with no tasks (no divide-by-zero)", () => {
    expect(progressOf([])).toEqual({ done: 0, total: 0, pct: 0 });
  });
});

describe("bucketOpenByPriority", () => {
  it("buckets OPEN tasks by Linear priority and folds None(0/null) into low", () => {
    const tasks = [
      t("IN_PROGRESS", 1), // urgent
      t("IN_PROGRESS", 2), // high
      t("IN_PROGRESS", 3), // medium
      t("IN_PROGRESS", 4), // low
      t("IN_PROGRESS", 0), // none -> low
      t("IN_PROGRESS", null), // none -> low
    ];
    expect(bucketOpenByPriority(tasks)).toEqual({ urgent: 1, high: 1, medium: 1, low: 3 });
  });

  it("excludes DONE tasks (only open work counts)", () => {
    const tasks = [t("DONE", 1), t("DONE", 2), t("IN_PROGRESS", 1)];
    expect(bucketOpenByPriority(tasks)).toEqual({ urgent: 1, high: 0, medium: 0, low: 0 });
  });
});

describe("rollupKpis", () => {
  it("rolls up issue counts, completion fraction, and open urgent/high", () => {
    const tasks = [
      t("DONE", 1),
      t("DONE", 3),
      t("IN_PROGRESS", 1), // open urgent
      t("IN_PROGRESS", 2), // open high
      t("IN_PROGRESS", 4), // open low
    ];
    expect(rollupKpis(tasks)).toEqual({
      totalIssues: 5,
      doneIssues: 2,
      openIssues: 3,
      completePct: 0.4,
      urgentHighOpen: 2,
    });
  });

  it("does not count DONE urgent/high issues as open urgent/high", () => {
    expect(rollupKpis([t("DONE", 1), t("DONE", 2)]).urgentHighOpen).toBe(0);
  });
});

describe("progressBand", () => {
  it("maps completion fraction to a band (higher = more complete)", () => {
    expect(progressBand(0)).toBe("low");
    expect(progressBand(0.32)).toBe("low");
    expect(progressBand(0.33)).toBe("mid");
    expect(progressBand(0.66)).toBe("mid");
    expect(progressBand(0.67)).toBe("high");
    expect(progressBand(1)).toBe("high");
  });
});
