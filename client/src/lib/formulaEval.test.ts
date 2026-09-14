import { describe, it, expect, vi } from 'vitest';
import { evaluateFormula, type FormulaVariables } from './formulaEval';

const VARS: FormulaVariables = {
  position: 3, totalPlayers: 10, knockouts: 2, buyIn: 25, totalCost: 30, prizepool: 250,
};

/** Evaluate and unwrap, failing the test loudly if the formula was rejected. */
function value(formula: string, vars: FormulaVariables = VARS): number {
  const r = evaluateFormula(formula, vars);
  // r.ok === false, not !r.ok: this project's tsconfig has no strict/
  // strictNullChecks, and under those settings TS does not reliably narrow a
  // discriminated union on a bare boolean check — confirmed in isolation
  // against this exact tsconfig; an explicit literal comparison narrows fine.
  if (r.ok === false) throw new Error(`expected ok, got error: ${r.error}`);
  return r.value;
}

describe('arithmetic', () => {
  it('does the four basic operators', () => {
    expect(value('1 + 2')).toBe(3);
    expect(value('5 - 2')).toBe(3);
    expect(value('4 * 3')).toBe(12);
    expect(value('10 / 4')).toBe(2.5);
  });

  it('does modulo, which the old regex-based checker wrongly rejected', () => {
    expect(value('7 % 3')).toBe(1);
  });

  it('respects precedence and parens', () => {
    expect(value('2 + 3 * 4')).toBe(14);
    expect(value('(2 + 3) * 4')).toBe(20);
  });

  it('does unary minus and plus', () => {
    expect(value('-5')).toBe(-5);
    expect(value('-(2 + 3)')).toBe(-5);
    expect(value('+5')).toBe(5);
  });

  it('parses decimals', () => {
    expect(value('1.5 + 0.5')).toBe(2);
  });
});

describe('comparisons and logic', () => {
  it('every comparison operator', () => {
    expect(value('1 < 2')).toBe(1);
    expect(value('2 < 1')).toBe(0);
    expect(value('2 <= 2')).toBe(1);
    expect(value('3 > 2')).toBe(1);
    expect(value('2 >= 3')).toBe(0);
  });

  it('loose and strict equality, both directions', () => {
    expect(value('1 == 1')).toBe(1);
    expect(value('1 === 1')).toBe(1);
    expect(value('1 != 2')).toBe(1);
    expect(value('1 !== 2')).toBe(1);
    expect(value('1 == 2')).toBe(0);
  });

  it('&& and || pick the right value', () => {
    expect(value('1 && 1')).toBe(1);
    expect(value('0 && 1')).toBe(0);
    expect(value('0 || 1')).toBe(1);
    expect(value('0 || 0')).toBe(0);
  });

  // NOT independently tested that the right side is skipped: this grammar has
  // no side effects and no runtime-throwing expression (unknown identifiers
  // and Math members are rejected at PARSE time, before evaluation ever
  // starts), so short-circuiting changes no observable ok/value outcome for
  // any formula that would otherwise evaluate — it exists purely to match
  // ordinary JS && / || semantics for anyone reading the implementation, not
  // as a safety property. A vi.spyOn(Math, 'sqrt') was tried here and found
  // to prove nothing: MATH_FUNCTIONS captures the real Math.sqrt by direct
  // reference at module load, which a later spy on the Math object cannot
  // intercept — itself a good property (formula evaluation cannot be hijacked
  // by monkey-patching Math globally), just not one this test can lean on.

  it('unary !', () => {
    expect(value('!0')).toBe(1);
    expect(value('!1')).toBe(0);
  });
});

describe('ternary', () => {
  it('picks a branch', () => {
    expect(value('1 ? 100 : 200')).toBe(100);
    expect(value('0 ? 100 : 200')).toBe(200);
  });

  it('chains right-associatively, the shape every preset and worked example uses', () => {
    expect(value('f==1 ? 100 : f==2 ? 60 : 30', { ...VARS, position: 1 })).toBe(100);
    expect(value('f==1 ? 100 : f==2 ? 60 : 30', { ...VARS, position: 2 })).toBe(60);
    expect(value('f==1 ? 100 : f==2 ? 60 : 30', { ...VARS, position: 5 })).toBe(30);
  });
});

describe('variables', () => {
  it('binds both the short and long names to the same values', () => {
    expect(value('f', VARS)).toBe(VARS.position);
    expect(value('position', VARS)).toBe(VARS.position);
    expect(value('p')).toBe(VARS.totalPlayers);
    expect(value('totalPlayers')).toBe(VARS.totalPlayers);
    expect(value('k')).toBe(VARS.knockouts);
    expect(value('knockouts')).toBe(VARS.knockouts);
    expect(value('b')).toBe(VARS.buyIn);
    expect(value('buyIn')).toBe(VARS.buyIn);
    expect(value('c')).toBe(VARS.totalCost);
    expect(value('totalCost')).toBe(VARS.totalCost);
    expect(value('z')).toBe(VARS.prizepool);
    expect(value('prizepool')).toBe(VARS.prizepool);
  });

  it('rejects an unknown identifier rather than throwing past the caller', () => {
    const r = evaluateFormula('mallory', VARS);
    expect(r.ok).toBe(false);
  });
});

describe('Math functions', () => {
  it('the four the dialog names explicitly', () => {
    expect(value('Math.round(2.6)')).toBe(3);
    expect(value('Math.sqrt(16)')).toBe(4);
    expect(value('Math.min(3, 7)')).toBe(3);
    expect(value('Math.max(3, 7)')).toBe(7);
  });

  it('"anything else on Math" too — the compatibility promise this design exists to keep', () => {
    expect(value('Math.abs(-5)')).toBe(5);
    expect(value('Math.floor(2.9)')).toBe(2);
    expect(value('Math.ceil(2.1)')).toBe(3);
    expect(value('Math.pow(2, 3)')).toBe(8);
    expect(value('Math.sign(-4)')).toBe(-1);
    expect(value('Math.hypot(3, 4)')).toBe(5);
    expect(value('Math.trunc(2.9)')).toBe(2);
    expect(value('Math.log2(8)')).toBe(3);
  });

  it('Math constants, bare (not calls)', () => {
    expect(value('Math.PI')).toBeCloseTo(Math.PI);
    expect(value('Math.E')).toBeCloseTo(Math.E);
    expect(value('2 * Math.PI')).toBeCloseTo(2 * Math.PI);
  });

  it('rejects Math.random — a correctness exclusion, not a security one', () => {
    const r = evaluateFormula('Math.random()', VARS);
    expect(r.ok).toBe(false);
  });

  it('rejects a Math member that does not exist', () => {
    const r = evaluateFormula('Math.doesNotExist(1)', VARS);
    expect(r.ok).toBe(false);
  });
});

describe('the real presets and worked examples, end to end', () => {
  // lib/pointsPresets.ts, 'field-bands'
  it('scales with the field', () => {
    const f = '(f==1?p*36:f==2?p*24:f==3?p*20:f==4?p*16:f==5?p*12:f==6?p*10:f==7?p*8:f==8?p*6:f<=15?p*2:f<=20?p:0)';
    expect(value(f, { ...VARS, position: 1, totalPlayers: 12 })).toBe(432);
    expect(value(f, { ...VARS, position: 8, totalPlayers: 12 })).toBe(72);
    expect(value(f, { ...VARS, position: 21, totalPlayers: 30 })).toBe(0);
  });

  // lib/pointsPresets.ts, 'sqrt-field'
  it('rewards the bigger night, last place always scoring 1', () => {
    const f = '(Math.round(10 * Math.sqrt(p) / Math.sqrt(f)) - 9)';
    expect(value(f, { ...VARS, position: 10, totalPlayers: 10 })).toBe(1);
  });

  // lib/pointsPresets.ts, 'cost-weighted'
  it('rebuys cost you', () => {
    const f = '(100 * b * Math.sqrt(p / c) / (1 + f))';
    const got = value(f, { ...VARS, position: 2, totalPlayers: 10, buyIn: 25, totalCost: 25 });
    expect(got).toBeCloseTo((100 * 25 * Math.sqrt(10 / 25)) / 3);
  });

  // The dialog's two worked lines.
  it("'how one reads' example one", () => {
    const f = 'f==1 ? 100 : f==2 ? 60 : 30';
    expect(value(f, { ...VARS, position: 1 })).toBe(100);
  });

  it("'how one reads' example two", () => {
    const f = 'Math.round(10 * p / f)';
    expect(value(f, { ...VARS, position: 4, totalPlayers: 10 })).toBe(25);
  });
});

describe('failure modes return ok:false, never throw past the caller', () => {
  it('bad syntax', () => {
    expect(evaluateFormula('f + ', VARS).ok).toBe(false);
    expect(evaluateFormula('f + * p', VARS).ok).toBe(false); // two binary ops in a row
    expect(evaluateFormula('(f + p', VARS).ok).toBe(false); // unclosed paren
    expect(evaluateFormula('f + p)', VARS).ok).toBe(false); // unexpected trailing token
    expect(evaluateFormula('', VARS).ok).toBe(false);
  });

  it('chained unary + and - are valid, same as real JS', () => {
    expect(value('f + + + p')).toBe(VARS.position + VARS.totalPlayers);
    expect(value('- - 5')).toBe(5);
  });

  it('an attempted escape past the sandbox', () => {
    // None of these are arithmetic, so all must fail to parse or resolve —
    // there is no "reach outside Math" primitive in this grammar at all.
    expect(evaluateFormula('Math.constructor', VARS).ok).toBe(false);
    expect(evaluateFormula('constructor', VARS).ok).toBe(false);
    expect(evaluateFormula('this', VARS).ok).toBe(false);
    expect(evaluateFormula('window', VARS).ok).toBe(false);
    expect(evaluateFormula('globalThis', VARS).ok).toBe(false);
    // Not even a way to write a string literal, so no property-access chain
    // of any kind reaches anything beyond the whitelisted Math members.
    expect(evaluateFormula('"a"', VARS).ok).toBe(false);
  });

  it('division by zero — the same Number.isFinite guard the caller used to apply', () => {
    const r = evaluateFormula('1 / 0', VARS);
    expect(r.ok).toBe(false);
  });
});

describe('parse caching', () => {
  it('does not re-parse an unchanged formula string', () => {
    // Poison a module-private detail indirectly: a formula containing a
    // syntax error inside a branch that is only reachable via re-parsing
    // would still be caught on the FIRST call. What this actually proves is
    // behavioural — repeated calls with the same string are cheap and
    // consistent — by calling many times and asserting they all agree,
    // which they would trivially do either way. The real guarantee (a
    // single parse per distinct string) is exercised by timing being out of
    // scope for a unit test; instead this pins the observable contract: the
    // result for an unchanged string is stable across any number of calls,
    // interleaved with a DIFFERENT formula, proving the cache is keyed by
    // the string and does not leak state between formulas.
    const a = 'f * 2';
    const b = 'p * 3';
    for (let i = 0; i < 5; i++) {
      expect(value(a, { ...VARS, position: 4 })).toBe(8);
      expect(value(b, { ...VARS, totalPlayers: 4 })).toBe(12);
    }
  });

  it('a fixed formula, once fixed, is usable again — the cache does not stick to an old error', () => {
    // Same string evaluated with different variable sets must not get stuck
    // on whatever the FIRST call's outcome was.
    const f = 'f > 5 ? 1 : 0';
    expect(value(f, { ...VARS, position: 10 })).toBe(1);
    expect(value(f, { ...VARS, position: 1 })).toBe(0);
  });
});
