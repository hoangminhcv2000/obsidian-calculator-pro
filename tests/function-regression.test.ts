import * as assert from "node:assert/strict";
import { CalculatorEngine, type EngineSettings } from "../src/engine/CalculatorEngine";
import { formatNumber } from "../src/engine/format";

const DEG: EngineSettings = { angleMode: "deg", complexMode: false, precision: 12, exactFractionMode: false };
const RAD: EngineSettings = { angleMode: "rad", complexMode: false, precision: 12, exactFractionMode: false };
const COMPLEX: EngineSettings = { angleMode: "rad", complexMode: true, precision: 12, exactFractionMode: false };
const FRACTION: EngineSettings = { angleMode: "deg", complexMode: false, precision: 12, exactFractionMode: true };

let assertions = 0;

function evaluate(expression: string, settings: EngineSettings = DEG) {
  return new CalculatorEngine().evaluate(expression, settings);
}

function close(expression: string, expected: number, settings: EngineSettings = DEG, tolerance = 1e-9): void {
  const value = evaluate(expression, settings).value;
  assertions += 2;
  assert.ok(Math.abs(value.re - expected) < tolerance, `${expression}: expected real ${expected}, got ${value.re}`);
  assert.ok(Math.abs(value.im) < tolerance, `${expression}: expected no imaginary part, got ${value.im}`);
}

function complexClose(expression: string, expectedRe: number, expectedIm: number, tolerance = 1e-9): void {
  const value = evaluate(expression, COMPLEX).value;
  assertions += 2;
  assert.ok(Math.abs(value.re - expectedRe) < tolerance, `${expression}: expected real ${expectedRe}, got ${value.re}`);
  assert.ok(Math.abs(value.im - expectedIm) < tolerance, `${expression}: expected imaginary ${expectedIm}, got ${value.im}`);
}

function display(expression: string, expected: string, settings: EngineSettings = DEG): void {
  assertions += 1;
  assert.equal(evaluate(expression, settings).display, expected, expression);
}

function throws(expression: string, settings: EngineSettings = DEG): void {
  assertions += 1;
  assert.throws(() => evaluate(expression, settings), Error, expression);
}

close("csc(30)", 2);
close("sec(60)", 2);
close("cot(45)", 1);
close("root(16, 2)", 4);
close("avg([2, 4, 6, 8])", 5);
close("comb(6, 2)", 15);
close("choose(6, 2)", 15);
close("perm(6, 2)", 30);
close("log10(10000)", 4);
close("cov([1,2,3], [2,4,6])", 2);
close("arg(-1)", 180);
close("round(1234, -2)", 1200);
close("floor(-1.2)", -2);
close("ceil(-1.2)", -1);
close("sin(tau / 4)", 1, RAD);

complexClose("ln(-1)", 0, Math.PI);
complexClose("exp(i*pi)", -1, 0);
complexClose("sqrt(-9)", 0, 3);

display("(1/3 + 1/6) * 2", "1", FRACTION);
display("round(1.23456789, 4)", "1.2346");

throws("round(1, 1000)");
throws("round(1, -1000)");
throws("mean([])");
throws("stdev([1])");
throws("corr([1,1], [2,3])");
throws("log(8, 1)");

assertions += 2;
assert.equal(formatNumber(123.456, Number.NaN), "123.456", "NaN precision should fall back safely");
assert.equal(formatNumber(1 / 3, Number.NaN), "0.333333333333", "NaN precision should keep default precision");

console.log(`Function regression tests passed (${assertions} assertions).`);
