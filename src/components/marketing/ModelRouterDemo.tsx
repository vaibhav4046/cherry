import { MODEL_ROWS } from './landing-content.ts';
import { StatusList } from './StatusList.tsx';

export function ModelRouterDemo() {
  return <StatusList rows={MODEL_ROWS} label="Hosts Cherry can route to" testId="model-demo" />;
}
