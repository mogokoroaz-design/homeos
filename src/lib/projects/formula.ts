// Safe arithmetic evaluator for project FORMULA fields. No eval / Function — a tiny
// tokenizer + recursive-descent parser supporting numbers, field keys, + - * / % ( ),
// and the functions min, max, round, abs.

type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i; while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const v = Number(src.slice(i, j));
      if (!Number.isFinite(v)) throw new Error(`Bad number at ${i}`);
      out.push({ t: "num", v }); i = j; continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i; while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
      out.push({ t: "id", v: src.slice(i, j) }); i = j; continue;
    }
    if ("+-*/%(),".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    throw new Error(`Unexpected character "${c}"`);
  }
  return out;
}

const FUNCS: Record<string, (...a: number[]) => number> = {
  min: (...a) => Math.min(...a), max: (...a) => Math.max(...a), round: (a, d = 0) => Math.round(a * 10 ** d) / 10 ** d, abs: (a) => Math.abs(a),
};

export function evaluateFormula(expression: string, vars: Record<string, number | null | undefined>): number | null {
  const toks = tokenize(expression);
  let p = 0;
  let missing = false;
  const peek = () => toks[p];
  const eat = (v?: string) => {
    const tk = toks[p++];
    if (!tk || (v && !(tk.t === "op" && tk.v === v))) throw new Error(`Expected ${v ?? "token"}`);
    return tk;
  };
  const primary = (): number => {
    const tk = peek();
    if (!tk) throw new Error("Unexpected end");
    if (tk.t === "num") { p++; return tk.v; }
    if (tk.t === "op" && tk.v === "(") { p++; const v = expr(); eat(")"); return v; }
    if (tk.t === "op" && tk.v === "-") { p++; return -primary(); }
    if (tk.t === "id") {
      p++;
      if (peek()?.t === "op" && peek()!.v === "(") {
        const fn = Object.hasOwn(FUNCS, tk.v) ? FUNCS[tk.v] : undefined;
        if (!fn) throw new Error(`Unknown function ${tk.v}`);
        p++;
        const args: number[] = [];
        if (!(peek()?.t === "op" && peek()!.v === ")")) {
          args.push(expr());
          while (peek()?.t === "op" && peek()!.v === ",") { p++; args.push(expr()); }
        }
        eat(")");
        return fn(...args);
      }
      if (!Object.hasOwn(vars, tk.v)) throw new Error(`Unknown field "${tk.v}"`);
      const v = vars[tk.v];
      if (v === null || v === undefined || !Number.isFinite(v)) { missing = true; return 0; }
      return v;
    }
    throw new Error(`Unexpected "${tk.v}"`);
  };
  const term = (): number => {
    let v = primary();
    while (peek()?.t === "op" && "*/%".includes(peek()!.v as string)) {
      const op = (eat() as { v: string }).v;
      const r = primary();
      v = op === "*" ? v * r : op === "/" ? (r === 0 ? NaN : v / r) : v % r;
    }
    return v;
  };
  const expr = (): number => {
    let v = term();
    while (peek()?.t === "op" && "+-".includes(peek()!.v as string)) {
      const op = (eat() as { v: string }).v;
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  const result = expr();
  if (p !== toks.length) throw new Error("Unexpected trailing input");
  if (missing || !Number.isFinite(result)) return null;
  return Math.round(result * 1e6) / 1e6;
}

export function validateFormula(expression: string, fieldKeys: string[]) {
  try {
    evaluateFormula(expression, Object.fromEntries(fieldKeys.map((k) => [k, 1])));
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Invalid formula";
  }
}
