export interface DepEdge { blocked: string; blocker: string } // blocker must precede blocked

// Layered Kahn's algorithm over the ready set. Edges to non-ready blockers are
// dropped (blocker done / out of scope). Within a layer, order by fan-out
// (how many ready tasks each blocks) descending, then id for determinism.
// A leftover cycle is reported and its nodes appended as a final wave.
export function planWaves(readyIds: string[], edges: DepEdge[]): { waves: string[][]; cyclic: string[] } {
  const ready = new Set(readyIds);
  const scoped = edges.filter((e) => ready.has(e.blocked) && ready.has(e.blocker));

  const indeg = new Map<string, number>(readyIds.map((id) => [id, 0]));
  const blocks = new Map<string, string[]>(readyIds.map((id) => [id, []])); // blocker -> [blocked...]
  for (const e of scoped) {
    indeg.set(e.blocked, (indeg.get(e.blocked) ?? 0) + 1);
    blocks.get(e.blocker)!.push(e.blocked);
  }
  const fanout = (id: string): number => (blocks.get(id)?.length ?? 0);
  const order = (ids: string[]): string[] =>
    [...ids].sort((a, b) => fanout(b) - fanout(a) || (a < b ? -1 : a > b ? 1 : 0));

  const waves: string[][] = [];
  const remaining = new Set(readyIds);
  for (;;) {
    const layer = [...remaining].filter((id) => (indeg.get(id) ?? 0) === 0);
    if (layer.length === 0) break;
    const ordered = order(layer);
    waves.push(ordered);
    for (const id of ordered) {
      remaining.delete(id);
      for (const nxt of blocks.get(id) ?? []) indeg.set(nxt, (indeg.get(nxt) ?? 0) - 1);
    }
  }

  const cyclic = order([...remaining]);
  if (cyclic.length) waves.push(cyclic);
  return { waves, cyclic };
}
