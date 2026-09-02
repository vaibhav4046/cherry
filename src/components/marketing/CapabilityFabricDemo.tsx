import { CAPABILITY_ROWS } from './landing-content.ts';
import { StatusList } from './StatusList.tsx';

export function CapabilityFabricDemo() {
  return <StatusList rows={CAPABILITY_ROWS} label="Capabilities and their real status" testId="capability-demo" />;
}
