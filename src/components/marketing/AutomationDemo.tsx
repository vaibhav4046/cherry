import { RUN_PATH_ROWS, type RunPathRow } from './landing-content.ts';
import { StatusList } from './StatusList.tsx';

export function AutomationDemo() {
  return (
    <StatusList
      rows={RUN_PATH_ROWS}
      label="Where a routine actually runs"
      testId="automation-demo"
      secondary={(row) => (row as RunPathRow).runtime}
    />
  );
}
