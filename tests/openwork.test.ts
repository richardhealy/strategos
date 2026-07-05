import { describe, it, expect } from "vitest";
import { buildOpenWorkMatrix, PRIORITY_BUCKETS } from "@/state/model/openWork";

const task = (priority: number | null, status = "IN_PROGRESS") => ({ priority, status });

describe("buildOpenWorkMatrix", () => {
  it("drops initiatives with no open prioritised work", () => {
    const rows = buildOpenWorkMatrix([
      { id: "a", title: "Has work", tasks: [task(1)] },
      { id: "b", title: "All done", tasks: [task(1, "DONE"), task(2, "CANCELLED")] },
      { id: "c", title: "Empty", tasks: [] },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["a"]);
  });

  it("counts only open tasks, bucketed by priority 1..4", () => {
    const rows = buildOpenWorkMatrix([
      { id: "a", title: "A", tasks: [task(1), task(1), task(2), task(1, "DONE"), task(3), task(null)] },
    ]);
    const cells = rows[0]!.cells;
    expect(cells.map((c) => c.count)).toEqual([2, 1, 1, 0]); // Urgent, High, Med, Low; DONE and untriaged excluded
    expect(rows[0]!.total).toBe(4);
    expect(cells.map((c) => c.priority)).toEqual(PRIORITY_BUCKETS.map((b) => b.key));
  });

  it("sorts initiatives by open volume, busiest first", () => {
    const rows = buildOpenWorkMatrix([
      { id: "small", title: "Small", tasks: [task(1)] },
      { id: "big", title: "Big", tasks: [task(1), task(2), task(3)] },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["big", "small"]);
  });

  it("rank-scales intensity so one outlier can't flatten the ramp", () => {
    const rows = buildOpenWorkMatrix([
      { id: "out", title: "Outlier", tasks: Array.from({ length: 400 }, () => task(1)) },
      { id: "mid", title: "Mid", tasks: Array.from({ length: 7 }, () => task(2)) },
      { id: "low", title: "Low", tasks: [task(3)] },
    ]);
    const urgent = rows.find((r) => r.id === "out")!.cells[0]!; // 400
    const high = rows.find((r) => r.id === "mid")!.cells[1]!; //   7
    const med = rows.find((r) => r.id === "low")!.cells[2]!; //    1
    // Distinct counts get distinct, monotonic intensities spread across the range
    // — the 7-cell is clearly warmer than near-empty, not washed out by the 400.
    expect(med.intensity).toBeGreaterThan(0);
    expect(high.intensity).toBeGreaterThan(med.intensity);
    expect(urgent.intensity).toBeGreaterThan(high.intensity);
    expect(high.intensity).toBeGreaterThan(0.4); // mid rank, not crushed toward 0
    // Zero cells stay at zero intensity (rendered as empty).
    expect(rows.find((r) => r.id === "low")!.cells[0]!.intensity).toBe(0);
  });
});
