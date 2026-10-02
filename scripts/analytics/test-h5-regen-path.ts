/**
 * H5: regenerate-on-truncation + post-regen routes to fix-code (not "incomplete").
 *
 *   npx tsx --tsconfig tsconfig.json scripts/analytics/test-h5-regen-path.ts
 */

function isIncompleteCodeError(error: unknown): boolean {
  const msg = String(error).toLowerCase();
  return (
    msg.includes('was never closed') ||
    msg.includes('unexpected eof') ||
    msg.includes('eof while scanning') ||
    msg.includes('truncated')
  );
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

/**
 * Decision table mirroring useAnalysisContext post-regen routing:
 * - incomplete + regen → try again
 * - post-regen incomplete → report incomplete
 * - post-regen other → fix-code (not "incomplete")
 */
function routeAfterRegen(regenExecError: unknown): 'incomplete' | 'fix-code' {
  if (isIncompleteCodeError(regenExecError)) return 'incomplete';
  return 'fix-code';
}

function main() {
  assert(
    isIncompleteCodeError('SyntaxError: unexpected EOF while parsing'),
    'EOF is incomplete'
  );
  assert(
    isIncompleteCodeError("SyntaxError: '(' was never closed"),
    'never closed is incomplete'
  );
  assert(!isIncompleteCodeError('KeyError: EDUC'), 'KeyError is not incomplete');
  assert(
    routeAfterRegen('KeyError: EDUC') === 'fix-code',
    'post-regen KeyError → fix-code'
  );
  assert(
    routeAfterRegen('SyntaxError: unexpected EOF while parsing') ===
      'incomplete',
    'post-regen still incomplete → incomplete'
  );
  assert(
    routeAfterRegen('NameError: name x is not defined') === 'fix-code',
    'post-regen NameError → fix-code'
  );

  console.log('PASS: H5 regenerate routing');
}

main();
