import { programModel } from "@/state/model/repository";
import { Panel } from "@/components/ui/primitives";
import { VelocityBars } from "@/components/viz/VelocityBars";
export const dynamic = "force-dynamic";

export default async function Sprints() {
  const pid = await programModel.firstProgramId();
  const velocity = pid ? await programModel.velocityByTeam(pid) : [];
  return <Panel title="Sprints" hint="velocity by team"><VelocityBars teams={velocity} /></Panel>;
}
