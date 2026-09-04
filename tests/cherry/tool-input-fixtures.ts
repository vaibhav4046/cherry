import type { CherryToolDefinition } from '../../src/cherry/webmcp/tool-contract.ts';

/**
 * Builds one minimally-valid argument object for any Cherry tool straight from
 * the JSON Schema that tool publishes to the host.
 *
 * Derived rather than hand-listed on purpose. The contract walks that use this
 * (`tool-schema-contract.test.ts`, `webmcp-security-boundaries.test.ts`) must
 * cover EVERY registered tool, including tools added after these tests were
 * written. A hand-maintained name→input map would quietly stop covering a new
 * tool the moment someone forgot to extend it, which is exactly the gap a
 * boundary test exists to close.
 */

type JsonSchemaNode = {
  type?: string;
  enum?: unknown[];
  items?: JsonSchemaNode;
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  minimum?: number;
};

/** Real persisted ids to use when a property name clearly refers to one. */
export type ProbeIds = Readonly<Record<string, string>>;

const PROBE_STRING = 'contract probe';

/**
 * Zod enforces bounds the published JSON Schema does not always spell out
 * (`url()`, `min(8)`), so a few property names need a shape-correct value
 * rather than the generic filler.
 */
const STRING_OVERRIDES: Readonly<Record<string, string>> = {
  url: 'https://example.com/probe',
  sourceUri: 'https://example.com/probe',
  path: 'probe.html',
  content: 'probe content',
  outcome: 'Ship the tool contract probe outcome',
  task: 'thumbnail hierarchy probe',
  text: 'probe transcript line',
};

function stringFor(key: string, ids: ProbeIds): string {
  return ids[key] ?? STRING_OVERRIDES[key] ?? PROBE_STRING;
}

function valueFor(key: string, node: JsonSchemaNode, ids: ProbeIds): unknown {
  if (Array.isArray(node.enum) && node.enum.length > 0) return node.enum[0];
  // `schedule` is advertised as a bare object because it is a discriminated
  // union; `manual` is the only variant with no further required fields.
  if (key === 'schedule') return { kind: 'manual' };
  switch (node.type) {
    case 'integer':
    case 'number':
      return node.minimum ?? 1;
    case 'boolean':
      return true;
    case 'array':
      return [valueFor(key, node.items ?? { type: 'string' }, ids)];
    case 'object':
      return buildObject(node, ids);
    default:
      return stringFor(key, ids);
  }
}

function buildObject(schema: JsonSchemaNode, ids: ProbeIds): Record<string, unknown> {
  const properties = schema.properties ?? {};
  const input: Record<string, unknown> = {};
  for (const key of schema.required ?? []) {
    const node = properties[key];
    if (!node) continue;
    input[key] = valueFor(key, node, ids);
  }
  return input;
}

/**
 * Only the REQUIRED properties are filled. Optional properties are deliberately
 * left out: the point is the smallest payload the published contract accepts.
 */
export function minimalToolInput(
  definition: CherryToolDefinition,
  ids: ProbeIds = {},
): Record<string, unknown> {
  return buildObject(definition.inputSchema as unknown as JsonSchemaNode, ids);
}
