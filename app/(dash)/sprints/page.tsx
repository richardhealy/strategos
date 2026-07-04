import { programModel } from "@/state/model/repository";
import { Panel } from "@/components/ui/primitives";
import { VelocityBars } from "@/components/viz/VelocityBars";
import { CurrentSprint } from "@/components/viz/CurrentSprint";
export const dynamic = "force-dynamic";

export default async function Sprints() {
  const pid = await programModel.primaryProgramId();
  const [velocity, sprint] = await Promise.all([
    pid ? programModel.velocityByTeam(pid) : Promise.resolve([]),
    programModel.currentSprint(),
  ]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Panel title="Current sprint" hint="proposed plan (pending approval)"><CurrentSprint sprint={sprint} /></Panel>
      <Panel title="Sprints" hint="velocity by team"><VelocityBars teams={velocity} /></Panel>
    </div>
  );
}
