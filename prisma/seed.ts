// prisma/seed.ts
import "dotenv/config";
import { db } from "../src/db";
import { recomputeRisk } from "../src/state/model/recompute";
import { hitl } from "../src/hitl/gate";
import type { ItemStatus } from "@prisma/client";

// Seed RAW FACTS, then run the real engine over them so every derived value on
// the dashboard is engine output, not a fixture. Deterministic: we wipe and
// recreate from fixed inputs, and scoreScheduleRisk is pure.

const SPRINT_MS = 14 * 24 * 60 * 60 * 1000;

async function wipe() {
  // FK-safe order.
  await db.actionLog.deleteMany();
  await db.communicationDraft.deleteMany();
  await db.hitlProposal.deleteMany();
  await db.riskScore.deleteMany();
  await db.velocitySnapshot.deleteMany();
  await db.dependency.deleteMany();
  await db.task.deleteMany();
  await db.epic.deleteMany();
  await db.initiative.deleteMany();
  await db.team.deleteMany();
  await db.stateChange.deleteMany();
  await db.externalRef.deleteMany();
  await db.syncCursor.deleteMany();
  await db.program.deleteMany();
}

interface TeamSpec { name: string; velocity: number[] }
const TEAMS: TeamSpec[] = [
  { name: "Core", velocity: [18, 20, 19, 24, 28] },      // rising
  { name: "Payments", velocity: [30, 26, 22, 18, 14] },  // dropping
  { name: "Risk", velocity: [16, 17, 16, 17, 16] },      // stable
  { name: "Platform", velocity: [22, 21, 23, 22, 24] },  // stable
  { name: "Mobile", velocity: [12, 14, 15, 19, 22] },    // rising
];

interface InitSpec {
  title: string; owner: string; team: string;
  weeksToTarget: number; remaining: number; done: number;
}
const INITS: InitSpec[] = [
  { title: "Checkout v2",        owner: "A. Kir",   team: "Payments", weeksToTarget: 6,  remaining: 70, done: 30 },
  { title: "Ledger migration",   owner: "M. Osei",  team: "Core",     weeksToTarget: 12, remaining: 30, done: 50 },
  { title: "Fraud engine",       owner: "L. Vance", team: "Risk",     weeksToTarget: 8,  remaining: 55, done: 20 },
  { title: "Payouts SLA",        owner: "R. Cho",   team: "Platform", weeksToTarget: 14, remaining: 12, done: 60 },
  { title: "Mobile wallet",      owner: "S. Diaz",  team: "Mobile",   weeksToTarget: 10, remaining: 40, done: 15 },
  { title: "Dispute automation", owner: "T. Park",  team: "Risk",     weeksToTarget: 16, remaining: 25, done: 10 },
  { title: "Settlement v3",      owner: "J. Wu",    team: "Core",     weeksToTarget: 5,  remaining: 45, done: 20 },
  { title: "KYC refresh",        owner: "E. Roth",  team: "Platform", weeksToTarget: 18, remaining: 20, done: 5 },
  { title: "Card tokenization",  owner: "N. Bello", team: "Mobile",   weeksToTarget: 9,  remaining: 35, done: 25 },
];

async function main() {
  await wipe();
  const now = Date.now();
  const program = await db.program.create({ data: { name: "Payments Platform" } });

  // Teams + velocity history (raw facts).
  const teamId = new Map<string, string>();
  for (const t of TEAMS) {
    const team = await db.team.create({ data: { programId: program.id, name: t.name } });
    teamId.set(t.name, team.id);
    for (let i = 0; i < t.velocity.length; i++) {
      const start = new Date(now - (t.velocity.length - i) * SPRINT_MS);
      const end = new Date(start.getTime() + SPRINT_MS);
      await db.velocitySnapshot.create({
        data: { teamId: team.id, periodStart: start, periodEnd: end, completedPts: t.velocity[i]!, committedPts: t.velocity[i]! + 4 },
      });
    }
  }

  // Initiatives -> epics/tasks -> ENGINE-COMPUTED schedule risk.
  const initIds: string[] = [];
  for (const spec of INITS) {
    const targetDate = new Date(now + spec.weeksToTarget * 7 * 24 * 60 * 60 * 1000);
    const status: ItemStatus = "IN_PROGRESS";
    const init = await db.initiative.create({
      data: { programId: program.id, title: spec.title, owner: spec.owner, status, targetDate },
    });
    initIds.push(init.id);

    const epic = await db.epic.create({
      data: { initiativeId: init.id, teamId: teamId.get(spec.team)!, title: `${spec.title} — delivery`, status: "IN_PROGRESS", estimatePoints: spec.remaining + spec.done },
    });
    // one DONE task carrying the done points, one open task carrying the remaining points
    await db.task.create({ data: { epicId: epic.id, title: "completed work", status: "DONE", estimatePoints: spec.done } });
    await db.task.create({ data: { epicId: epic.id, title: "remaining work", status: "IN_PROGRESS", estimatePoints: spec.remaining, criticalPath: true } });

  }

  // Engine-computed SCHEDULE risk over the seeded facts (shared with live sync).
  await recomputeRisk(program.id);

  // A dependency + a DEPENDENCY risk on Fraud engine (index 2) depending on Ledger (index 1).
  const fraud = initIds[2]!, ledger = initIds[1]!;
  const fraudEpic = await db.epic.findFirstOrThrow({ where: { initiativeId: fraud } });
  const ledgerEpic = await db.epic.findFirstOrThrow({ where: { initiativeId: ledger } });
  await db.dependency.create({ data: { fromId: fraudEpic.id, toId: ledgerEpic.id, resolved: false, note: "needs ledger schema" } });
  await db.riskScore.create({
    data: { initiativeId: fraud, kind: "DEPENDENCY", severity: "HIGH", score: 0.7, confidence: 0.7,
            explanation: "Blocked on unresolved upstream: Ledger migration schema.", mitigation: "Sequence ledger schema freeze first." },
  });

  // Proposals through the REAL gate (writes audit rows).
  const p1 = await hitl.propose({ kind: "COMMUNICATION", summary: "Exec status update · Wk 27", createdBy: "communicator",
    payload: { channel: "exec-update", audience: "leadership" } });
  await db.communicationDraft.create({ data: { proposalId: p1, channel: "exec-update", audience: "leadership",
    subject: "Payments Platform — Week 27", body: "6 of 9 initiatives on track. Checkout v2 and Fraud engine at schedule risk; mitigations proposed.",
    gradeScore: 0.91, gradePass: true } });
  await hitl.propose({ kind: "PLAN_CHANGE", summary: "Rebalance Checkout scope (−2 stories)", createdBy: "sprint",
    payload: { initiative: "Checkout v2", drop: 2 } });
  await hitl.propose({ kind: "COMMUNICATION", summary: "Risk escalation: Fraud engine dependency", createdBy: "escalator",
    payload: { channel: "follow-up", audience: "Ledger team" } });

  const counts = {
    initiatives: await db.initiative.count(),
    risks: await db.riskScore.count(),
    proposals: await db.hitlProposal.count(),
  };
  console.log("Seeded Payments Platform:", counts);
}

main().finally(() => db.$disconnect());
