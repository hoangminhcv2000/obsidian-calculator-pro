import * as assert from "node:assert/strict";
import { CalculatorEngine, type EngineSettings } from "../src/engine/CalculatorEngine";
import { Complex } from "../src/engine/Complex";

const DEG: EngineSettings = { angleMode: "deg", complexMode: false, precision: 12 };
const RAD: EngineSettings = { angleMode: "rad", complexMode: false, precision: 12 };
const COMPLEX: EngineSettings = { angleMode: "rad", complexMode: true, precision: 12 };
const FRACTION: EngineSettings = { angleMode: "deg", complexMode: false, precision: 12, exactFractionMode: true };

let assertions = 0;

function evalResult(expression: string, settings: EngineSettings = DEG) {
  return new CalculatorEngine().evaluate(expression, settings);
}

function evalValue(expression: string, settings: EngineSettings = DEG): Complex {
  return evalResult(expression, settings).value;
}

function close(actual: number, expected: number, message = "values should be close", tolerance = 1e-9): void {
  assertions += 1;
  assert.ok(Math.abs(actual - expected) < tolerance, `${message}: expected ${expected}, got ${actual}`);
}

function equal<T>(actual: T, expected: T, message: string): void {
  assertions += 1;
  assert.equal(actual, expected, message);
}

function real(expression: string, expected: number, settings = DEG, tolerance = 1e-9): void {
  const value = evalValue(expression, settings);
  close(value.re, expected, expression, tolerance);
  close(value.im, 0, `${expression} imaginary part`, tolerance);
}

function display(expression: string, expected: string, settings = DEG): void {
  equal(evalResult(expression, settings).display, expected, expression);
}

function complex(expression: string, expectedRe: number, expectedIm: number, tolerance = 1e-9): void {
  const value = evalValue(expression, COMPLEX);
  close(value.re, expectedRe, `${expression} real part`, tolerance);
  close(value.im, expectedIm, `${expression} imaginary part`, tolerance);
}

function throws(expression: string, settings = DEG): void {
  assertions += 1;
  assert.throws(() => evalValue(expression, settings), Error, expression);
}

const coreCases: Array<[string, number, EngineSettings?, number?]> = [
  ["2 + 3 * 4", 14],
  ["(2 + 3) * 4", 20],
  ["2^3^2", 512],
  ["-2^2", -4],
  ["(-2)^2", 4],
  ["2(3 + 4)", 14],
  ["2pi", 2 * Math.PI],
  ["50%", 0.5],
  ["5!", 120],
  ["nCr(5, 2)", 10],
  ["nPr(5, 2)", 20],
  ["sqrt(81)", 9],
  ["nthroot(27, 3)", 3],
  ["nthroot(-27, 3)", -3],
  ["abs(-42)", 42],
  ["|-42|", 42],
  ["log(1000)", 3],
  ["log(8, 2)", 3],
  ["ln(e)", 1],
  ["mean(2, 4, 6)", 4],
  ["mean([2, 4, 6])", 4],
  ["median([1, 10, 5])", 5],
  ["median([1, 10, 5, 20])", 7.5],
  ["sum(2, 4, 6)", 12],
  ["total([2, 4, 6])", 12],
  ["count([2, 4, 6])", 3],
  ["min(2, 4, 6)", 2],
  ["max(2, 4, 6)", 6],
  ["stdevp(2, 4, 6)", Math.sqrt(8 / 3)],
  ["stdev(2, 4, 6)", 2],
  ["varp([2, 4, 6])", 8 / 3],
  ["var([2, 4, 6])", 4],
  ["mad([2, 4, 6])", 4 / 3],
  ["covp([1,2,3], [2,4,6])", 4 / 3],
  ["corr([1,2,3], [2,4,6])", 1],
  ["round(1.2345, 2)", 1.23],
  ["floor(1.9)", 1],
  ["ceil(1.1)", 2],
  ["sin(30)", 0.5, DEG],
  ["cos(180)", -1, DEG],
  ["tan(45)", 1, DEG],
  ["asin(0.5)", 30, DEG],
  ["acos(-1)", 180, DEG],
  ["atan(1)", 45, DEG],
  ["sin(pi / 2)", 1, RAD],
  ["tan(pi / 4)", 1, RAD],
  ["tau / pi", 2],
  ["phi^2 - phi", 1],
  ["5km / m", 5000],
  ["250cm / m", 2.5],
  ["12inch / ft", 1],
  ["1mi / km", 1.609344],
  ["1000g / kg", 1],
  ["1lb / kg", 0.45359237],
  ["16oz / lb", 1],
  ["1hr / min", 60],
  ["1day / hr", 24],
  ["ctof(0)", 32],
  ["ftoc(32)", 0],
  ["ctok(0)", 273.15],
  ["ktoc(273.15)", 0],
  ["ftok(32)", 273.15],
  ["ktof(273.15)", 32],
  ["gravity", 9.80665],
  ["c", 299792458]
];

for (const [expression, expected, settings, tolerance] of coreCases) {
  real(expression, expected, settings ?? DEG, tolerance ?? 1e-9);
}

const fractionDisplays: Array<[string, string]> = [
  ["1/3 + 1/6", "1/2"],
  ["0.1 + 0.2", "3/10"],
  ["2^-3", "1/8"],
  ["(1/2)^3", "1/8"],
  ["5! / 10", "12"],
  ["50% + 25%", "3/4"],
  ["1.25 + 2.5", "15/4"]
];

for (const [expression, expected] of fractionDisplays) {
  display(expression, expected, FRACTION);
}

display("10^400", "∞", FRACTION);
equal(evalResult("pi", DEG).fraction, null, "pi should not show a noisy approximate fraction");

const engine = new CalculatorEngine();
engine.evaluate("2 + 2", DEG);
const ans = engine.evaluate("ans * 3", DEG).value;
close(ans.re, 12, "ans should use previous result");

complex("i * i", -1, 0);
complex("sqrt(-4)", 0, 2);
complex("(2 + 3i) + (4 - i)", 6, 2);
complex("real(2 + 3i)", 2, 0);
complex("imag(2 + 3i)", 3, 0);
complex("conj(2 + 3i)", 2, -3);
complex("arg(1 + i)", Math.PI / 4, 0);

const generatedOperators = [
  ["+", (a: number, b: number) => a + b],
  ["-", (a: number, b: number) => a - b],
  ["*", (a: number, b: number) => a * b],
  ["/", (a: number, b: number) => a / b]
] as const;

for (let a = -8; a <= 8; a += 1) {
  for (let b = 1; b <= 8; b += 1) {
    for (const [operator, fn] of generatedOperators) {
      real(`${a}${operator}${b}`, fn(a, b));
    }
  }
}

for (let n = 0; n <= 12; n += 1) {
  real(`${n}!`, factorial(n));
}

throws("i", DEG);
throws("sqrt(-4)", DEG);
throws("2 / 0", DEG);
throws("sin(", DEG);
throws("unknown(2)", DEG);
throws("nCr(2, 5)", DEG);
throws("ln(-1)", DEG);
throws("infinity - infinity", DEG);
throws("1+".repeat(300) + "1", DEG);
throws("nCr(10001, 2)", DEG);

assertions += 1;
assert.ok(assertions >= 150, `Expected at least 150 assertions, got ${assertions}`);
console.log(`Calculator engine tests passed (${assertions} assertions).`);

function factorial(n: number): number {
  let result = 1;
  for (let i = 2; i <= n; i += 1) result *= i;
  return result;
}
