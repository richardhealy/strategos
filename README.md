# strategos

Autonomous AI Technical Program Manager. It plans from requirements, tracks execution across five trackers, predicts schedule risk, and drafts stakeholder communication. Every outside action passes through a human approval gate.

Track: Agent orchestration & release. Sits above `conductor` (single-ticket delivery) and `harbormaster` (multi-agent fleet coordination), and reuses `assay` (comms grading), `watchtower` (observability), and `abacus` (cost).

## The idea in one line

A ticket tracker records what happened. strategos reasons over a structured, versioned model of the program, predicts what will happen, and acts before a slip becomes a miss.

## What is in this scaffold (M0)

This is the M0 milestone: the skeleton compiles and the two load-bearing invariants are pinned by tests.

- Postgres program state model (`prisma/schema.prisma`): initiatives, epics, tasks, a dependency graph, velocity snapshots, risk scores, and a full provenance and audit trail.
- The `Integration` port with five adapters (Linear and GitHub are the M0 targets; Jira, GitLab, Azure DevOps share the same contract as stubs).
- Five agents behind a common interface: planner, sprint, risk, communicator, escalator.
- The HITL gate: the single choke point for any external write, with an adversarial test proving it cannot be bypassed.
- Four durable Inngest routines: daily sync, sprint cadence, weekly review, on-event webhook.
- A thin Next.js dashboard: program health plus the approval inbox.
- CI running typecheck, lint, and tests.

## Layout

```
src/
  state/{model,sync,versioned}   program state, reconcile, provenance
  integrations/{linear,jira,github,gitlab,azuredevops}
  agents/{planner,sprint,risk,communicator,escalator}
  hitl/                          propose, approve, apply
  schedule/routines/             durable scheduled loops
  eval/                          assay-style graders
  llm/                           Anthropic client
app/                             dashboard + inngest route + webhook ingress
prisma/                          schema + seed
tests/                           HITL bypass, risk regression
```

## Getting started

```bash
cp .env.example .env.local        # fill in DATABASE_URL + ANTHROPIC_API_KEY at minimum
docker compose up -d              # local Postgres
npm install
npx prisma migrate dev            # create the schema
npm run db:seed                   # one demo program + team
npm run dev                       # dashboard at http://localhost:3000
npm run inngest:dev               # durable routines (separate terminal)
npm test                          # HITL + risk invariants
```

## Design rule

The agent never touches the outside world except through the HITL gate: propose, a human approves, then apply. Reading, modelling, scoring, and drafting all run autonomously. Everything else is gated.

## Milestones

M0 scaffold (this), M1 state sync across all five integrations, M2 planner, M3 sprint agent, M4 risk agent, M5 communicator plus eval grader, M6 HITL plus routines, M7 dashboard plus ship. Full detail in `spec.md`.

## Relationship to the pipeline

Instantiated from the `blueprint` via `setup-project`. Blueprint toggles for this project live in `project.config` (Postgres on, Stripe off, email and Sentry on, deploy Railway, public). To scaffold the live repo:

```bash
./setup-project.sh --name=strategos --spec=./strategos/spec.md --config=./strategos/project.config
```
