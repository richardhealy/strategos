# strategos

**One-liner:** Autonomous AI Technical Program Manager: plans from requirements, tracks execution, predicts risk, and drafts stakeholder communication across Linear, Jira, GitHub, GitLab, and Azure DevOps.

**Track:** Agent orchestration & release
**Type:** spec
**Stack:** Node/TypeScript. Durable agent runtime (Inngest or Trigger.dev), LLM for planning and communication, integrations with Linear/Jira/GitHub/GitLab/Azure DevOps, Postgres for program state, thin dashboard.

---

## Overview

The single problem `strategos` isolates is the gap between a ticket tracker and a program. A project management tool records what happened; a TPM agent reasons over program state, predicts what will happen, coordinates across teams, and acts before a slip becomes a miss.

At its core, `strategos` maintains a structured, versioned model of the program in Postgres, updated from integrations on a schedule and on webhook events:

- **Initiatives and epics** with owners, status, and target dates.
- **Dependency graph** between epics and teams.
- **Velocity and burn-down** per team, computed from actual delivery history.
- **Schedule risk scores** per initiative, derived from velocity, remaining work, and dependency slack.
- **Decision and action log:** every agent action and every HITL decision is recorded with provenance.

This model is what separates `strategos` from a chatbot in front of Jira. It reasons over the model, not the raw tickets.

**Design rule:** the agent never acts on the outside world without passing through the HITL gate. Everything else (reading, modelling, scoring, drafting) runs autonomously.

---

## Users

- **Technical Program Managers** — the primary operator. Reviews the program model, approves plans, and dispatches drafted communication through the HITL queue.
- **Engineering leadership / executives** — consume the leadership dashboard and executive status updates; sign in via Google auth.
- **Team leads** — receive escalations, blocker alerts, and action-item follow-ups for their teams.
- **The agent itself** — an autonomous actor that reads integrations, updates the program model, scores risk, and drafts communication, but is gated by HITL for any external write.

---

## Core features

- **Integrations:** Linear, Jira, GitHub, GitLab, Azure DevOps. Read tickets, epics, PRs, and pipeline state; write where authorized.
- **Program planning:** decompose a PRD into epics, features, and tasks; generate a timeline and milestones; identify dependencies; estimate effort from historical velocity.
- **Sprint management:** plan sprint backlogs from the prioritized backlog and team capacity; monitor burn-down; detect blockers and stalled tickets; recommend scope adjustments.
- **Risk management:** score schedule risk per initiative; predict delivery delays from velocity trends; flag dependency issues; draft mitigation recommendations; escalate critical issues per policy.
- **Stakeholder communication:** draft executive status updates, meeting agendas, post-meeting summaries, and action item follow-ups. All drafts require HITL approval before sending.
- **Reporting:** leadership dashboard showing program health, initiative status, risk heatmap, and velocity trends.
- **HITL gates:** any external communication, plan change, or ticket write requires explicit human approval.

**Explicitly out (v1):** Autonomous ticket creation without HITL; code review or technical design; budget and resource management.

### The agent loops (scheduled routines)

1. **Daily sync.** Pull latest state from all integrations, update program model, recompute risk scores, flag new blockers.
2. **Sprint cadence.** Sprint start: plan backlog + capacity. Mid-sprint: monitor burn-down and blockers. Sprint end: retrospective summary and velocity update.
3. **Weekly program review.** Full program health report, draft executive status update (HITL before sending), escalate critical risks.
4. **On-event.** Webhooks trigger targeted model updates and immediate escalation for critical events.

### Risk model

- **Schedule risk:** remaining points / current velocity vs deadline, with confidence intervals.
- **Dependency risk:** unresolved upstream dependencies scored by their own risk and downstream slack.
- **Blocker risk:** critical-path tickets stalled longer than the team's average cycle time.
- **Team risk:** velocity trend (dropping/stable/rising) and WIP concentration.

Each risk item carries a severity, a plain-language explanation, and a draft mitigation. Critical items auto-escalate to the HITL queue.

### Communication drafts

All communication is grounded in the program state model and graded by the `assay` eval harness before presenting for HITL approval:

- **Executive status update:** initiative status, key achievements, risks and mitigations, upcoming milestones. Calibrated to the audience.
- **Meeting agenda:** generated from open risks, upcoming milestones, and decision items.
- **Post-meeting summary:** decisions, action items, and owners.
- **Action item follow-up:** reminder to owners with current status from the integration.

---

## Data model

The program state model is the source of truth. Core entities in Postgres:

- **Initiative** — top-level program goal. Owner, status, target date, computed schedule-risk score.
- **Epic** — belongs to an initiative. Owner, status, target date, estimate, source integration + external id.
- **Task** — belongs to an epic. Status, points, assignee, cycle time, source integration + external id.
- **Team** — owns epics/tasks. Computed velocity trend and WIP concentration.
- **Dependency** — directed edge between epics (and/or teams); carries slack and a computed dependency-risk score.
- **VelocitySnapshot** — per-team, per-cycle delivered points and burn-down, computed from delivery history; enables as-of-any-point-in-time queries.
- **RiskItem** — severity, type (schedule/dependency/blocker/team), plain-language explanation, draft mitigation, escalation status.
- **CommunicationDraft** — type (exec update / agenda / summary / follow-up), grounded content, eval grade, HITL status (pending/approved/rejected/sent).
- **HITLDecision** — the approval gate record: proposed action, human decision, actor, timestamp.
- **ActionLog / versioned state** — every agent action and every state change recorded with provenance, so the model is queryable as-of any point in time.

---

## Modules

Blueprint toggles for `strategos`. Postgres holds the program state model; Google auth gates the leadership dashboard; email delivers HITL notifications and escalations; Sentry tracks errors (deep observability is delegated to `watchtower`); Railway hosts the persistent multi-integration sync workers and durable routines. No Stripe (not a paid SaaS in v1) and no analytics. Public for the portfolio showcase.

```config
PROJECT_NAME=strategos
DB=postgres
GOOGLE_AUTH=true
STRIPE=false
EMAIL=true
SENTRY=true
ANALYTICS=false
DEPLOY=railway
VISIBILITY=public
```

### Architecture

```
strategos/
  state/
    model/           # program state: initiatives, epics, deps, velocity, risk
    sync/            # scheduled + webhook-driven sync from integrations
    versioned/       # every state change recorded with provenance
  integrations/
    linear/          # tickets, epics, cycles, webhooks
    jira/            # issues, sprints, boards, webhooks
    github/          # PRs, issues, CI status, webhooks
    gitlab/          # MRs, issues, pipelines, webhooks
    azuredevops/     # work items, sprints, pipelines, webhooks
  agents/
    planner/         # decompose PRD -> epics/tasks, timeline, dependencies
    sprint/          # sprint planning, burn-down monitoring, blocker detection
    risk/            # risk scoring, delay prediction, mitigation drafting
    communicator/    # draft updates, agendas, summaries, action items
    escalator/       # escalation rules and routing
  hitl/              # approval gate: propose -> human approves -> act
  schedule/          # durable routines: daily sync, weekly review, sprint cadence
  dashboard/         # program health, risk heatmap, velocity, initiative status
  eval/              # assay-style graders for communication drafts and risk scores
```

---

## Best-in-class quality checklist

- [ ] Program state model updates from all five integrations, queryable as-of any point in time.
- [ ] A sprint plan generated from backlog + capacity is reasonable (tested on seeded data).
- [ ] A schedule risk flag fires before a delivery slip (tested on a seeded regression).
- [ ] Executive update drafts are graded by the eval harness; a factually wrong draft is rejected before HITL.
- [ ] The HITL gate is unconditional: no external write without approval (adversarially tested).
- [ ] All five integrations sync; a webhook event triggers a model update within 60 seconds.
- [ ] Dashboard shows program health, risk heatmap, and velocity trend.
- [ ] Every agent action is logged with provenance; full audit trail readable.

---

## Milestones & status

| #  | Milestone         | Outcome                                                                 | Status         |
|----|-------------------|-------------------------------------------------------------------------|----------------|
| M0 | Scaffold          | Postgres state model, Linear + GitHub integrations, CI green            | In progress    |
| M1 | State sync        | all five integrations syncing, webhook-driven updates, model queryable  | Not started    |
| M2 | Planner           | PRD to epics/tasks/timeline/dependencies, seeded dataset tested         | Not started    |
| M3 | Sprint agent      | backlog planning, burn-down monitoring, blocker detection               | Not started    |
| M4 | Risk agent        | schedule/dependency/blocker scoring, mitigation drafts, escalation      | Not started    |
| M5 | Communicator      | executive updates, agendas, summaries, action items, eval grader        | Not started    |
| M6 | HITL + routines   | approval gate, durable scheduled loops, decision log                    | Not started    |
| M7 | Dashboard + ship  | program health, risk heatmap, velocity, README, release                 | Not started    |

Status legend: Not started, In progress, Done, Blocked.

---

## Definition of done

1. Given a PRD, the planner produces a reasonable epic/task breakdown with a timeline and a dependency graph.
2. The daily sync updates the program model from all connected integrations within 60 seconds of a webhook event.
3. A schedule risk flag fires before a delivery slip (tested on a seeded regression scenario).
4. An executive status update is drafted, graded, and presented for HITL approval before any send.
5. The HITL gate cannot be bypassed: an adversarial input that tries to skip approval is blocked.
6. A full audit trail of every agent action and HITL decision is readable.

---

## Stretch goals

- Multi-program: manage several independent programs with a shared risk model.
- Capacity planning: model team availability against the backlog and recommend re-prioritization.
- Retrospective intelligence: surface patterns across sprints and feed them back into future planning.
- Slack / Teams integration for delivering action items and updates in the team's channel.

---

## Relationship to the portfolio

`strategos` sits above `conductor` (single-ticket delivery), `harbormaster` (multi-agent fleet coordination), and `relay` (CRM automation), applying the same durable-agent and HITL discipline to the program layer. It reuses `assay` for communication grading, `watchtower` for observability, and `abacus` for cost. Together they describe a complete AI-augmented engineering organization: `strategos` plans and coordinates, `harbormaster` controls integration, `conductor` executes, and `assay`/`watchtower` grade and monitor the stack.
