import { programModel } from "@/state/model/repository";
import { Panel } from "@/components/ui/primitives";
import { VelocityBars } from "@/components/viz/VelocityBars";
import { CurrentSprint } from "@/components/viz/CurrentSprint";
import { FlowBoard } from "@/components/viz/FlowBoard";
export const dynamic = "force-dynamic";

export default async function Sprints() {
  const pid = await programModel.primaryProgramId();
  const [velocity, sprint, aiInits] = await Promise.all([
    pid ? programModel.velocityByTeam(pid) : Promise.resolve([]),
    programModel.currentSprint(),
    pid ? programModel.aiInitiatives(pid) : Promise.resolve([]),
  ]);
  const flows = await Promise.all(aiInits.map(async (i) => ({ title: i.title, plan: await programModel.currentDispatchPlan(i.externalId) })));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Panel title="Human sprint" hint="proposed plan (pending approval)"><CurrentSprint sprint={sprint} /></Panel>
      {flows.map((f) => (
        <Panel key={f.title} title={`Agent flow — ${f.title}`} hint="readiness + dependency waves">
          <FlowBoard title={f.title} plan={f.plan} />
        </Panel>
      ))}
      <Panel title="Velocity" hint="by team"><VelocityBars teams={velocity} /></Panel>
    </div>
  );
}
