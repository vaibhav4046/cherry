import { fail, ok, type Result } from '../core/result.ts';
import { deleteWorkspace, listWorkspaces } from '../mission/mission-service.ts';
import { importShippedExampleWorkspace } from './workspace-archive.ts';

export type ExampleWorkspaceKind = 'golden-loop' | 'starter-library';

interface ExampleWorkspaceDefinition {
  readonly path: string;
  readonly workspaceName: string;
  readonly descriptionMarker: string;
}

export const EXAMPLE_WORKSPACES: Record<ExampleWorkspaceKind, ExampleWorkspaceDefinition> = {
  'golden-loop': {
    path: '/examples/example-workspace.json',
    workspaceName: 'EXAMPLE — Learn a landing page workflow',
    descriptionMarker: 'Shipped labelled example workspace',
  },
  'starter-library': {
    path: '/examples/starter-library-workspace.json',
    workspaceName: 'EXAMPLE — Creator skills starter library',
    descriptionMarker: 'starter-library-v1',
  },
};

export const SHOWCASE_EXAMPLE_WORKSPACE = {
  name: 'Showcase run',
  description: 'showcase-run-v1 — labelled sample state for the guided product tour.',
} as const;

export interface LoadedExampleWorkspace {
  workspaceId: string;
  name: string;
  status: 'imported' | 'already-loaded';
  hashVerified: boolean | null;
}

type ExampleFetcher = (input: string) => Promise<Pick<Response, 'ok' | 'status' | 'text'>>;

const inFlightLoads = new Map<ExampleWorkspaceKind, Promise<Result<LoadedExampleWorkspace>>>();

function matchesExample(
  workspace: { isExample?: boolean; name: string; description?: string },
  definition: ExampleWorkspaceDefinition,
): boolean {
  return workspace.isExample === true
    && workspace.name === definition.workspaceName
    && (definition.descriptionMarker === '' || workspace.description?.includes(definition.descriptionMarker) === true);
}

/**
 * Import a shipped, hash-verified example once. Subsequent clicks reuse the
 * exact labelled workspace instead of creating duplicate library entries.
 */
async function importExampleWorkspace(
  kind: ExampleWorkspaceKind,
  fetcher: ExampleFetcher,
): Promise<Result<LoadedExampleWorkspace>> {
  const definition = EXAMPLE_WORKSPACES[kind];
  const existing = (await listWorkspaces()).find((workspace) => matchesExample(workspace, definition));
  if (existing) {
    return ok({
      workspaceId: existing.id,
      name: existing.name,
      status: 'already-loaded',
      hashVerified: null,
    });
  }

  try {
    const response = await fetcher(definition.path);
    if (!response.ok) {
      return fail('temporary', `The labelled example could not be loaded (${response.status}). Try again.`);
    }
    const imported = await importShippedExampleWorkspace(await response.text(), kind);
    if (!imported.ok) return imported;
    return ok({ ...imported.value, status: 'imported' });
  } catch (error) {
    return fail(
      'temporary',
      'The labelled example could not be loaded. Check this page connection and try again.',
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
}

export function loadExampleWorkspace(
  kind: ExampleWorkspaceKind,
  fetcher: ExampleFetcher = (path) => fetch(path),
): Promise<Result<LoadedExampleWorkspace>> {
  const existing = inFlightLoads.get(kind);
  if (existing) return existing;

  const pending = importExampleWorkspace(kind, fetcher).finally(() => {
    if (inFlightLoads.get(kind) === pending) inFlightLoads.delete(kind);
  });
  inFlightLoads.set(kind, pending);
  return pending;
}

/** Delete only registered shipped examples and the exact guided-tour fixture. */
export async function resetExampleWorkspaces(): Promise<Result<{ deleted: number }>> {
  const examples = (await listWorkspaces()).filter((workspace) => {
    if (workspace.isExample !== true) return false;
    if (Object.values(EXAMPLE_WORKSPACES).some((definition) => matchesExample(workspace, definition))) {
      return true;
    }
    return workspace.name === SHOWCASE_EXAMPLE_WORKSPACE.name
      && workspace.description === SHOWCASE_EXAMPLE_WORKSPACE.description;
  });
  let deleted = 0;
  for (const workspace of examples) {
    const result = await deleteWorkspace(workspace.id);
    if (!result.ok) return result;
    deleted += 1;
  }
  return ok({ deleted });
}
