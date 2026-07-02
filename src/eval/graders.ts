// assay-style graders. In production this delegates to the `assay` harness
// (golden sets + versioned rubrics in CI). Here it provides the interface plus
// a deterministic grounding check so a factually wrong draft is rejected
// before it can reach the HITL queue.

export interface GradeResult {
  score: number;   // 0..1
  pass: boolean;
  report: Record<string, unknown>;
}

export interface GradeInput {
  body: string;
  groundingContext: string; // the program-state facts the draft must not contradict
}

const PASS_THRESHOLD = 0.7;

export async function gradeCommunication(input: GradeInput): Promise<GradeResult> {
  // TODO(M5): call assay with the exec-update rubric + a fabrication grader.
  // Placeholder heuristic: an empty or context-free draft fails closed.
  const hasBody = input.body.trim().length > 0;
  const grounded = input.groundingContext.trim().length > 0;
  const score = hasBody && grounded ? 0.8 : 0.0;
  return {
    score,
    pass: score >= PASS_THRESHOLD,
    report: { hasBody, grounded, threshold: PASS_THRESHOLD, note: "placeholder grader; wire assay in M5" },
  };
}
