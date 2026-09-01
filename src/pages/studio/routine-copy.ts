export function plainRoutineMessage(message: string): string {
  const lower = message.toLowerCase();

  if (/skill[\s_-]*graph/.test(lower) && /not found/.test(lower) && /workspace/.test(lower)) {
    return 'This skill is not available in your space. Open Skills and choose an available skill.';
  }
  if (/routine/.test(lower) && /mission/.test(lower) && /(bound|active graph)/.test(lower)) {
    return 'This routine is not connected to the current project. Create a new routine from the approved skill.';
  }
  if (/routine (?:is at|changed to) revision/.test(lower)) {
    return 'This routine changed while you were working. Reload the page and try again.';
  }
  if (/skill[\s_-]*graph/.test(lower) && /(approval|approved|changed|stale|current .*revision)/.test(lower)) {
    return 'The approved skill changed. Open the skill, approve the current version, then try again.';
  }
  if (/^only a skill approved at its current revision/.test(lower)) {
    return 'Approve the current skill version in Skills before creating a routine.';
  }
  if (/^(this routine has no standing approval|the routine changed since it was approved)/.test(lower)) {
    return 'Approve the current routine version before enabling it.';
  }

  return message;
}
