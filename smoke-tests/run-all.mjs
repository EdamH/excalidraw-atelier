#!/usr/bin/env node
// smoke-tests/run-all.mjs
//
// Runs all smoke test suites in the correct order and reports totals.
//
// Usage:
//   node smoke-tests/run-all.mjs

import { execSync } from "node:child_process";

const suites = [
  "smoke-tests/features.test.mjs",
  "smoke-tests/collab.test.mjs",
  "smoke-tests/resilience.test.mjs",
  "smoke-tests/save.test.mjs",
];

let allPassed = true;

for (const suite of suites) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  Running: ${suite}`);
  console.log(`${"═".repeat(60)}`);
  try {
    execSync(`node ${suite}`, { stdio: "inherit" });
  } catch {
    allPassed = false;
  }
}

console.log(`\n${"═".repeat(60)}`);
if (allPassed) {
  console.log("  ALL SUITES PASSED");
} else {
  console.log("  SOME SUITES FAILED");
}
console.log(`${"═".repeat(60)}\n`);

process.exit(allPassed ? 0 : 1);
