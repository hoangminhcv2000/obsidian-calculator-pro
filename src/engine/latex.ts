import type { AngleMode } from "../settings";
import type { EvaluationResult } from "./CalculatorEngine";

interface LatexOptions {
  angleMode: AngleMode;
}

interface LatexNode {
  latex: string;
  precedence: number;
}

type TokenType = "number" | "identifier" | "operator" | "leftParen" | "rightParen" | "leftBracket" | "rightBracket" | "comma" | "bar";

interface Token {
  type: TokenType;
  value: string;
}

const BINARY_PRECEDENCE: Record<string, { precedence: number; rightAssociative?: boolean }> = {
  "+": { precedence: 1 },
  "-": { precedence: 1 },
  "*": { precedence: 2 },
  "/": { precedence: 2 },
  "^": { precedence: 4, rightAssociative: true }
};

const FUNCTION_NAMES = new Set([
  "sin", "cos", "tan", "csc", "sec", "cot",
  "asin", "acos", "atan", "arcsin", "arccos", "arctan",
  "sqrt", "nthroot", "root", "abs", "ln", "log", "log10", "exp",
  "mean", "avg", "median", "stdev", "stdevp", "var", "varp", "mad", "min", "max", "sum", "total", "count",
  "cov", "covp", "corr",
  "ncr", "comb", "choose", "npr", "perm",
  "real", "re", "imag", "im", "conj", "arg",
  "round", "floor", "ceil",
  "ctof", "ftoc", "ctok", "ktoc", "ftok", "ktof"
]);

export function formatLatexEquation(expression: string, result: EvaluationResult | null, options: LatexOptions): string {
  const lhs = expressionToLatex(expression, options);
  if (!result) return lhs;
  return `${lhs} = ${displayToLatex(result.display)}`;
}

export function formatObsidianLatexBlock(latex: string): string {
  return `$$\n${latex}\n$$`;
}

export function formatObsidianInlineLatex(latex: string): string {
  return `$${latex}$`;
}

export function expressionToLatex(expression: string, options: LatexOptions): string {
  const normalized = normalizeInput(expression);
  if (!normalized) return "";
  const parser = new LatexParser(tokenize(normalized), options);
  return parser.parse().latex;
}

export function displayToLatex(display: string): string {
  const text = display.trim().replace(/−/gu, "-");
  const fractionMatch = text.match(/^(-?\d+)\/(\d+)$/u);
  if (fractionMatch) return `\\frac{${fractionMatch[1]}}{${fractionMatch[2]}}`;
  if (text === "∞") return "\\infty";
  if (text === "-∞") return "-\\infty";
  return text
    .replace(/\bpi\b/giu, "\\pi")
    .replace(/\btau\b/giu, "\\tau")
    .replace(/\bphi\b/giu, "\\varphi")
    .replace(/\*/gu, "\\cdot ")
    .replace(/-/gu, "-")
    .replace(/\s+/gu, " ");
}

class LatexParser {
  private position = 0;

  constructor(private readonly tokens: Token[], private readonly options: LatexOptions) {}

  parse(): LatexNode {
    if (this.tokens.length === 0) return node("", 99);
    const value = this.parseExpression(0, new Set());
    return value;
  }

  private parseExpression(minPrecedence: number, stops: Set<TokenType>): LatexNode {
    let left = this.parseUnary();

    while (!this.isAtEnd()) {
      const token = this.peek();
      if (!token || stops.has(token.type) || token.type !== "operator") break;
      const info = BINARY_PRECEDENCE[token.value];
      if (!info || info.precedence < minPrecedence) break;
      this.advance();
      const right = this.parseExpression(info.rightAssociative ? info.precedence : info.precedence + 1, stops);
      left = this.formatBinary(token.value, left, right, info.precedence);
    }

    return left;
  }

  private parseUnary(): LatexNode {
    const token = this.peek();
    if (token?.type === "operator" && (token.value === "+" || token.value === "-")) {
      this.advance();
      const operand = this.parseExpression(4, new Set());
      if (token.value === "+") return operand;
      return node(`-${wrapIfNeeded(operand, 4)}`, 4);
    }

    let value = this.parsePrimary();
    while (!this.isAtEnd()) {
      const token = this.peek();
      if (token?.type !== "operator" || (token.value !== "!" && token.value !== "%")) break;
      this.advance();
      value = token.value === "!"
        ? node(`${wrapIfNeeded(value, 5)}!`, 5)
        : node(`${wrapIfNeeded(value, 5)}\\%`, 5);
    }
    return value;
  }

  private parsePrimary(): LatexNode {
    const token = this.advance();
    if (!token) return node("", 99);

    if (token.type === "number") return node(token.value, 99);

    if (token.type === "identifier") return this.parseIdentifier(token.value);

    if (token.type === "leftParen") {
      const inner = this.parseExpression(0, new Set(["rightParen"]));
      this.match("rightParen");
      return node(`\\left(${inner.latex}\\right)`, 99);
    }

    if (token.type === "leftBracket") {
      const items: LatexNode[] = [];
      if (this.match("rightBracket")) return node("\\left[\\right]", 99);
      while (!this.isAtEnd()) {
        items.push(this.parseExpression(0, new Set(["comma", "rightBracket"])));
        if (this.match("comma")) continue;
        this.match("rightBracket");
        break;
      }
      return node(`\\left[${items.map((item) => item.latex).join(", ")}\\right]`, 99);
    }

    if (token.type === "bar") {
      const inner = this.parseExpression(0, new Set(["bar"]));
      this.match("bar");
      return node(`\\left|${inner.latex}\\right|`, 99);
    }

    return node(escapeLatex(token.value), 99);
  }

  private parseIdentifier(identifier: string): LatexNode {
    const name = identifier.toLowerCase();
    if (this.match("leftParen")) {
      const args = this.parseArguments();
      return this.formatFunction(name, args);
    }
    return node(identifierToLatex(name), 99);
  }

  private parseArguments(): LatexNode[] {
    const args: LatexNode[] = [];
    if (this.match("rightParen")) return args;
    while (!this.isAtEnd()) {
      args.push(this.parseExpression(0, new Set(["comma", "rightParen"])));
      if (this.match("comma")) continue;
      this.match("rightParen");
      return args;
    }
    return args;
  }

  private formatBinary(operator: string, left: LatexNode, right: LatexNode, precedence: number): LatexNode {
    if (operator === "/") {
      return node(`\\frac{${left.latex}}{${right.latex}}`, precedence);
    }
    if (operator === "^") {
      return node(`${wrapPowerBase(left)}^{${right.latex}}`, precedence);
    }

    const symbol = operator === "*" ? "\\cdot" : operator;
    const rightMin = operator === "-" ? precedence + 1 : precedence;
    return node(`${wrapIfNeeded(left, precedence)} ${symbol} ${wrapIfNeeded(right, rightMin)}`, precedence);
  }

  private formatFunction(name: string, args: LatexNode[]): LatexNode {
    const first = args[0]?.latex ?? "";
    const second = args[1]?.latex ?? "";

    if (["sin", "cos", "tan", "csc", "sec", "cot"].includes(name)) {
      const arg = this.options.angleMode === "deg" ? appendDegrees(first) : first;
      return node(`\\${name}\\left(${arg}\\right)`, 99);
    }

    const inverseTrig: Record<string, string> = {
      asin: "arcsin", acos: "arccos", atan: "arctan",
      arcsin: "arcsin", arccos: "arccos", arctan: "arctan"
    };
    if (inverseTrig[name]) return node(`\\${inverseTrig[name]}\\left(${first}\\right)`, 99);

    switch (name) {
      case "sqrt": return node(`\\sqrt{${first}}`, 99);
      case "nthroot":
      case "root": return node(`\\sqrt[${second}]{${first}}`, 99);
      case "abs": return node(`\\left|${first}\\right|`, 99);
      case "ln": return node(`\\ln\\left(${first}\\right)`, 99);
      case "log":
      case "log10": return args.length === 2
        ? node(`\\log_{${second}}\\left(${first}\\right)`, 99)
        : node(`\\log\\left(${first}\\right)`, 99);
      case "exp": return node(`e^{${first}}`, 99);
      case "ncr":
      case "comb":
      case "choose": return node(`\\binom{${first}}{${second}}`, 99);
      case "npr":
      case "perm": return node(`{}_{${first}}P_{${second}}`, 99);
      case "real":
      case "re": return node(`\\operatorname{Re}\\left(${first}\\right)`, 99);
      case "imag":
      case "im": return node(`\\operatorname{Im}\\left(${first}\\right)`, 99);
      case "conj": return node(`\\overline{${first}}`, 99);
      case "arg": return node(`\\arg\\left(${first}\\right)`, 99);
      case "ctof": return node(`\\operatorname{C\\to F}\\left(${first}\\right)`, 99);
      case "ftoc": return node(`\\operatorname{F\\to C}\\left(${first}\\right)`, 99);
      case "ctok": return node(`\\operatorname{C\\to K}\\left(${first}\\right)`, 99);
      case "ktoc": return node(`\\operatorname{K\\to C}\\left(${first}\\right)`, 99);
      case "ftok": return node(`\\operatorname{F\\to K}\\left(${first}\\right)`, 99);
      case "ktof": return node(`\\operatorname{K\\to F}\\left(${first}\\right)`, 99);
      default: {
        const fn = FUNCTION_NAMES.has(name) ? `\\operatorname{${escapeLatex(name)}}` : identifierToLatex(name);
        return node(`${fn}\\left(${args.map((arg) => arg.latex).join(", ")}\\right)`, 99);
      }
    }
  }

  private advance(): Token | undefined {
    if (!this.isAtEnd()) this.position += 1;
    return this.tokens[this.position - 1];
  }

  private match(type: TokenType): boolean {
    if (this.peek()?.type === type) {
      this.advance();
      return true;
    }
    return false;
  }

  private peek(): Token | undefined {
    return this.tokens[this.position];
  }

  private isAtEnd(): boolean {
    return this.position >= this.tokens.length;
  }
}

function normalizeInput(input: string): string {
  return input
    .replace(/[−–—]/gu, "-")
    .replace(/×/gu, "*")
    .replace(/÷/gu, "/")
    .replace(/[π𝜋]/gu, "pi")
    .replace(/τ/gu, "tau")
    .replace(/φ/gu, "phi")
    .replace(/√/gu, "sqrt")
    .replace(/²/gu, "^2")
    .replace(/³/gu, "^3")
    .replace(/∞/gu, "infinity")
    .replace(/\s+/gu, "")
    .trim();
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const char = input[i];
    if (isDigit(char) || (char === "." && isDigit(input[i + 1] ?? ""))) {
      const start = i;
      i = readNumber(input, i);
      tokens.push({ type: "number", value: input.slice(start, i) });
      continue;
    }
    if (isIdentifierStart(char)) {
      const start = i;
      i += 1;
      while (i < input.length && isIdentifierPart(input[i])) i += 1;
      tokens.push({ type: "identifier", value: input.slice(start, i) });
      continue;
    }
    if (char === "(") tokens.push({ type: "leftParen", value: char });
    else if (char === ")") tokens.push({ type: "rightParen", value: char });
    else if (char === "[") tokens.push({ type: "leftBracket", value: char });
    else if (char === "]") tokens.push({ type: "rightBracket", value: char });
    else if (char === ",") tokens.push({ type: "comma", value: char });
    else if (char === "|") tokens.push({ type: "bar", value: char });
    else if (["+", "-", "*", "/", "^", "!", "%"].includes(char)) tokens.push({ type: "operator", value: char });
    else tokens.push({ type: "identifier", value: char });
    i += 1;
  }
  return insertImplicitMultiplication(tokens);
}

function readNumber(input: string, start: number): number {
  let i = start;
  while (i < input.length && isDigit(input[i])) i += 1;
  if (input[i] === ".") {
    i += 1;
    while (i < input.length && isDigit(input[i])) i += 1;
  }
  if (input[i]?.toLowerCase() === "e") {
    const exponentStart = i;
    i += 1;
    if (input[i] === "+" || input[i] === "-") i += 1;
    const digitsStart = i;
    while (i < input.length && isDigit(input[i])) i += 1;
    if (digitsStart === i) i = exponentStart;
  }
  return i;
}

function insertImplicitMultiplication(tokens: Token[]): Token[] {
  const output: Token[] = [];
  for (const token of tokens) {
    const previous = output[output.length - 1];
    if (previous && shouldInsertMultiplication(previous, token)) {
      output.push({ type: "operator", value: "*" });
    }
    output.push(token);
  }
  return output;
}

function shouldInsertMultiplication(previous: Token, current: Token): boolean {
  if (!isValueEnd(previous) || !isValueStart(current)) return false;
  if (previous.type === "identifier" && current.type === "leftParen" && FUNCTION_NAMES.has(previous.value.toLowerCase())) return false;
  return true;
}

function isValueEnd(token: Token): boolean {
  return token.type === "number" || token.type === "identifier" || token.type === "rightParen" || (token.type === "operator" && ["!", "%"].includes(token.value));
}

function isValueStart(token: Token): boolean {
  return token.type === "number" || token.type === "identifier" || token.type === "leftParen";
}

function identifierToLatex(name: string): string {
  const constants: Record<string, string> = {
    pi: "\\pi",
    tau: "\\tau",
    e: "e",
    phi: "\\varphi",
    infinity: "\\infty",
    ans: "\\operatorname{Ans}",
    gravity: "g_0",
    avogadro: "N_A",
    boltzmann: "k_B",
    planck: "h"
  };
  if (constants[name]) return constants[name];
  if (isUnit(name)) return `\\mathrm{${escapeLatex(name)}}`;
  if (/^[a-z]$/u.test(name)) return name;
  return `\\mathrm{${escapeLatex(name)}}`;
}

function isUnit(name: string): boolean {
  return new Set([
    "m", "meter", "meters", "km", "kilometer", "kilometers", "cm", "centimeter", "centimeters", "mm", "millimeter", "millimeters",
    "mi", "mile", "miles", "yd", "yard", "yards", "ft", "foot", "feet", "inch", "inches",
    "kg", "kilogram", "kilograms", "g", "gram", "grams", "mg", "milligram", "milligrams", "lb", "pound", "pounds", "oz", "ounce", "ounces",
    "s", "sec", "second", "seconds", "min", "minute", "minutes", "hr", "hour", "hours", "day", "days"
  ]).has(name);
}

function node(latex: string, precedence: number): LatexNode {
  return { latex, precedence };
}

function wrapIfNeeded(value: LatexNode, minPrecedence: number): string {
  return value.precedence < minPrecedence ? `\\left(${value.latex}\\right)` : value.latex;
}

function wrapPowerBase(value: LatexNode): string {
  return value.precedence >= 99 && /^[A-Za-z0-9.\\_{}]+$/u.test(value.latex) ? value.latex : `{${value.latex}}`;
}

function appendDegrees(latex: string): string {
  return /\^\{?\\circ\}?$/u.test(latex) ? latex : `${latex}^{\\circ}`;
}

function escapeLatex(text: string): string {
  return text.replace(/([&_#%])/gu, "\\$1");
}

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_]/u.test(char);
}

function isIdentifierPart(char: string): boolean {
  return /[A-Za-z0-9_]/u.test(char);
}
