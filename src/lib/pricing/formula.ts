/* Tiny safe formula evaluator (US-ST-04): + − × ÷, parentheses, comparisons and
 * MIN / MAX / ROUND / IF only. No eval, no scripting, no external calls. */

type Tok = { t: "num" | "id" | "op" | "lp" | "rp" | "comma"; v: string };

export const ALLOWED_FUNCTIONS = ["MIN", "MAX", "ROUND", "IF"] as const;

export class FormulaError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      out.push({ t: "num", v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ t: "id", v: src.slice(i, j) });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if ([">=", "<=", "==", "!="].includes(two)) {
      out.push({ t: "op", v: two });
      i += 2;
      continue;
    }
    if ("+-*/×÷<>".includes(c)) {
      out.push({ t: "op", v: c === "×" ? "*" : c === "÷" ? "/" : c });
      i++;
      continue;
    }
    if (c === "(") out.push({ t: "lp", v: c });
    else if (c === ")") out.push({ t: "rp", v: c });
    else if (c === ",") out.push({ t: "comma", v: c });
    else throw new FormulaError("FORMULA_SYNTAX", `Unexpected character "${c}" — scripting is not allowed.`);
    i++;
  }
  return out;
}

export type Node =
  | { k: "num"; v: number }
  | { k: "var"; name: string }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "neg"; a: Node }
  | { k: "call"; fn: string; args: Node[] };

export function parse(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const eat = (t?: Tok["t"], v?: string) => {
    const tk = toks[p];
    if (!tk || (t && tk.t !== t) || (v && tk.v !== v)) throw new FormulaError("FORMULA_SYNTAX", `Syntax error near "${tk?.v ?? "end of formula"}".`);
    p++;
    return tk;
  };
  const cmp = (): Node => {
    let a = add();
    const tk = peek();
    if (tk && tk.t === "op" && ["<", ">", "<=", ">=", "==", "!="].includes(tk.v)) {
      p++;
      a = { k: "bin", op: tk.v, a, b: add() };
    }
    return a;
  };
  const add = (): Node => {
    let a = mul();
    while (peek()?.t === "op" && (peek().v === "+" || peek().v === "-")) {
      const op = eat().v;
      a = { k: "bin", op, a, b: mul() };
    }
    return a;
  };
  const mul = (): Node => {
    let a = unary();
    while (peek()?.t === "op" && (peek().v === "*" || peek().v === "/")) {
      const op = eat().v;
      a = { k: "bin", op, a, b: unary() };
    }
    return a;
  };
  const unary = (): Node => {
    if (peek()?.t === "op" && peek().v === "-") {
      p++;
      return { k: "neg", a: unary() };
    }
    return primary();
  };
  const primary = (): Node => {
    const tk = peek();
    if (!tk) throw new FormulaError("FORMULA_SYNTAX", "Formula ends unexpectedly.");
    if (tk.t === "num") {
      p++;
      return { k: "num", v: Number(tk.v) };
    }
    if (tk.t === "lp") {
      p++;
      const e = cmp();
      eat("rp");
      return e;
    }
    if (tk.t === "id") {
      p++;
      if (peek()?.t === "lp") {
        const fn = tk.v.toUpperCase();
        if (!(ALLOWED_FUNCTIONS as readonly string[]).includes(fn))
          throw new FormulaError("FORMULA_FUNCTION_NOT_ALLOWED", `Function ${tk.v} is not allowed. Use MIN, MAX, ROUND or IF.`);
        p++;
        const args: Node[] = [];
        if (peek()?.t !== "rp") {
          args.push(cmp());
          while (peek()?.t === "comma") {
            p++;
            args.push(cmp());
          }
        }
        eat("rp");
        return { k: "call", fn, args };
      }
      return { k: "var", name: tk.v };
    }
    throw new FormulaError("FORMULA_SYNTAX", `Syntax error near "${tk.v}".`);
  };
  const root = cmp();
  if (p < toks.length) throw new FormulaError("FORMULA_SYNTAX", `Unexpected "${toks[p].v}".`);
  return root;
}

export function variablesUsed(n: Node, acc = new Set<string>()): Set<string> {
  if (n.k === "var") acc.add(n.name);
  else if (n.k === "bin") {
    variablesUsed(n.a, acc);
    variablesUsed(n.b, acc);
  } else if (n.k === "neg") variablesUsed(n.a, acc);
  else if (n.k === "call") n.args.forEach((a) => variablesUsed(a, acc));
  return acc;
}

/** Divisors that are not literal constants are a divide-by-zero risk unless guarded with MAX(x, c>0). */
export function divideByZeroRisks(n: Node, out: string[] = []): string[] {
  if (n.k === "bin") {
    if (n.op === "/") {
      const d = n.b;
      const guarded = d.k === "call" && d.fn === "MAX" && d.args.some((a) => a.k === "num" && a.v > 0);
      if (d.k === "num" && d.v === 0) out.push("literal 0");
      else if (d.k !== "num" && !guarded) out.push(toText(d));
    }
    divideByZeroRisks(n.a, out);
    divideByZeroRisks(n.b, out);
  } else if (n.k === "neg") divideByZeroRisks(n.a, out);
  else if (n.k === "call") n.args.forEach((a) => divideByZeroRisks(a, out));
  return out;
}

export function toText(n: Node): string {
  switch (n.k) {
    case "num":
      return String(n.v);
    case "var":
      return n.name;
    case "neg":
      return `-${toText(n.a)}`;
    case "bin":
      return `${toText(n.a)} ${n.op} ${toText(n.b)}`;
    case "call":
      return `${n.fn}(${n.args.map(toText).join(", ")})`;
  }
}

export function evaluate(n: Node, vars: Record<string, number>): number {
  switch (n.k) {
    case "num":
      return n.v;
    case "var":
      if (!(n.name in vars)) throw new FormulaError("FORMULA_UNKNOWN_VARIABLE", `Unknown variable "${n.name}".`);
      return vars[n.name];
    case "neg":
      return -evaluate(n.a, vars);
    case "bin": {
      const a = evaluate(n.a, vars);
      const b = evaluate(n.b, vars);
      switch (n.op) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          if (b === 0) throw new FormulaError("FORMULA_DIVIDE_BY_ZERO", `Division by zero in "${toText(n)}".`);
          return a / b;
        case "<":
          return a < b ? 1 : 0;
        case ">":
          return a > b ? 1 : 0;
        case "<=":
          return a <= b ? 1 : 0;
        case ">=":
          return a >= b ? 1 : 0;
        case "==":
          return a === b ? 1 : 0;
        default:
          return a !== b ? 1 : 0;
      }
    }
    case "call": {
      const args = n.args.map((a) => evaluate(a, vars));
      if (n.fn === "MIN") return Math.min(...args);
      if (n.fn === "MAX") return Math.max(...args);
      if (n.fn === "ROUND") {
        const f = 10 ** (args[1] ?? 0);
        return Math.round(args[0] * f) / f;
      }
      if (args.length !== 3) throw new FormulaError("FORMULA_SYNTAX", "IF needs 3 arguments: IF(condition, then, else).");
      return args[0] ? args[1] : args[2];
    }
  }
}

/** Top-level additive terms, for the test panel's "each intermediate term" view. */
export function topTerms(n: Node): Array<{ sign: "+" | "-"; node: Node }> {
  if (n.k === "bin" && (n.op === "+" || n.op === "-")) {
    const left = topTerms(n.a);
    return [...left, { sign: n.op as "+" | "-", node: n.b }];
  }
  return [{ sign: "+", node: n }];
}

export function applyRounding(v: number, decimals: number, mode: "NEAREST" | "UP" | "DOWN") {
  const f = 10 ** decimals;
  if (mode === "UP") return Math.ceil(v * f - 1e-9) / f;
  if (mode === "DOWN") return Math.floor(v * f + 1e-9) / f;
  return Math.round(v * f) / f;
}
