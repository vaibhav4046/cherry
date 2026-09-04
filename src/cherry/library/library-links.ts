export function buildRoutineDraftUrl(workspaceId: string, skillGraphId: string): string {
  const query = new URLSearchParams();
  query.set('workspaceId', workspaceId);
  query.set('skillGraphId', skillGraphId);
  return `/studio/routines?${query.toString()}`;
}

export function buildConnectUrl(targets: readonly string[]): string {
  const declared = new Set(targets);
  if (declared.has('webmcp')) return '/connect#host-chatgpt';
  if (declared.has('codex')) return '/connect#host-codex';
  if (declared.has('claude-code')) return '/connect#host-agent-skills';
  if (declared.has('agent-skills')) return '/connect#host-agent-skills';
  return '/connect#library-tools-heading';
}
