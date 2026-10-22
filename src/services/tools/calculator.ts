// ARPA — safe calculator tool (no eval). Recursive-descent parser for arithmetic + finance functions.
//   numbers, + - * / % ^, parentheses, unary minus, constants pi / e
//   math   : sqrt abs round(x,d) floor ceil min max pow log (base 10) ln exp
//   finance: emi(principal, annualRatePct, months)        → monthly instalment
//            npv(ratePct, cf0, cf1, …)                     → cf0 at t=0
//            irr(cf0, cf1, …)                              → % per period
//            cagr(start, end, years)                       → %
//            fv(ratePct, periods, presentValue)            → future value of a lump sum
//            pv(ratePct, periods, futureValue)             → present value of a lump sum
//            avg(a, b, …), sum(a, b, …)
import { z } from "zod";
import type { Tool } from "./types";

type Fn = (...a: number[]) => number;

function irr(cfs: number[]): number {
  if (cfs.length < 2 || !cfs.some((c) => c < 0) || !cfs.some((c) => c > 0)) throw new Error("irr needs both negative and positive cash flows");
  const npvAt = (r: number) => cfs.reduce((s, c, t) => s + c / Math.pow(1 + r, t), 0);
  // Newton first, bisection fallback
  let r = 0.1;
  for (let i = 0; i < 100; i++) {
    const f = npvAt(r);
    const d = cfs.reduce((s, c, t) => s - (t * c) / Math.pow(1 + r, t + 1), 0);
    if (!Number.isFinite(f) || !Number.isFinite(d) || d === 0) break;
    const nr = r - f / d;
    if (Math.abs(nr - r) < 1e-10 && nr > -0.9999) return nr * 100;
    r = nr;
    if (r <= -0.9999 || r > 1e6) break;
  }
  let lo = -0.9999, hi = 10;
  if (npvAt(lo) * npvAt(hi) > 0) throw new Error("irr not found in range -99.99% … 1000%");
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    if (npvAt(lo) * npvAt(mid) <= 0) hi = mid; else lo = mid;
  }
  return ((lo + hi) / 2) * 100;
}

const FNS: Record<string, Fn> = {
  sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, exp: Math.exp,
  ln: Math.log, log: Math.log10, pow: Math.pow,
  min: (...a) => Math.min(...a), max: (...a) => Math.max(...a),
  sum: (...a) => a.reduce((s, x) => s + x, 0),
  avg: (...a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN),
  round: (x, d = 0) => { const f = Math.pow(10, d); return Math.round(x * f) / f; },
  emi: (p, ratePct, n) => {
    const r = ratePct / 1200;
    if (!(n > 0)) throw new Error("emi months must be > 0");
    return r === 0 ? p / n : (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  },
  npv: (ratePct, ...cfs) => cfs.reduce((s, c, t) => s + c / Math.pow(1 + ratePct / 100, t), 0),
  irr: (...cfs) => irr(cfs),
  cagr: (start, end, years) => {
    if (!(start > 0) || !(years > 0)) throw new Error("cagr needs start > 0 and years > 0");
    return (Math.pow(end / start, 1 / years) - 1) * 100;
  },
  fv: (ratePct, n, pv) => pv * Math.pow(1 + ratePct / 100, n),
  pv: (ratePct, n, fv) => fv / Math.pow(1 + ratePct / 100, n),
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

/** Evaluate an expression. Throws Error with a readable message on bad input. */
export function evaluate(expr: string): number {
  const src = expr.replace(/[₹$]/g, "").replace(/×/g, "*").replace(/÷/g, "/");
  if (src.length > 2000) throw new Error("expression too long");
  let i = 0;
  const peek = () => { while (src[i] === " " || src[i] === "\t" || src[i] === "\n") i++; return src[i]; };
  const eat = (c: string) => { if (peek() !== c) throw new Error(`expected "${c}" at position ${i + 1}`); i++; };

  function primary(): number {
    const c = peek();
    if (c === "(") { i++; const v = add(); eat(")"); return v; }
    if (c === "-") { i++; return -power(); }
    if (c === "+") { i++; return power(); }
    const num = /^(\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(src.slice(i));
    if (num) { i += num[0].length; return Number(num[0]); }
    const id = /^[a-z_][a-z0-9_]*/i.exec(src.slice(i));
    if (id) {
      const name = id[0].toLowerCase();
      i += id[0].length;
      if (peek() === "(") {
        const fn = FNS[name];
        if (!fn) throw new Error(`unknown function "${name}"`);
        i++;
        const args: number[] = [];
        if (peek() !== ")") { args.push(add()); while (peek() === ",") { i++; args.push(add()); } }
        eat(")");
        return fn(...args);
      }
      if (name in CONSTS) return CONSTS[name];
      throw new Error(`unknown name "${name}"`);
    }
    throw new Error(c === undefined ? "unexpected end of expression" : `unexpected "${c}" at position ${i + 1}`);
  }
  function postfix(): number {
    let v = primary();
    while (peek() === "%" && !/^\s*[\d(a-z.]/i.test(src.slice(i + 1))) { i++; v = v / 100; } // "18%" → 0.18 (but "a % b" is modulo)
    return v;
  }
  function power(): number {
    const base = postfix();
    if (peek() === "^" || src.slice(i, i + 2) === "**") { i += src[i] === "^" ? 1 : 2; return Math.pow(base, unary()); }
    return base;
  }
  function unary(): number {
    if (peek() === "-") { i++; return -unary(); }
    if (peek() === "+") { i++; return unary(); }
    return power();
  }
  function mul(): number {
    let v = unary();
    for (;;) {
      const c = peek();
      if (c === "*" && src[i + 1] !== "*") { i++; v *= unary(); }
      else if (c === "/") { i++; v /= unary(); }
      else if (c === "%") { i++; v %= unary(); }
      else return v;
    }
  }
  function add(): number {
    let v = mul();
    for (;;) {
      const c = peek();
      if (c === "+") { i++; v += mul(); }
      else if (c === "-") { i++; v -= mul(); }
      else return v;
    }
  }
  const v = add();
  if (peek() !== undefined) throw new Error(`unexpected "${src[i]}" at position ${i + 1}`);
  if (!Number.isFinite(v)) throw new Error("result is not a finite number");
  return v;
}

export const fmtNumber = (v: number) =>
  Math.abs(v) >= 1e15 || (Math.abs(v) < 1e-6 && v !== 0) ? v.toExponential(6) : String(Math.round(v * 1e6) / 1e6);

export const calculatorInput = z.object({ expression: z.string().trim().min(1).max(2000) });

export const calculatorTool: Tool<typeof calculatorInput, { expression: string; result: string }> = {
  name: "calculator",
  description:
    "Exact arithmetic and finance maths. Use for every non-trivial calculation. Write plain numbers (no commas/units; 45 lakh = 4500000). " +
    "Functions: sqrt abs round(x,d) min max pow log ln exp sum avg, emi(principal, annualRatePct, months), npv(ratePct, cf0, cf1, …), " +
    "irr(cf0, cf1, …) → %, cagr(start, end, years) → %, fv(ratePct, n, pv), pv(ratePct, n, fv). Example: emi(4500000, 9.5, 84)",
  inputSchema: calculatorInput,
  permissions: ["compute"],
  available: () => true,
  async execute(input) {
    return { expression: input.expression, result: fmtNumber(evaluate(input.expression)) };
  },
};
