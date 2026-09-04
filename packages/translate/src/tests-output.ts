/**
 * Read pass/fail counts out of a test runner's output. Rule 2: the tile may only say
 * "12 passed, 1 failed" when the runner printed it. Unknown output gives no counts.
 */
export interface TestCounts {
  passed?: number;
  failed?: number;
}

const n = (m: RegExpMatchArray | null, i = 1) => (m && m[i] !== undefined ? Number(m[i]) : undefined);

function lastMatch(text: string, re: RegExp): RegExpMatchArray | null {
  let last: RegExpMatchArray | null = null;
  for (const m of text.matchAll(re)) last = m;
  return last;
}

export function parseTestOutput(output: string | undefined): TestCounts | undefined {
  if (!output) return undefined;
  // eslint-disable-next-line no-control-regex -- strips terminal colour codes
  const text = output.replace(/\x1b\[[0-9;]*m/g, "");

  // vitest: "Tests  38 passed | 2 failed (40)"   jest: "Tests:       1 failed, 3 passed, 4 total"
  const vitest = lastMatch(text, /Tests:?\s+([^\n]*)/g);
  if (vitest?.[1]) {
    const line = vitest[1];
    const passed = n(line.match(/(\d+)\s+passed/));
    const failed = n(line.match(/(\d+)\s+failed/));
    if (passed !== undefined || failed !== undefined) return { passed: passed ?? 0, failed: failed ?? 0 };
  }

  // pytest: "==== 3 passed, 1 failed, 2 skipped in 0.5s ===="
  const pytest = lastMatch(text, /=+\s*([^=\n]*?)\s+in\s+[\d.]+s\s*=+/g);
  if (pytest?.[1]) {
    const line = pytest[1];
    const passed = n(line.match(/(\d+)\s+passed/));
    const failed = n(line.match(/(\d+)\s+(?:failed|error)/));
    if (passed !== undefined || failed !== undefined) return { passed: passed ?? 0, failed: failed ?? 0 };
  }

  // cargo: "test result: ok. 5 passed; 0 failed; ..."
  const cargo = lastMatch(text, /test result: \w+\.\s+(\d+) passed;\s+(\d+) failed/g);
  if (cargo) return { passed: n(cargo, 1), failed: n(cargo, 2) };

  // mocha: "12 passing" / "1 failing"
  const passing = lastMatch(text, /(\d+)\s+passing/g);
  const failing = lastMatch(text, /(\d+)\s+failing/g);
  if (passing || failing) return { passed: n(passing) ?? 0, failed: n(failing) ?? 0 };

  // dotnet: "Passed!  - Failed:     0, Passed:     5"
  const dotnet = lastMatch(text, /Failed:\s+(\d+),\s+Passed:\s+(\d+)/g);
  if (dotnet) return { failed: n(dotnet, 1), passed: n(dotnet, 2) };

  // go test: one "ok" or "FAIL" line per package; "--- FAIL: TestX" per failing test
  const goFails = [...text.matchAll(/^--- FAIL: /gm)].length;
  const goPasses = [...text.matchAll(/^--- PASS: /gm)].length;
  if (goFails || goPasses) return { passed: goPasses, failed: goFails };
  if (/^ok\s+\S+\s+[\d.]+s/m.test(text) && !/^FAIL/m.test(text)) return { passed: [...text.matchAll(/^ok\s+\S+/gm)].length, failed: 0 };

  // playwright and other "N passed" / "N failed" runners
  const passed = lastMatch(text, /\b(\d+)\s+passed\b/g);
  const failed = lastMatch(text, /\b(\d+)\s+failed\b/g);
  if (passed || failed) return { passed: n(passed) ?? 0, failed: n(failed) ?? 0 };
  return undefined;
}
