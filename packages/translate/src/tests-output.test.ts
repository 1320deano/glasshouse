import { describe, expect, it } from "vitest";
import { parseTestOutput } from "./tests-output.js";

describe("parseTestOutput", () => {
  it("reads vitest and jest summaries", () => {
    expect(parseTestOutput(" Test Files  8 passed (8)\n      Tests  38 passed (38)\n")).toEqual({ passed: 38, failed: 0 });
    expect(parseTestOutput(" Test Files  1 failed | 1 passed (2)\n      Tests  1 failed | 7 passed (8)\n")).toEqual({ passed: 7, failed: 1 });
    expect(parseTestOutput("Tests:       1 failed, 3 passed, 4 total\nSnapshots:   0 total")).toEqual({ passed: 3, failed: 1 });
  });

  it("reads pytest, cargo, mocha, go and dotnet", () => {
    expect(parseTestOutput("===================== 3 passed, 1 failed, 2 skipped in 0.52s =====================")).toEqual({ passed: 3, failed: 1 });
    expect(parseTestOutput("test result: ok. 5 passed; 0 failed; 0 ignored; 0 measured")).toEqual({ passed: 5, failed: 0 });
    expect(parseTestOutput("  12 passing (300ms)\n  1 failing\n")).toEqual({ passed: 12, failed: 1 });
    expect(parseTestOutput("--- FAIL: TestLogin (0.00s)\n--- PASS: TestScenes (0.00s)\nFAIL\nFAIL\tapp/auth\t0.1s")).toEqual({ passed: 1, failed: 1 });
    expect(parseTestOutput("ok  \tapp/auth\t0.12s\nok  \tapp/scenes\t0.3s")).toEqual({ passed: 2, failed: 0 });
    expect(parseTestOutput("Passed!  - Failed:     0, Passed:     5, Skipped:     0, Total:     5")).toEqual({ passed: 5, failed: 0 });
  });

  it("gives nothing for output with no counts", () => {
    expect(parseTestOutput("Compiling...\nDone.")).toBeUndefined();
    expect(parseTestOutput(undefined)).toBeUndefined();
  });

  it("ignores colour codes", () => {
    expect(parseTestOutput("\x1b[32m      Tests  6 passed (6)\x1b[0m")).toEqual({ passed: 6, failed: 0 });
  });
});
