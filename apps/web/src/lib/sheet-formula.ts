// Nexora Sheets formula engine — proprietary, dependency-free.
// Evaluates Excel-style formulas (=A1+SUM(B1:B3)) over a flat cell map keyed "A1", "B2", ...

export type FormulaError = { error: "#DIV/0!" | "#NAME?" | "#VALUE!" | "#REF!" | "#N/A" | "#NUM!" | "#CYCLE!" | "#ERROR!" };
export type Scalar = number | string | boolean | null | FormulaError;
type Value = Scalar | Scalar[][];
export type SheetFunction = (args: Scalar[]) => Scalar;

const err = (code: FormulaError["error"]): FormulaError => ({ error: code });
export const isError = (value: unknown): value is FormulaError => typeof value === "object" && value !== null && "error" in value;

export function columnIndex(letters: string) {
  let index = 0;
  for (const char of letters.toUpperCase()) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

export function columnName(index: number) {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

export function parseCellKey(key: string): { row: number; col: number } | null {
  const match = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(key);
  if (!match) return null;
  return { col: columnIndex(match[1]!), row: Number.parseInt(match[2]!, 10) - 1 };
}

// ---------- Tokenizer ----------

type Token =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "bool"; v: boolean }
  | { t: "ref"; v: string }
  | { t: "range"; from: string; to: string }
  | { t: "fn"; v: string }
  | { t: "op"; v: string }
  | { t: "(" }
  | { t: ")" }
  | { t: "," };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === '"') {
      let value = "";
      i += 1;
      while (i < src.length) {
        if (src[i] === '"' && src[i + 1] === '"') { value += '"'; i += 2; continue; }
        if (src[i] === '"') break;
        value += src[i];
        i += 1;
      }
      if (src[i] !== '"') throw new SyntaxError("Unterminated string");
      i += 1;
      tokens.push({ t: "str", v: value });
      continue;
    }
    const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
    if (num) { tokens.push({ t: "num", v: Number(num[0]) }); i += num[0].length; continue; }
    const range = /^(\$?[A-Za-z]{1,3}\$?\d+):(\$?[A-Za-z]{1,3}\$?\d+)/.exec(src.slice(i));
    if (range) { tokens.push({ t: "range", from: range[1]!, to: range[2]! }); i += range[0].length; continue; }
    const word = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(src.slice(i));
    if (word) {
      const text = word[0];
      i += text.length;
      const rest = src.slice(i).trimStart();
      if (rest.startsWith("(")) tokens.push({ t: "fn", v: text.toUpperCase() });
      else if (/^(TRUE|FALSE)$/i.test(text)) tokens.push({ t: "bool", v: text.toUpperCase() === "TRUE" });
      else if (/^\$?[A-Za-z]{1,3}\$?\d+$/.test(text)) tokens.push({ t: "ref", v: text });
      else throw new ReferenceError(text);
      continue;
    }
    if (ch === "$") {
      const ref = /^\$?[A-Za-z]{1,3}\$?\d+/.exec(src.slice(i));
      if (ref) {
        const r2 = /^:(\$?[A-Za-z]{1,3}\$?\d+)/.exec(src.slice(i + ref[0].length));
        if (r2) { tokens.push({ t: "range", from: ref[0], to: r2[1]! }); i += ref[0].length + r2[0].length; }
        else { tokens.push({ t: "ref", v: ref[0] }); i += ref[0].length; }
        continue;
      }
    }
    const two = src.slice(i, i + 2);
    if (two === "<=" || two === ">=" || two === "<>") { tokens.push({ t: "op", v: two }); i += 2; continue; }
    if ("+-*/^&=<>%".includes(ch)) { tokens.push({ t: "op", v: ch }); i += 1; continue; }
    if (ch === "(") { tokens.push({ t: "(" }); i += 1; continue; }
    if (ch === ")") { tokens.push({ t: ")" }); i += 1; continue; }
    if (ch === "," || ch === ";") { tokens.push({ t: "," }); i += 1; continue; }
    throw new SyntaxError(`Unexpected ${ch}`);
  }
  return tokens;
}

// ---------- Parser (precedence climbing) ----------

type Node =
  | { k: "lit"; v: Scalar }
  | { k: "ref"; v: string }
  | { k: "range"; from: string; to: string }
  | { k: "call"; name: string; args: Node[] }
  | { k: "unary"; op: string; arg: Node }
  | { k: "percent"; arg: Node }
  | { k: "bin"; op: string; l: Node; r: Node };

const PRECEDENCE: Record<string, number> = { "=": 1, "<>": 1, "<": 1, ">": 1, "<=": 1, ">=": 1, "&": 2, "+": 3, "-": 3, "*": 4, "/": 4, "^": 5 };

function parse(tokens: Token[]): Node {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function primary(): Node {
    const token = next();
    if (!token) throw new SyntaxError("Unexpected end");
    switch (token.t) {
      case "num": return { k: "lit", v: token.v };
      case "str": return { k: "lit", v: token.v };
      case "bool": return { k: "lit", v: token.v };
      case "ref": return { k: "ref", v: token.v };
      case "range": return { k: "range", from: token.from, to: token.to };
      case "op":
        if (token.v === "-" || token.v === "+") return { k: "unary", op: token.v, arg: unaryOperand() };
        throw new SyntaxError(`Unexpected ${token.v}`);
      case "(": {
        const inner = expression(0);
        if (next()?.t !== ")") throw new SyntaxError("Missing )");
        return inner;
      }
      case "fn": {
        if (next()?.t !== "(") throw new SyntaxError("Missing (");
        const args: Node[] = [];
        if (peek()?.t === ")") { next(); return { k: "call", name: token.v, args }; }
        for (;;) {
          args.push(peek()?.t === "," || peek()?.t === ")" ? { k: "lit", v: null } : expression(0));
          const sep = next();
          if (sep?.t === ")") break;
          if (sep?.t !== ",") throw new SyntaxError("Expected , or )");
        }
        return { k: "call", name: token.v, args };
      }
      default: throw new SyntaxError("Unexpected token");
    }
  }

  // Unary minus binds tighter than binary ops except ^ (Excel: -2^2 = 4)
  function unaryOperand(): Node {
    let node = primary();
    while (peek()?.t === "op" && (peek() as { v: string }).v === "%") { next(); node = { k: "percent", arg: node }; }
    return node;
  }

  function expression(minPrec: number): Node {
    let left = unaryOperand();
    for (;;) {
      const token = peek();
      if (token?.t !== "op") break;
      const prec = PRECEDENCE[token.v];
      if (prec === undefined || prec < minPrec) break;
      next();
      // All operators are left-associative in Excel, including ^ (2^3^2 = 64)
      const right = expression(prec + 1);
      left = { k: "bin", op: token.v, l: left, r: right };
    }
    return left;
  }

  const tree = expression(0);
  if (pos < tokens.length) throw new SyntaxError("Unexpected trailing input");
  return tree;
}

// ---------- Coercion helpers ----------

function toNumber(value: Scalar): number | FormulaError {
  if (isError(value)) return value;
  if (value === null || value === "") return 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value;
  const n = Number(value.trim());
  return value.trim() !== "" && Number.isFinite(n) ? n : err("#VALUE!");
}

function toText(value: Scalar): string | FormulaError {
  if (isError(value)) return value;
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return formatNumber(value);
  return value;
}

function toBool(value: Scalar): boolean | FormulaError {
  if (isError(value)) return value;
  if (typeof value === "boolean") return value;
  if (value === null || value === "") return false;
  if (typeof value === "number") return value !== 0;
  const upper = value.toUpperCase();
  if (upper === "TRUE") return true;
  if (upper === "FALSE") return false;
  return err("#VALUE!");
}

function formatNumber(value: number) {
  return String(Number(value.toPrecision(15)));
}

function flatten(values: Value[]): Scalar[] {
  const out: Scalar[] = [];
  for (const v of values) {
    if (Array.isArray(v)) for (const row of v) out.push(...row);
    else out.push(v);
  }
  return out;
}

function compare(a: Scalar, b: Scalar): number {
  const na = typeof a === "number" || a === null ? (a ?? 0) : null;
  const nb = typeof b === "number" || b === null ? (b ?? 0) : null;
  if (na !== null && nb !== null) return na - nb;
  if (typeof a === "boolean" || typeof b === "boolean") return Number(a) - Number(b);
  const sa = String(a ?? "").toLowerCase();
  const sb = String(b ?? "").toLowerCase();
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function matchesCriteria(value: Scalar, criteria: Scalar): boolean {
  if (typeof criteria === "number") return typeof value === "number" ? value === criteria : toNumber(value) === criteria;
  const text = String(criteria ?? "");
  const m = /^(<=|>=|<>|<|>|=)?(.*)$/.exec(text)!;
  const op = m[1] ?? "=";
  const operand = m[2]!;
  const numeric = operand.trim() !== "" && Number.isFinite(Number(operand)) ? Number(operand) : null;
  let cmp: number;
  if (numeric !== null) {
    const n = toNumber(value);
    if (isError(n) || value === null || value === "") return op === "<>";
    cmp = n - numeric;
  } else {
    cmp = compare(toText(value) as string, operand);
  }
  switch (op) {
    case "<": return cmp < 0;
    case ">": return cmp > 0;
    case "<=": return cmp <= 0;
    case ">=": return cmp >= 0;
    case "<>": return cmp !== 0;
    default: return cmp === 0;
  }
}

function numbersOf(values: Value[]): number[] | FormulaError {
  const out: number[] = [];
  for (const v of values) {
    if (Array.isArray(v)) {
      // In ranges only real numbers count (text/blank ignored), like Excel
      for (const row of v) for (const cell of row) {
        if (isError(cell)) return cell;
        if (typeof cell === "number") out.push(cell);
      }
    } else {
      const n = toNumber(v);
      if (isError(n)) return n;
      out.push(n);
    }
  }
  return out;
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const serialDate = (date: Date) => (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - EXCEL_EPOCH) / 86_400_000;

// ---------- Built-in functions ----------

type Builtin = (args: Value[], raw: Node[]) => Value;

const numeric = (fn: (...n: number[]) => number | FormulaError) => (args: Value[]): Scalar => {
  const ns: number[] = [];
  for (const a of args) {
    const n = toNumber(Array.isArray(a) ? a[0]?.[0] ?? null : a);
    if (isError(n)) return n;
    ns.push(n);
  }
  const result = fn(...ns);
  return typeof result === "number" && !Number.isFinite(result) ? err("#NUM!") : result;
};

const aggregate = (fn: (ns: number[]) => number | FormulaError) => (args: Value[]): Scalar => {
  const ns = numbersOf(args);
  return isError(ns) ? ns : fn(ns);
};

const text = (fn: (s: string, ...rest: number[]) => Scalar) => (args: Value[]): Scalar => {
  const s = toText(Array.isArray(args[0]) ? args[0][0]?.[0] ?? null : args[0] ?? null);
  if (isError(s)) return s;
  const rest: number[] = [];
  for (const a of args.slice(1)) {
    const n = toNumber(Array.isArray(a) ? a[0]?.[0] ?? null : a);
    if (isError(n)) return n;
    rest.push(n);
  }
  return fn(s, ...rest);
};

const scalarArg = (value: Value | undefined): Scalar => (Array.isArray(value) ? value[0]?.[0] ?? null : value ?? null);

const roundTo = (mode: "round" | "up" | "down") => numeric((n, digits = 0) => {
  const f = 10 ** Math.trunc(digits);
  const scaled = n * f;
  const r = mode === "round" ? Math.sign(scaled) * Math.round(Math.abs(scaled) + 1e-9) : mode === "up" ? Math.sign(scaled) * Math.ceil(Math.abs(scaled) - 1e-9) : Math.trunc(scaled + Math.sign(scaled) * 1e-9);
  return r / f;
});

const conditional = (kind: "sum" | "count" | "average") => (args: Value[]): Scalar => {
  const range = args[0];
  const criteria = scalarArg(args[1]);
  if (!Array.isArray(range)) return err("#VALUE!");
  const target = kind !== "count" && Array.isArray(args[2]) ? args[2] : range;
  let total = 0;
  let count = 0;
  range.forEach((row, r) => row.forEach((cell, c) => {
    if (!matchesCriteria(cell, criteria)) return;
    const v = target[r]?.[c] ?? null;
    if (kind === "count") { count += 1; return; }
    if (typeof v === "number") { total += v; count += 1; }
  }));
  if (kind === "count") return count;
  if (kind === "sum") return total;
  return count === 0 ? err("#DIV/0!") : total / count;
};

const BUILTINS: Record<string, Builtin> = {
  SUM: aggregate((ns) => ns.reduce((a, b) => a + b, 0)),
  PRODUCT: aggregate((ns) => ns.reduce((a, b) => a * b, 1)),
  AVERAGE: aggregate((ns) => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : err("#DIV/0!"))),
  MIN: aggregate((ns) => (ns.length ? Math.min(...ns) : 0)),
  MAX: aggregate((ns) => (ns.length ? Math.max(...ns) : 0)),
  MEDIAN: aggregate((ns) => {
    if (!ns.length) return err("#NUM!");
    const s = [...ns].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  }),
  COUNT: (args) => flatten(args).filter((v) => typeof v === "number").length,
  COUNTA: (args) => flatten(args).filter((v) => v !== null && v !== "").length,
  COUNTBLANK: (args) => flatten(args).filter((v) => v === null || v === "").length,
  SUMIF: conditional("sum"),
  COUNTIF: conditional("count"),
  AVERAGEIF: conditional("average"),
  ABS: numeric((n) => Math.abs(n)),
  SQRT: numeric((n) => (n < 0 ? err("#NUM!") : Math.sqrt(n))),
  POWER: numeric((a, b) => a ** b),
  MOD: numeric((a, b) => (b === 0 ? err("#DIV/0!") : a - b * Math.floor(a / b))),
  INT: numeric((n) => Math.floor(n)),
  ROUND: roundTo("round"),
  ROUNDUP: roundTo("up"),
  ROUNDDOWN: roundTo("down"),
  PI: () => Math.PI,
  AND: (args) => {
    for (const v of flatten(args)) { const b = toBool(v); if (isError(b)) return b; if (!b) return false; }
    return true;
  },
  OR: (args) => {
    for (const v of flatten(args)) { const b = toBool(v); if (isError(b)) return b; if (b) return true; }
    return false;
  },
  NOT: (args) => { const b = toBool(scalarArg(args[0])); return isError(b) ? b : !b; },
  CONCAT: (args) => {
    let out = "";
    for (const v of flatten(args)) { const s = toText(v); if (isError(s)) return s; out += s; }
    return out;
  },
  LEN: text((s) => s.length),
  UPPER: text((s) => s.toUpperCase()),
  LOWER: text((s) => s.toLowerCase()),
  TRIM: text((s) => s.trim().replace(/\s+/g, " ")),
  LEFT: text((s, n = 1) => s.slice(0, Math.max(0, n))),
  RIGHT: text((s, n = 1) => (n <= 0 ? "" : s.slice(-n))),
  MID: text((s, start = 1, n = 0) => (start < 1 ? err("#VALUE!") : s.substr(start - 1, Math.max(0, n)))),
  TODAY: () => serialDate(new Date()),
  NOW: () => {
    const now = new Date();
    return serialDate(now) + (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86_400;
  },
  ISBLANK: (args) => { const v = scalarArg(args[0]); return v === null || v === ""; },
  ISNUMBER: (args) => typeof scalarArg(args[0]) === "number",
  ISTEXT: (args) => { const v = scalarArg(args[0]); return typeof v === "string" && v !== ""; },
  ISERROR: (args) => isError(scalarArg(args[0])),
  VLOOKUP: (args) => lookup(args, "v"),
  HLOOKUP: (args) => lookup(args, "h")
};
BUILTINS.CONCATENATE = BUILTINS.CONCAT!;

function lookup(args: Value[], dir: "v" | "h"): Scalar {
  const key = scalarArg(args[0]);
  const table = args[1];
  const index = toNumber(scalarArg(args[2]));
  const approx = args[3] === undefined ? true : toBool(scalarArg(args[3]));
  if (!Array.isArray(table) || isError(index) || isError(approx) || isError(key)) return err("#VALUE!");
  const lines = dir === "v" ? table : (table[0] ?? []).map((_, c) => table.map((row) => row[c] ?? null));
  if (index < 1 || index > (lines[0]?.length ?? 0)) return err("#REF!");
  let found = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const cell = lines[i]![0] ?? null;
    const cmp = compare(cell, key);
    if (cmp === 0) { found = i; break; }
    if (approx && cmp < 0) found = i;
    if (approx && cmp > 0) break;
  }
  return found < 0 ? err("#N/A") : lines[found]![index - 1] ?? null;
}

// ---------- Evaluator ----------

export const SUPPORTED_FUNCTIONS = [...Object.keys(BUILTINS), "IF", "IFERROR"].sort();

export function evaluateSheet(cells: Record<string, string>, functions: Record<string, SheetFunction> = {}): Record<string, Scalar> {
  const results = new Map<string, Scalar>();
  const inProgress = new Set<string>();
  const parsed = new Map<string, Node | FormulaError>();

  function literal(raw: string): Scalar {
    if (raw === "") return null;
    const trimmed = raw.trim();
    if (trimmed !== "" && Number.isFinite(Number(trimmed))) return Number(trimmed);
    if (/^(TRUE|FALSE)$/i.test(trimmed)) return trimmed.toUpperCase() === "TRUE";
    return raw;
  }

  function cellValue(key: string): Scalar {
    const normalized = key.replace(/\$/g, "").toUpperCase();
    const cached = results.get(normalized);
    if (cached !== undefined) return cached;
    const raw = cells[normalized];
    if (raw === undefined) return null;
    if (!raw.startsWith("=")) {
      const value = literal(raw);
      results.set(normalized, value);
      return value;
    }
    if (inProgress.has(normalized)) return err("#CYCLE!");
    inProgress.add(normalized);
    let tree = parsed.get(normalized);
    if (!tree) {
      try { tree = parse(tokenize(raw.slice(1))); } catch (e) { tree = err(e instanceof ReferenceError ? "#NAME?" : "#ERROR!"); }
      parsed.set(normalized, tree);
    }
    let value: Scalar;
    if (isError(tree)) value = tree;
    else {
      const v = evaluate(tree);
      value = Array.isArray(v) ? v[0]?.[0] ?? null : v;
    }
    inProgress.delete(normalized);
    results.set(normalized, value);
    return value;
  }

  function rangeValues(from: string, to: string): Scalar[][] | FormulaError {
    const a = parseCellKey(from);
    const b = parseCellKey(to);
    if (!a || !b) return err("#REF!");
    const rows: Scalar[][] = [];
    for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r += 1) {
      const row: Scalar[] = [];
      for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c += 1) row.push(cellValue(`${columnName(c)}${r + 1}`));
      rows.push(row);
    }
    return rows;
  }

  function evaluate(node: Node): Value {
    switch (node.k) {
      case "lit": return node.v;
      case "ref": return cellValue(node.v);
      case "range": return rangeValues(node.from, node.to);
      case "unary": {
        const n = toNumber(scalarArg(evaluate(node.arg)));
        return isError(n) ? n : node.op === "-" ? -n : n;
      }
      case "percent": {
        const n = toNumber(scalarArg(evaluate(node.arg)));
        return isError(n) ? n : n / 100;
      }
      case "bin": return binary(node.op, scalarArg(evaluate(node.l)), scalarArg(evaluate(node.r)));
      case "call": return call(node);
    }
  }

  function binary(op: string, l: Scalar, r: Scalar): Scalar {
    if (isError(l)) return l;
    if (isError(r)) return r;
    if (op === "&") return `${toText(l) as string}${toText(r) as string}`;
    if (["=", "<>", "<", ">", "<=", ">="].includes(op)) {
      const cmp = compare(l, r);
      return op === "=" ? cmp === 0 : op === "<>" ? cmp !== 0 : op === "<" ? cmp < 0 : op === ">" ? cmp > 0 : op === "<=" ? cmp <= 0 : cmp >= 0;
    }
    const a = toNumber(l);
    const b = toNumber(r);
    if (isError(a)) return a;
    if (isError(b)) return b;
    switch (op) {
      case "+": return a + b;
      case "-": return a - b;
      case "*": return a * b;
      case "/": return b === 0 ? err("#DIV/0!") : a / b;
      case "^": { const p = a ** b; return Number.isFinite(p) ? p : err("#NUM!"); }
      default: return err("#ERROR!");
    }
  }

  function call(node: Extract<Node, { k: "call" }>): Value {
    // Lazy functions: only evaluate the branch that is needed
    if (node.name === "IF") {
      const cond = toBool(scalarArg(evaluate(node.args[0] ?? { k: "lit", v: false })));
      if (isError(cond)) return cond;
      const branch = cond ? node.args[1] : node.args[2];
      return branch ? evaluate(branch) : cond ? true : false;
    }
    if (node.name === "IFERROR") {
      const v = scalarArg(evaluate(node.args[0] ?? { k: "lit", v: null }));
      return isError(v) ? scalarArg(evaluate(node.args[1] ?? { k: "lit", v: "" })) : v;
    }
    const args = node.args.map(evaluate);
    const custom = functions[node.name];
    if (custom) {
      const scalars = args.map(scalarArg);
      const firstError = scalars.find(isError);
      return firstError ?? custom(scalars);
    }
    const builtin = BUILTINS[node.name];
    if (!builtin) return err("#NAME?");
    for (const a of args) if (isError(a)) return a;
    try { return builtin(args, node.args); } catch { return err("#ERROR!"); }
  }

  const out: Record<string, Scalar> = {};
  for (const key of Object.keys(cells)) out[key] = cellValue(key);
  return out;
}

export function displayValue(value: Scalar): string {
  if (value === null) return "";
  if (isError(value)) return value.error;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return formatNumber(value);
  return value;
}
