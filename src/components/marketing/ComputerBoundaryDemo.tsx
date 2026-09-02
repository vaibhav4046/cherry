import { COMPUTER_ROWS } from './landing-content.ts';
import { StatusList } from './StatusList.tsx';

export function ComputerBoundaryDemo() {
  return <StatusList rows={COMPUTER_ROWS} label="Boundaries Cherry records" testId="computer-demo" />;
}
