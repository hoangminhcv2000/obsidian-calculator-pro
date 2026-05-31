import { CalculatorError, Complex, EPSILON, requireInteger, requireReal } from "./Complex";
import { decimalToFraction, formatComplex } from "./format";
import { tryEvaluateFractionExpression } from "./Fraction";
import type { AngleMode } from "../settings";

export interface EngineSettings {
  angleMode: AngleMode;
  complexMode: boolean;
  precision: number;
  exactFractionMode?: boolean;
}

export interface EvaluationResult {
  expression: string;
  normalizedExpression: string;
  value: Complex;
  display: string;
  fraction: string | null;
  exactFraction: string | null;
}

type TokenType = "number" | "identifier" | "operator" | "leftParen" | "rightParen" | "leftBracket" | "rightBracket" | "comma" | "bar";
type CalcValue = Complex | Complex[];

interface Token {
  type: TokenType;
  value: string;
  index: number;
}

interface BinaryInfo {
  precedence: number;
  rightAssociative?: boolean;
}

const BINARY_OPERATORS: Record<string, BinaryInfo> = {
  "+": { precedence: 1 },
  "-": { precedence: 1 },
  "*": { precedence: 2 },
  "/": { precedence: 2 },
  "^": { precedence: 4, rightAssociative: true }
};

const MAX_EXPRESSION_LENGTH = 512;
const MAX_TOKEN_COUNT = 320;
const MAX_COMBINATORIC_N = 10000;
const MAX_COMBINATORIC_R = 10000;
const SIMPLE_FRACTION_MAX_DENOMINATOR = 1000;

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

type StopToken = "rightParen" | "rightBracket" | "comma" | "bar";

export class CalculatorEngine {
  private ans = Complex.ZERO;

  evaluate(expression: string, settings: EngineSettings): EvaluationResult {
    const normalizedExpression = normalizeInput(expression);
    if (normalizedExpression.length > MAX_EXPRESSION_LENGTH) {
      throw new CalculatorError(`Expression is too long. Limit is ${MAX_EXPRESSION_LENGTH} characters.`);
    }
    const tokens = insertImplicitMultiplication(tokenize(normalizedExpression));
    if (tokens.length > MAX_TOKEN_COUNT) {
      throw new CalculatorError(`Expression is too complex. Limit is ${MAX_TOKEN_COUNT} tokens.`);
    }
    const parser = new Parser(tokens, settings, this.ans);
    const value = parser.parse();

    if (Number.isNaN(value.re) || Number.isNaN(value.im)) {
      throw new CalculatorError("Result is undefined.");
    }

    if (!settings.complexMode && !value.isReal()) {
      throw new CalculatorError("Complex result. Turn on Complex mode to evaluate this expression.");
    }

    this.ans = value;
    const exactFraction = settings.exactFractionMode && !settings.complexMode
      ? tryEvaluateFractionExpression(normalizedExpression)
      : null;
    const fraction = exactFraction?.toString() ?? (value.isReal() ? decimalToFraction(value.re, SIMPLE_FRACTION_MAX_DENOMINATOR) : null);
    const display = exactFraction ? exactFraction.toString() : formatComplex(value, settings.precision);

    return {
      expression,
      normalizedExpression,
      value,
      display,
      fraction,
      exactFraction: exactFraction?.toString() ?? null
    };
  }

  setAns(value: Complex): void {
    this.ans = value;
  }

  getAns(): Complex {
    return this.ans;
  }

  clearAns(): void {
    this.ans = Complex.ZERO;
  }
}

class Parser {
  private position = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly settings: EngineSettings,
    private readonly ans: Complex
  ) {}

  parse(): Complex {
    if (this.tokens.length === 0) {
      throw new CalculatorError("Enter an expression first.");
    }
    const value = this.parseExpression(0, new Set());
    if (!this.isAtEnd()) {
      const token = this.peek();
      throw new CalculatorError(`Unexpected token "${token?.value ?? ""}".`);
    }
    return requireScalar(value, "expression");
  }

  private parseExpression(minPrecedence: number, stops: Set<StopToken>): CalcValue {
    let left = this.parseUnary();

    while (!this.isAtEnd()) {
      const token = this.peek();
      if (!token || isStopToken(token, stops)) break;
      if (token.type !== "operator") break;

      const info = BINARY_OPERATORS[token.value];
      if (!info || info.precedence < minPrecedence) break;

      this.advance();
      const nextMin = info.rightAssociative ? info.precedence : info.precedence + 1;
      const right = this.parseExpression(nextMin, stops);
      left = applyBinary(token.value, requireScalar(left, "left operand"), requireScalar(right, "right operand"));
    }

    return left;
  }

  private parseUnary(): CalcValue {
    const token = this.peek();
    if (token?.type === "operator" && (token.value === "+" || token.value === "-")) {
      this.advance();
      const operand = requireScalar(this.parseExpression(4, new Set()), "unary operand");
      return token.value === "-" ? operand.neg() : operand;
    }

    let value = this.parsePrimary();

    while (!this.isAtEnd()) {
      const token = this.peek();
      if (token?.type !== "operator" || (token.value !== "!" && token.value !== "%")) break;
      this.advance();
      const scalar = requireScalar(value, "postfix operand");
      if (token.value === "!") value = factorial(scalar);
      if (token.value === "%") value = scalar.div(new Complex(100));
    }

    return value;
  }

  private parsePrimary(): CalcValue {
    const token = this.advance();
    if (!token) {
      throw new CalculatorError("Incomplete expression.");
    }

    if (token.type === "number") {
      return new Complex(Number(token.value));
    }

    if (token.type === "identifier") {
      return this.parseIdentifier(token);
    }

    if (token.type === "leftParen") {
      const value = this.parseExpression(0, new Set(["rightParen"]));
      this.consume("rightParen", "Missing closing parenthesis.");
      return requireScalar(value, "parenthesized expression");
    }

    if (token.type === "leftBracket") {
      return this.parseList();
    }

    if (token.type === "bar") {
      const value = requireScalar(this.parseExpression(0, new Set(["bar"])), "absolute value");
      this.consume("bar", "Missing closing absolute-value bar.");
      return new Complex(value.absNumber());
    }

    throw new CalculatorError(`Unexpected token "${token.value}".`);
  }

  private parseIdentifier(token: Token): CalcValue {
    const name = token.value.toLowerCase();

    if (this.match("leftParen")) {
      if (!FUNCTION_NAMES.has(name)) {
        throw new CalculatorError(`Unknown function "${token.value}".`);
      }
      const args = this.parseArguments();
      return applyFunction(name, args, this.settings);
    }

    const constant = getConstant(name);
    if (constant !== null) return new Complex(constant);
    if (name === "ans") return this.ans;
    if (name === "i") {
      if (!this.settings.complexMode) {
        throw new CalculatorError("The imaginary unit i requires Complex mode.");
      }
      return Complex.I;
    }

    throw new CalculatorError(`Unknown symbol "${token.value}".`);
  }

  private parseArguments(): CalcValue[] {
    const args: CalcValue[] = [];
    if (this.match("rightParen")) return args;

    while (!this.isAtEnd()) {
      args.push(this.parseExpression(0, new Set(["comma", "rightParen"])));
      if (this.match("comma")) continue;
      this.consume("rightParen", "Missing closing parenthesis in function call.");
      return args;
    }

    throw new CalculatorError("Missing closing parenthesis in function call.");
  }

  private parseList(): Complex[] {
    const values: Complex[] = [];
    if (this.match("rightBracket")) return values;

    while (!this.isAtEnd()) {
      values.push(requireScalar(this.parseExpression(0, new Set(["comma", "rightBracket"])), "list item"));
      if (this.match("comma")) continue;
      this.consume("rightBracket", "Missing closing bracket in list.");
      return values;
    }

    throw new CalculatorError("Missing closing bracket in list.");
  }

  private consume(type: TokenType, message: string): Token {
    const token = this.peek();
    if (token?.type === type) return this.advance() as Token;
    throw new CalculatorError(message);
  }

  private match(type: TokenType): boolean {
    if (this.peek()?.type === type) {
      this.advance();
      return true;
    }
    return false;
  }

  private advance(): Token | undefined {
    if (!this.isAtEnd()) this.position += 1;
    return this.tokens[this.position - 1];
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
    .replace(/√/gu, "sqrt")
    .replace(/²/gu, "^2")
    .replace(/³/gu, "^3")
    .replace(/∞/gu, "Infinity")
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
      tokens.push({ type: "number", value: input.slice(start, i), index: start });
      continue;
    }

    if (isIdentifierStart(char)) {
      const start = i;
      i += 1;
      while (i < input.length && isIdentifierPart(input[i])) i += 1;
      tokens.push({ type: "identifier", value: input.slice(start, i), index: start });
      continue;
    }

    if (char === "(") {
      tokens.push({ type: "leftParen", value: char, index: i });
      i += 1;
      continue;
    }

    if (char === ")") {
      tokens.push({ type: "rightParen", value: char, index: i });
      i += 1;
      continue;
    }

    if (char === "[") {
      tokens.push({ type: "leftBracket", value: char, index: i });
      i += 1;
      continue;
    }

    if (char === "]") {
      tokens.push({ type: "rightBracket", value: char, index: i });
      i += 1;
      continue;
    }

    if (char === ",") {
      tokens.push({ type: "comma", value: char, index: i });
      i += 1;
      continue;
    }

    if (char === "|") {
      tokens.push({ type: "bar", value: char, index: i });
      i += 1;
      continue;
    }

    if (["+", "-", "*", "/", "^", "!", "%"].includes(char)) {
      tokens.push({ type: "operator", value: char, index: i });
      i += 1;
      continue;
    }

    throw new CalculatorError(`Unsupported character "${char}".`);
  }

  return tokens;
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
      output.push({ type: "operator", value: "*", index: token.index });
    }
    output.push(token);
  }

  return output;
}

function shouldInsertMultiplication(previous: Token, current: Token): boolean {
  if (!isValueEnd(previous) || !isValueStart(current)) return false;
  if (previous.type === "identifier" && current.type === "leftParen" && FUNCTION_NAMES.has(previous.value.toLowerCase())) {
    return false;
  }
  return true;
}

function isValueEnd(token: Token): boolean {
  if (token.type === "number" || token.type === "identifier" || token.type === "rightParen") return true;
  if (token.type === "operator" && (token.value === "!" || token.value === "%")) return true;
  return false;
}

function isValueStart(token: Token): boolean {
  return token.type === "number" || token.type === "identifier" || token.type === "leftParen";
}

function isStopToken(token: Token, stops: Set<StopToken>): boolean {
  return (
    (token.type === "rightParen" && stops.has("rightParen")) ||
    (token.type === "rightBracket" && stops.has("rightBracket")) ||
    (token.type === "comma" && stops.has("comma")) ||
    (token.type === "bar" && stops.has("bar"))
  );
}

function requireScalar(value: CalcValue, label = "value"): Complex {
  if (Array.isArray(value)) {
    throw new CalculatorError(`${label} must be a number, not a list.`);
  }
  return value;
}

function applyBinary(operator: string, left: Complex, right: Complex): Complex {
  switch (operator) {
    case "+": return left.add(right);
    case "-": return left.sub(right);
    case "*": return left.mul(right);
    case "/": return left.div(right);
    case "^": return left.pow(right);
    default: throw new CalculatorError(`Unsupported operator "${operator}".`);
  }
}

function applyFunction(name: string, args: CalcValue[], settings: EngineSettings): Complex {
  const complexMode = settings.complexMode;
  const angleMode: AngleMode = complexMode ? "rad" : settings.angleMode;
  const scalarArgs = (expected: number): Complex[] => expectScalarArgs(name, args, expected);

  switch (name) {
    case "sin": return trig(args, 1, settings, (z) => z.sin());
    case "cos": return trig(args, 1, settings, (z) => z.cos());
    case "tan": return trig(args, 1, settings, (z) => z.tan());
    case "csc": return Complex.ONE.div(trig(args, 1, settings, (z) => z.sin()));
    case "sec": return Complex.ONE.div(trig(args, 1, settings, (z) => z.cos()));
    case "cot": return Complex.ONE.div(trig(args, 1, settings, (z) => z.tan()));

    case "asin":
    case "arcsin": return inverseTrig(args, settings, (z) => z.asin());
    case "acos":
    case "arccos": return inverseTrig(args, settings, (z) => z.acos());
    case "atan":
    case "arctan": return inverseTrig(args, settings, (z) => z.atan());

    case "sqrt": {
      const [value] = scalarArgs(1);
      if (!complexMode && value.isReal() && value.re < 0) {
        throw new CalculatorError("sqrt of a negative number requires Complex mode.");
      }
      rejectComplexIfNeeded(value, settings);
      return value.sqrt();
    }

    case "nthroot":
    case "root": return nthRoot(args, settings);

    case "abs": {
      const [value] = scalarArgs(1);
      return new Complex(value.absNumber());
    }

    case "ln": {
      const [value] = scalarArgs(1);
      rejectComplexIfNeeded(value, settings);
      if (!complexMode && value.isReal() && value.re <= 0) {
        throw new CalculatorError("ln is only defined for positive real numbers unless Complex mode is on.");
      }
      return value.log();
    }

    case "log":
    case "log10": {
      if (args.length !== 1 && args.length !== 2) {
        throw new CalculatorError("log expects one value, or value and base.");
      }
      const value = requireScalar(args[0], "log value");
      rejectComplexIfNeeded(value, settings);
      if (!complexMode && value.isReal() && value.re <= 0) {
        throw new CalculatorError("log is only defined for positive real numbers unless Complex mode is on.");
      }
      const base = args.length === 2 ? requireReal(requireScalar(args[1], "base"), "base") : 10;
      if (base <= 0 || Math.abs(base - 1) <= EPSILON) {
        throw new CalculatorError("log base must be positive and not equal to 1.");
      }
      return value.log().div(new Complex(Math.log(base)));
    }

    case "exp": {
      const [value] = scalarArgs(1);
      rejectComplexIfNeeded(value, settings);
      return value.exp();
    }

    case "mean":
    case "avg": return new Complex(mean(toRealArray(name, args)));
    case "median": return new Complex(median(toRealArray(name, args)));
    case "stdev": return new Complex(stdev(toRealArray(name, args), true));
    case "stdevp": return new Complex(stdev(toRealArray(name, args), false));
    case "var": return new Complex(variance(toRealArray(name, args), true));
    case "varp": return new Complex(variance(toRealArray(name, args), false));
    case "mad": return new Complex(meanAbsoluteDeviation(toRealArray(name, args)));
    case "min": return new Complex(Math.min(...toRealArray(name, args)));
    case "max": return new Complex(Math.max(...toRealArray(name, args)));
    case "sum": return new Complex(toRealArray(name, args).reduce((a, b) => a + b, 0));
    case "total": return new Complex(toRealArray(name, args).reduce((a, b) => a + b, 0));
    case "count": return new Complex(toRealArray(name, args).length);
    case "cov": return new Complex(covariance(...toPairedRealArrays(name, args), true));
    case "covp": return new Complex(covariance(...toPairedRealArrays(name, args), false));
    case "corr": return new Complex(correlation(...toPairedRealArrays(name, args)));

    case "ncr":
    case "comb":
    case "choose": return combination(args);
    case "npr":
    case "perm": return permutation(args);

    case "real":
    case "re": {
      const [value] = scalarArgs(1);
      return new Complex(value.re);
    }
    case "imag":
    case "im": {
      const [value] = scalarArgs(1);
      return new Complex(value.im);
    }
    case "conj": {
      const [value] = scalarArgs(1);
      return value.conj();
    }
    case "arg": {
      const [value] = scalarArgs(1);
      return new Complex(value.argNumber() * (angleMode === "deg" ? 180 / Math.PI : 1));
    }

    case "round": {
      if (args.length !== 1 && args.length !== 2) throw new CalculatorError("round expects one value and optional digits.");
      const value = requireReal(requireScalar(args[0], "round value"));
      const digits = args.length === 2 ? requireInteger(requireScalar(args[1], "digits"), "digits") : 0;
      const factor = Math.pow(10, digits);
      return new Complex(Math.round(value * factor) / factor);
    }
    case "floor": {
      const [value] = scalarArgs(1);
      return new Complex(Math.floor(requireReal(value)));
    }
    case "ceil": {
      const [value] = scalarArgs(1);
      return new Complex(Math.ceil(requireReal(value)));
    }

    case "ctof": {
      const [value] = scalarArgs(1);
      return new Complex(requireReal(value, "celsius") * 9 / 5 + 32);
    }
    case "ftoc": {
      const [value] = scalarArgs(1);
      return new Complex((requireReal(value, "fahrenheit") - 32) * 5 / 9);
    }
    case "ctok": {
      const [value] = scalarArgs(1);
      return new Complex(requireReal(value, "celsius") + 273.15);
    }
    case "ktoc": {
      const [value] = scalarArgs(1);
      return new Complex(requireReal(value, "kelvin") - 273.15);
    }
    case "ftok": {
      const [value] = scalarArgs(1);
      return new Complex((requireReal(value, "fahrenheit") - 32) * 5 / 9 + 273.15);
    }
    case "ktof": {
      const [value] = scalarArgs(1);
      return new Complex((requireReal(value, "kelvin") - 273.15) * 9 / 5 + 32);
    }

    default:
      throw new CalculatorError(`Unknown function "${name}".`);
  }
}


function getConstant(name: string): number | null {
  const constants: Record<string, number> = {
    pi: Math.PI,
    tau: Math.PI * 2,
    e: Math.E,
    phi: (1 + Math.sqrt(5)) / 2,
    infinity: Infinity,

    // Length, base meter
    m: 1,
    meter: 1,
    meters: 1,
    km: 1000,
    kilometer: 1000,
    kilometers: 1000,
    cm: 0.01,
    centimeter: 0.01,
    centimeters: 0.01,
    mm: 0.001,
    millimeter: 0.001,
    millimeters: 0.001,
    mi: 1609.344,
    mile: 1609.344,
    miles: 1609.344,
    yd: 0.9144,
    yard: 0.9144,
    yards: 0.9144,
    ft: 0.3048,
    foot: 0.3048,
    feet: 0.3048,
    inch: 0.0254,
    inches: 0.0254,

    // Mass, base kilogram
    kg: 1,
    kilogram: 1,
    kilograms: 1,
    g: 0.001,
    gram: 0.001,
    grams: 0.001,
    mg: 0.000001,
    milligram: 0.000001,
    milligrams: 0.000001,
    lb: 0.45359237,
    pound: 0.45359237,
    pounds: 0.45359237,
    oz: 0.028349523125,
    ounce: 0.028349523125,
    ounces: 0.028349523125,

    // Time, base second
    s: 1,
    sec: 1,
    second: 1,
    seconds: 1,
    min: 60,
    minute: 60,
    minutes: 60,
    hr: 3600,
    hour: 3600,
    hours: 3600,
    day: 86400,
    days: 86400,

    // Physical constants
    c: 299792458,
    gravity: 9.80665,
    avogadro: 6.02214076e23,
    boltzmann: 1.380649e-23,
    planck: 6.62607015e-34
  };

  return Object.prototype.hasOwnProperty.call(constants, name) ? constants[name] : null;
}

function trig(args: CalcValue[], arity: number, settings: EngineSettings, fn: (value: Complex) => Complex): Complex {
  const scalars = expectScalarArgs("trig", args, arity);
  const complexMode = settings.complexMode;
  rejectComplexIfNeeded(scalars[0], settings);
  const input = !complexMode && settings.angleMode === "deg" ? new Complex(scalars[0].re * Math.PI / 180) : scalars[0];
  return fn(input);
}

function inverseTrig(args: CalcValue[], settings: EngineSettings, fn: (value: Complex) => Complex): Complex {
  const [value] = expectScalarArgs("inverse trig", args, 1);
  rejectComplexIfNeeded(value, settings);
  let result = fn(value);
  if (!settings.complexMode && settings.angleMode === "deg") {
    result = new Complex(result.re * 180 / Math.PI, result.im * 180 / Math.PI);
  }
  return result;
}

function nthRoot(args: CalcValue[], settings: EngineSettings): Complex {
  const [value, rootValue] = expectScalarArgs("nthroot", args, 2);
  const root = requireInteger(rootValue, "root");
  if (root === 0) throw new CalculatorError("Root index cannot be zero.");
  rejectComplexIfNeeded(value, settings);

  if (!settings.complexMode && value.isReal()) {
    if (value.re < 0 && Math.abs(root % 2) === 1) return new Complex(-Math.pow(Math.abs(value.re), 1 / root));
    if (value.re < 0) throw new CalculatorError("Even root of a negative number requires Complex mode.");
    return new Complex(Math.pow(value.re, 1 / root));
  }

  return value.pow(new Complex(1 / root));
}

function rejectComplexIfNeeded(value: Complex, settings: EngineSettings): void {
  if (!settings.complexMode && !value.isReal()) {
    throw new CalculatorError("Complex values require Complex mode.");
  }
}

function expectArgs(name: string, args: CalcValue[], expected: number): void {
  if (args.length !== expected) {
    throw new CalculatorError(`${name} expects ${expected} argument${expected === 1 ? "" : "s"}.`);
  }
}

function expectScalarArgs(name: string, args: CalcValue[], expected: number): Complex[] {
  expectArgs(name, args, expected);
  return args.map((arg, index) => requireScalar(arg, `${name} argument ${index + 1}`));
}

function toRealArray(name: string, args: CalcValue[]): number[] {
  if (args.length === 0) throw new CalculatorError(`${name} expects at least one value.`);
  const flattened = args.flatMap((arg) => Array.isArray(arg) ? arg : [arg]);
  if (flattened.length === 0) throw new CalculatorError(`${name} expects at least one value.`);
  return flattened.map((arg, index) => requireReal(arg, `${name} argument ${index + 1}`));
}

function toPairedRealArrays(name: string, args: CalcValue[]): [number[], number[]] {
  if (args.length !== 2 || !Array.isArray(args[0]) || !Array.isArray(args[1])) {
    throw new CalculatorError(`${name} expects two lists, e.g. ${name}([1,2,3], [4,5,6]).`);
  }
  const left = args[0].map((arg, index) => requireReal(arg, `${name} x ${index + 1}`));
  const right = args[1].map((arg, index) => requireReal(arg, `${name} y ${index + 1}`));
  if (left.length !== right.length) throw new CalculatorError(`${name} lists must be the same length.`);
  if (left.length === 0) throw new CalculatorError(`${name} expects non-empty lists.`);
  return [left, right];
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) throw new CalculatorError("median expects at least one value.");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function stdev(values: number[], sample: boolean): number {
  return Math.sqrt(variance(values, sample));
}

function variance(values: number[], sample: boolean): number {
  if (sample && values.length < 2) {
    throw new CalculatorError("sample variance requires at least two values.");
  }
  const avg = mean(values);
  return values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / (sample ? values.length - 1 : values.length);
}

function meanAbsoluteDeviation(values: number[]): number {
  const avg = mean(values);
  return mean(values.map((value) => Math.abs(value - avg)));
}

function covariance(left: number[], right: number[], sample: boolean): number {
  if (sample && left.length < 2) throw new CalculatorError("sample covariance requires at least two pairs.");
  const leftMean = mean(left);
  const rightMean = mean(right);
  const sum = left.reduce((total, value, index) => total + (value - leftMean) * (right[index] - rightMean), 0);
  return sum / (sample ? left.length - 1 : left.length);
}

function correlation(left: number[], right: number[]): number {
  const denom = Math.sqrt(variance(left, false) * variance(right, false));
  if (Math.abs(denom) <= EPSILON) throw new CalculatorError("correlation is undefined for zero-variance data.");
  return covariance(left, right, false) / denom;
}

function factorial(value: Complex): Complex {
  const n = requireInteger(value, "factorial input");
  if (n < 0) throw new CalculatorError("factorial input must be non-negative.");
  if (n > 170) throw new CalculatorError("factorial input is too large.");
  let result = 1;
  for (let i = 2; i <= n; i += 1) result *= i;
  return new Complex(result);
}

function combination(args: CalcValue[]): Complex {
  const [nValue, rValue] = expectScalarArgs("nCr", args, 2);
  const n = requireInteger(nValue, "n");
  const r = requireInteger(rValue, "r");
  if (n < 0 || r < 0 || r > n) throw new CalculatorError("nCr requires integers with 0 ≤ r ≤ n.");
  if (n > MAX_COMBINATORIC_N || r > MAX_COMBINATORIC_R) throw new CalculatorError("nCr input is too large.");
  const k = Math.min(r, n - r);
  let result = 1;
  for (let i = 1; i <= k; i += 1) result = result * (n - k + i) / i;
  return new Complex(result);
}

function permutation(args: CalcValue[]): Complex {
  const [nValue, rValue] = expectScalarArgs("nPr", args, 2);
  const n = requireInteger(nValue, "n");
  const r = requireInteger(rValue, "r");
  if (n < 0 || r < 0 || r > n) throw new CalculatorError("nPr requires integers with 0 ≤ r ≤ n.");
  if (n > MAX_COMBINATORIC_N || r > MAX_COMBINATORIC_R) throw new CalculatorError("nPr input is too large.");
  let result = 1;
  for (let i = 0; i < r; i += 1) result *= n - i;
  return new Complex(result);
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
