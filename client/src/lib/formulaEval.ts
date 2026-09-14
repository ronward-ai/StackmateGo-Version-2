/**
 * Custom points formulas, evaluated without ever handing the string to a JS
 * engine.
 *
 * `useLeagueSettings.ts`'s `calculatePoints` used to build the formula into
 * `new Function('f','p', ..., 'Math', 'return (' + formula + ')')` and call
 * it. Nothing validated `customFormula` before that — the dialog's own
 * "Formula valid" tick ran a SEPARATE, disconnected `new Function` of its
 * own, used only for the tick and never consulted by the real scoring path.
 *
 * The trust boundary that crossed: `RealTimeLeagueTable.tsx` loads the
 * DIRECTOR's league settings and scores with them in the PARTICIPANT's
 * browser, by design — participants watch the director's own scheme live.
 * So any signed-in director could put arbitrary JavaScript in a points
 * formula and have it run on this origin, in the browser of everyone who
 * scans their QR code, with access to that visitor's Firebase session.
 *
 * This module can only ever produce arithmetic. However a formula string is
 * contrived, the worst it can do is fail to parse — there is no path from
 * here to executing anything.
 *
 * COMPATIBILITY: the dialog's "What you can use" reference promises four
 * named Math functions "and anything else on JavaScript's Math works too."
 * A live league may already have a saved formula using a Math member other
 * than those four, so the whitelist here is the FULL set of Math's static
 * functions and constants — explicitly enumerated (never "call anything on
 * Math"), which is safe because every entry is a pure numeric function with
 * no route to anything outside Math. The one deliberate exclusion is
 * `Math.random`: not a security concern, a correctness one — calculatePoints
 * runs fresh on every render with no memoisation of its own, so a random
 * component would make a league's own points flicker on screen.
 */

export interface FormulaVariables {
  position: number;
  totalPlayers: number;
  knockouts: number;
  buyIn: number;
  totalCost: number;
  prizepool: number;
}

export type FormulaEvaluation =
  | { ok: true; value: number }
  | { ok: false; error: string };

/** Every real `Math` static function, minus `random`. Pure and deterministic. */
const MATH_FUNCTIONS: Record<string, (...args: number[]) => number> = {
  abs: Math.abs, acos: Math.acos, acosh: Math.acosh, asin: Math.asin,
  asinh: Math.asinh, atan: Math.atan, atanh: Math.atanh, atan2: Math.atan2,
  cbrt: Math.cbrt, ceil: Math.ceil, cos: Math.cos, cosh: Math.cosh,
  exp: Math.exp, expm1: Math.expm1, floor: Math.floor, hypot: Math.hypot,
  log: Math.log, log10: Math.log10, log1p: Math.log1p, log2: Math.log2,
  max: Math.max, min: Math.min, pow: Math.pow, round: Math.round,
  sign: Math.sign, sin: Math.sin, sinh: Math.sinh, sqrt: Math.sqrt,
  tan: Math.tan, tanh: Math.tanh, trunc: Math.trunc,
};

/** Every real `Math` constant. */
const MATH_CONSTANTS: Record<string, number> = {
  PI: Math.PI, E: Math.E, LN2: Math.LN2, LN10: Math.LN10,
  LOG2E: Math.LOG2E, LOG10E: Math.LOG10E, SQRT1_2: Math.SQRT1_2, SQRT2: Math.SQRT2,
};

// ---------------------------------------------------------------------------
// Tokeniser
// ---------------------------------------------------------------------------

type TokenType =
  | 'number' | 'ident' | 'dot' | 'lparen' | 'rparen' | 'comma'
  | 'op' | 'question' | 'colon' | 'eof';

interface Token { type: TokenType; value: string }

// Longest-match-first: '===' before '==' before '=', etc.
const OPERATORS = [
  '===', '!==', '==', '!=', '<=', '>=', '&&', '||',
  '+', '-', '*', '/', '%', '<', '>', '!',
];

function tokenise(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i + 1;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      tokens.push({ type: 'number', value: src.slice(i, j) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
      tokens.push({ type: 'ident', value: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === '.') { tokens.push({ type: 'dot', value: '.' }); i++; continue; }
    if (c === '(') { tokens.push({ type: 'lparen', value: '(' }); i++; continue; }
    if (c === ')') { tokens.push({ type: 'rparen', value: ')' }); i++; continue; }
    if (c === ',') { tokens.push({ type: 'comma', value: ',' }); i++; continue; }
    if (c === '?') { tokens.push({ type: 'question', value: '?' }); i++; continue; }
    if (c === ':') { tokens.push({ type: 'colon', value: ':' }); i++; continue; }
    const op = OPERATORS.find(o => src.startsWith(o, i));
    if (op) { tokens.push({ type: 'op', value: op }); i += op.length; continue; }
    throw new Error(`Unexpected character '${c}'`);
  }
  tokens.push({ type: 'eof', value: '' });
  return tokens;
}

// ---------------------------------------------------------------------------
// AST
// ---------------------------------------------------------------------------

type Node =
  | { kind: 'num'; value: number }
  | { kind: 'var'; name: string }
  | { kind: 'const'; name: string }
  | { kind: 'call'; name: string; args: Node[] }
  | { kind: 'unary'; op: string; arg: Node }
  | { kind: 'binary'; op: string; left: Node; right: Node }
  | { kind: 'ternary'; test: Node; then: Node; else: Node };

const VARIABLE_NAMES = new Set([
  'f', 'p', 'k', 'b', 'c', 'z',
  'position', 'totalPlayers', 'knockouts', 'buyIn', 'totalCost', 'prizepool',
]);

/** Recursive descent. Precedence, low to high: ternary, ||, &&, equality,
 *  comparison, additive, multiplicative, unary, primary. */
class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) { this.tokens = tokens; }

  private peek(): Token { return this.tokens[this.pos]; }
  private next(): Token { return this.tokens[this.pos++]; }
  private expect(type: TokenType, what: string): Token {
    const t = this.next();
    if (t.type !== type) throw new Error(`Expected ${what}, got '${t.value || 'end of formula'}'`);
    return t;
  }
  private atOp(...ops: string[]): boolean {
    const t = this.peek();
    return t.type === 'op' && ops.includes(t.value);
  }

  parseFormula(): Node {
    const node = this.ternary();
    if (this.peek().type !== 'eof') {
      throw new Error(`Unexpected '${this.peek().value}'`);
    }
    return node;
  }

  private ternary(): Node {
    const test = this.or();
    if (this.peek().type === 'question') {
      this.next();
      const then = this.ternary(); // right-associative: chains nest naturally
      this.expect('colon', "':'");
      const els = this.ternary();
      return { kind: 'ternary', test, then, else: els };
    }
    return test;
  }

  private or(): Node {
    let left = this.and();
    while (this.atOp('||')) { this.next(); left = { kind: 'binary', op: '||', left, right: this.and() }; }
    return left;
  }

  private and(): Node {
    let left = this.equality();
    while (this.atOp('&&')) { this.next(); left = { kind: 'binary', op: '&&', left, right: this.equality() }; }
    return left;
  }

  private equality(): Node {
    let left = this.comparison();
    while (this.atOp('==', '===', '!=', '!==')) {
      const op = this.next().value;
      left = { kind: 'binary', op, left, right: this.comparison() };
    }
    return left;
  }

  private comparison(): Node {
    let left = this.additive();
    while (this.atOp('<', '<=', '>', '>=')) {
      const op = this.next().value;
      left = { kind: 'binary', op, left, right: this.additive() };
    }
    return left;
  }

  private additive(): Node {
    let left = this.multiplicative();
    while (this.atOp('+', '-')) {
      const op = this.next().value;
      left = { kind: 'binary', op, left, right: this.multiplicative() };
    }
    return left;
  }

  private multiplicative(): Node {
    let left = this.unary();
    while (this.atOp('*', '/', '%')) {
      const op = this.next().value;
      left = { kind: 'binary', op, left, right: this.unary() };
    }
    return left;
  }

  private unary(): Node {
    if (this.atOp('-', '+', '!')) {
      const op = this.next().value;
      return { kind: 'unary', op, arg: this.unary() };
    }
    return this.primary();
  }

  private primary(): Node {
    const t = this.peek();

    if (t.type === 'number') {
      this.next();
      return { kind: 'num', value: Number(t.value) };
    }

    if (t.type === 'lparen') {
      this.next();
      const inner = this.ternary();
      this.expect('rparen', "')'");
      return inner;
    }

    if (t.type === 'ident') {
      this.next();
      if (t.value === 'Math') {
        this.expect('dot', "'.' after Math");
        const member = this.expect('ident', 'a Math member name').value;
        if (this.peek().type === 'lparen') {
          this.next();
          const args: Node[] = [];
          if (this.peek().type !== 'rparen') {
            args.push(this.ternary());
            while (this.peek().type === 'comma') { this.next(); args.push(this.ternary()); }
          }
          this.expect('rparen', "')'");
          if (!(member in MATH_FUNCTIONS)) throw new Error(`Math.${member} is not available`);
          return { kind: 'call', name: member, args };
        }
        if (!(member in MATH_CONSTANTS)) throw new Error(`Math.${member} is not available`);
        return { kind: 'const', name: member };
      }
      if (!VARIABLE_NAMES.has(t.value)) throw new Error(`'${t.value}' is not a known variable`);
      return { kind: 'var', name: t.value };
    }

    throw new Error(`Unexpected '${t.value || 'end of formula'}'`);
  }
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

function evaluate(node: Node, scope: Record<string, number>): number {
  switch (node.kind) {
    case 'num': return node.value;
    case 'var': return scope[node.name];
    case 'const': return MATH_CONSTANTS[node.name];
    case 'call': return MATH_FUNCTIONS[node.name](...node.args.map(a => evaluate(a, scope)));
    case 'unary': {
      const v = evaluate(node.arg, scope);
      if (node.op === '-') return -v;
      if (node.op === '+') return +v;
      return v ? 0 : 1; // '!'
    }
    case 'ternary':
      return evaluate(node.test, scope) ? evaluate(node.then, scope) : evaluate(node.else, scope);
    case 'binary': {
      const l = evaluate(node.left, scope);
      // Short-circuit && / || the way JS does, before evaluating the right side.
      if (node.op === '&&') return l ? evaluate(node.right, scope) : l;
      if (node.op === '||') return l ? l : evaluate(node.right, scope);
      const r = evaluate(node.right, scope);
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return l / r;
        case '%': return l % r;
        case '==': case '===': return l === r ? 1 : 0;
        case '!=': case '!==': return l !== r ? 1 : 0;
        case '<': return l < r ? 1 : 0;
        case '<=': return l <= r ? 1 : 0;
        case '>': return l > r ? 1 : 0;
        case '>=': return l >= r ? 1 : 0;
        default: throw new Error(`Unknown operator '${node.op}'`);
      }
    }
  }
}

// One-entry memo: `calculatePoints` runs per player per render with no
// memoisation of its own, so re-parsing an unchanged formula string on every
// call is pure waste. Overwritten whenever the formula string changes.
let lastFormula: string | null = null;
let lastNode: Node | null = null;
let lastParseError: string | null = null;

function parseCached(formula: string): { node: Node } | { error: string } {
  if (formula === lastFormula) {
    return lastParseError !== null ? { error: lastParseError } : { node: lastNode as Node };
  }
  lastFormula = formula;
  try {
    lastNode = new Parser(tokenise(formula)).parseFormula();
    lastParseError = null;
    return { node: lastNode };
  } catch (err: any) {
    lastNode = null;
    lastParseError = err?.message || 'Invalid formula';
    return { error: lastParseError };
  }
}

/**
 * Evaluate a custom points formula. Both the short names (`f p k b c z`) and
 * the long ones bind to the same six values, matching what the removed
 * `new Function` call bound, so no stored formula's MEANING changes.
 *
 * Never throws. A formula that fails to parse, names an unknown identifier,
 * or evaluates to a non-finite number (division by zero, same guard the
 * caller used to apply after the fact) returns `{ ok: false }` rather than
 * an exception — the caller's existing "log and score 0" behaviour carries
 * over unchanged.
 */
export function evaluateFormula(formula: string, vars: FormulaVariables): FormulaEvaluation {
  const parsed = parseCached(formula);
  if ('error' in parsed) return { ok: false, error: parsed.error };

  const scope: Record<string, number> = {
    f: vars.position, p: vars.totalPlayers, k: vars.knockouts,
    b: vars.buyIn, c: vars.totalCost, z: vars.prizepool,
    position: vars.position, totalPlayers: vars.totalPlayers, knockouts: vars.knockouts,
    buyIn: vars.buyIn, totalCost: vars.totalCost, prizepool: vars.prizepool,
  };

  try {
    const value = evaluate(parsed.node, scope);
    // isFinite, not just isNaN: a formula dividing by a variable that is zero
    // yields Infinity, which is not NaN and would have been floored and shown
    // as "Infinity" points.
    if (!Number.isFinite(value)) return { ok: false, error: 'Formula did not produce a finite number' };
    return { ok: true, value };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Could not evaluate formula' };
  }
}
