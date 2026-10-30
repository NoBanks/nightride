// Long cards come in stages ("Get the wheel off", "Find what caused it"...), so 21 steps read as
// a few small jobs and the rider always knows what's next. Shared by the server tests and the phone.

// Steps grouped by stage: [{ name, start, steps }], start is the 0-based index of its first step.
// A card without stages is one unnamed group.
export function groupSteps(stages, steps) {
  if (!stages?.length) return [{ name: "", start: 0, steps }];
  return stages.map((s, k) => {
    const start = s.from - 1, end = k + 1 < stages.length ? stages[k + 1].from - 1 : steps.length;
    return { name: s.name, start, steps: steps.slice(start, end) };
  });
}

// Where step i sits: { name, n, of, step, steps } (1-based), or null for a card without stages.
export function stageOf(stages, i, total) {
  if (!stages?.length) return null;
  const groups = groupSteps(stages, Array.from({ length: total }));
  const k = groups.findLastIndex((g) => g.start <= i);
  return { name: groups[k].name, n: k + 1, of: groups.length, step: i - groups[k].start + 1, steps: groups[k].steps.length };
}
