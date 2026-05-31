import { CalculatorError } from "./Complex";

const MAX_EXACT_DECIMAL_PLACES = 30;
const MAX_EXACT_EXPONENT = 100;
const MAX_EXACT_DIGITS = 120;

export class Fraction {
  readonly n: bigint;
  readonly d: bigint;

  constructor(numerator: bigint | number, denominator: bigint | number = 1) {
    let n = typeof numerator === "bigint" ? numerator : BigInt(numerator);
    let d = typeof denominator === "bigint" ? denominator : BigInt(denominator);
    if (d === 0n) throw new CalculatorError("Cannot divide by zero.");
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const g = gcd(absBigInt(n), d);
    this.n = n / g;
    this.d = d / g;
    assertDigitLimit(this.n);
    assertDigitLimit(this.d);
  }

  static readonly ZERO = new Fraction(0);
  static readonly ONE = new Fraction(1);

  static fromDecimalText(text: string): Fraction {
    const normalized = text.toLowerCase();
    if (normalized.includes("e")) {
      const [mantissa, expText] = normalized.split("e");
      const exponent = Number(expText);
      if (!Number.isInteger(exponent)) throw new CalculatorError("Invalid number.");
      if (Math.abs(exponent) > MAX_EXACT_EXPONENT) throw new CalculatorError("Exact fraction exponent is too large.");
      const base = Fraction.fromDecimalText(mantissa);
      if (exponent >= 0) return base.mul(new Fraction(pow10(exponent)));
      return base.div(new Fraction(pow10(-exponent)));
    }

    const sign = normalized.startsWith("-") ? -1n : 1n;
    const unsigned = normalized.replace(/^[-+]/u, "");
    const [whole, decimals = ""] = unsigned.split(".");
    if (decimals.length > MAX_EXACT_DECIMAL_PLACES) throw new CalculatorError("Exact decimal has too many places.");
    const digits = `${whole || "0"}${decimals}`;
    if (digits.length > MAX_EXACT_DIGITS) throw new CalculatorError("Exact number has too many digits.");
    if (!/^\d+$/u.test(digits)) throw new CalculatorError("Invalid number.");
    const denominator = pow10(decimals.length);
    return new Fraction(sign * BigInt(digits), denominator);
  }

  add(other: Fraction): Fraction {
    return new Fraction(this.n * other.d + other.n * this.d, this.d * other.d);
  }

  sub(other: Fraction): Fraction {
    return new Fraction(this.n * other.d - other.n * this.d, this.d * other.d);
  }

  mul(other: Fraction): Fraction {
    return new Fraction(this.n * other.n, this.d * other.d);
  }

  div(other: Fraction): Fraction {
    return new Fraction(this.n * other.d, this.d * other.n);
  }

  neg(): Fraction {
    return new Fraction(-this.n, this.d);
  }

  pow(exponent: number): Fraction {
    if (!Number.isInteger(exponent)) throw new CalculatorError("Exact fraction exponent must be an integer.");
    if (Math.abs(exponent) > MAX_EXACT_EXPONENT) throw new CalculatorError("Exact fraction exponent is too large.");
    if (exponent === 0) return Fraction.ONE;
    if (exponent < 0) return new Fraction(this.d, this.n).pow(-exponent);
    return new Fraction(this.n ** BigInt(exponent), this.d ** BigInt(exponent));
  }

  factorial(): Fraction {
    if (this.d !== 1n || this.n < 0n) throw new CalculatorError("factorial input must be a non-negative integer.");
    if (this.n > 170n) throw new CalculatorError("factorial input is too large.");
    let result = 1n;
    for (let i = 2n; i <= this.n; i += 1n) result *= i;
    return new Fraction(result);
  }

  percent(): Fraction {
    return this.div(new Fraction(100));
  }

  toNumber(): number {
    return Number(this.n) / Number(this.d);
  }

  toString(): string {
    if (this.d === 1n) return this.n.toString();
    return `${this.n}/${this.d}`;
  }
}

export function tryEvaluateFractionExpression(expression: string): Fraction | null {
  try {
    if (!expression || /[A-Za-z_π𝜋]/u.test(expression)) return null;
    const parser = new FractionParser(tokenizeFraction(expression));
    return parser.parse();
  } catch {
    return null;
  }
}

type FractionTokenType = "number" | "operator" | "leftParen" | "rightParen";

interface FractionToken {
  type: FractionTokenType;
  value: string;
}

const FRACTION_BINARY: Record<string, { precedence: number; rightAssociative?: boolean }> = {
  "+": { precedence: 1 },
  "-": { precedence: 1 },
  "*": { precedence: 2 },
  "/": { precedence: 2 },
  "^": { precedence: 4, rightAssociative: true }
};

class FractionParser {
  private position = 0;

  constructor(private readonly tokens: FractionToken[]) {}

  parse(): Fraction {
    if (this.tokens.length === 0) throw new CalculatorError("Enter an expression first.");
    const value = this.parseExpression(0);
    if (!this.isAtEnd()) throw new CalculatorError("Unexpected token.");
    return value;
  }

  private parseExpression(minPrecedence: number): Fraction {
    let left = this.parseUnary();

    while (!this.isAtEnd()) {
      const token = this.peek();
      if (!token || token.type !== "operator") break;
      const info = FRACTION_BINARY[token.value];
      if (!info || info.precedence < minPrecedence) break;
      this.advance();
      const nextMin = info.rightAssociative ? info.precedence : info.precedence + 1;
      const right = this.parseExpression(nextMin);
      left = applyFractionBinary(token.value, left, right);
    }

    return left;
  }

  private parseUnary(): Fraction {
    const token = this.peek();
    if (token?.type === "operator" && (token.value === "+" || token.value === "-")) {
      this.advance();
      const operand = this.parseExpression(4);
      return token.value === "-" ? operand.neg() : operand;
    }

    let value = this.parsePrimary();
    while (!this.isAtEnd()) {
      const token = this.peek();
      if (token?.type !== "operator" || (token.value !== "!" && token.value !== "%")) break;
      this.advance();
      value = token.value === "!" ? value.factorial() : value.percent();
    }
    return value;
  }

  private parsePrimary(): Fraction {
    const token = this.advance();
    if (!token) throw new CalculatorError("Incomplete expression.");
    if (token.type === "number") return Fraction.fromDecimalText(token.value);
    if (token.type === "leftParen") {
      const value = this.parseExpression(0);
      if (this.peek()?.type !== "rightParen") throw new CalculatorError("Missing closing parenthesis.");
      this.advance();
      return value;
    }
    throw new CalculatorError("Unexpected token.");
  }

  private advance(): FractionToken | undefined {
    if (!this.isAtEnd()) this.position += 1;
    return this.tokens[this.position - 1];
  }

  private peek(): FractionToken | undefined {
    return this.tokens[this.position];
  }

  private isAtEnd(): boolean {
    return this.position >= this.tokens.length;
  }
}

function tokenizeFraction(input: string): FractionToken[] {
  const tokens: FractionToken[] = [];
  let i = 0;
  while (i < input.length) {
    const char = input[i];
    if (/\s/u.test(char)) {
      i += 1;
      continue;
    }
    if (isDigit(char) || (char === "." && isDigit(input[i + 1] ?? ""))) {
      const start = i;
      i = readNumber(input, i);
      tokens.push({ type: "number", value: input.slice(start, i) });
      continue;
    }
    if (char === "(") {
      tokens.push({ type: "leftParen", value: char });
      i += 1;
      continue;
    }
    if (char === ")") {
      tokens.push({ type: "rightParen", value: char });
      i += 1;
      continue;
    }
    if (["+", "-", "*", "/", "^", "!", "%"].includes(char)) {
      tokens.push({ type: "operator", value: char });
      i += 1;
      continue;
    }
    throw new CalculatorError("Unsupported token for exact fractions.");
  }
  return tokens;
}

function applyFractionBinary(operator: string, left: Fraction, right: Fraction): Fraction {
  switch (operator) {
    case "+": return left.add(right);
    case "-": return left.sub(right);
    case "*": return left.mul(right);
    case "/": return left.div(right);
    case "^": {
      if (right.d !== 1n) throw new CalculatorError("Exact fraction exponent must be an integer.");
      const exp = Number(right.n);
      if (!Number.isSafeInteger(exp)) throw new CalculatorError("Exact fraction exponent is too large.");
      return left.pow(exp);
    }
    default: throw new CalculatorError("Unsupported operator.");
  }
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

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

function pow10(exponent: number): bigint {
  if (exponent > MAX_EXACT_EXPONENT) throw new CalculatorError("Exact fraction exponent is too large.");
  return 10n ** BigInt(exponent);
}

function assertDigitLimit(value: bigint): void {
  if (absBigInt(value).toString().length > MAX_EXACT_DIGITS) {
    throw new CalculatorError("Exact fraction result is too large.");
  }
}

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a || 1n;
}
