// The GLSL a program for one process version compiles: the host defines
// SL_PROCESS_VERSION, and the preprocessor keeps one side of each
// `#if SL_PROCESS_VERSION >= n` / `#else` / `#endif`. Throws on any other
// directive form, so a test can't pass on text it misread.

const IF = /^\s*#if\s+SL_PROCESS_VERSION\s*>=\s*(\d+)\s*$/;
const ELSE = /^\s*#else\s*$/;
const ENDIF = /^\s*#endif\s*$/;

export function atVersion(glsl: string, version: number): string {
  const kept: string[] = [];
  const taking: boolean[] = [];
  for (const line of glsl.split("\n")) {
    const m = IF.exec(line);
    if (m) taking.push(version >= Number(m[1]));
    else if (ELSE.test(line)) {
      if (taking.length === 0) throw new Error("#else without #if");
      taking.push(!taking.pop());
    } else if (ENDIF.test(line)) {
      if (taking.pop() === undefined) throw new Error("#endif without #if");
    } else if (/^\s*#/.test(line)) throw new Error(`unexpected directive: ${line.trim()}`);
    else if (taking.every(Boolean)) kept.push(line);
  }
  if (taking.length > 0) throw new Error("unterminated #if");
  return kept.join("\n");
}
