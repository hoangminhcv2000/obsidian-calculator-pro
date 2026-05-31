import * as assert from "node:assert/strict";
import { CalculatorEngine, type EngineSettings } from "../src/engine/CalculatorEngine";
import { displayToLatex, expressionToLatex, formatLatexEquation, formatObsidianLatexBlock } from "../src/engine/latex";

const DEG: EngineSettings = { angleMode: "deg", complexMode: false, precision: 12, exactFractionMode: true };
const RAD: EngineSettings = { angleMode: "rad", complexMode: false, precision: 12 };

const expressionCases: Array<[string, string]> = [
  ["1/3 + 1/6", "\\frac{1}{3} + \\frac{1}{6}"],
  ["sqrt(2^2 + 3^2)", "\\sqrt{2^{2} + 3^{2}}"],
  ["nthroot(27, 3)", "\\sqrt[3]{27}"],
  ["log(8, 2)", "\\log_{2}\\left(8\\right)"],
  ["nCr(5, 2)", "\\binom{5}{2}"],
  ["5km / m", "\\frac{5 \\cdot \\mathrm{km}}{\\mathrm{m}}"],
  ["ctof(0)", "\\operatorname{C\\to F}\\left(0\\right)"],
  ["real(2 + 3i)", "\\operatorname{Re}\\left(2 + 3 \\cdot i\\right)"],
  ["mean([2, 4, 6])", "\\operatorname{mean}\\left(\\left[2, 4, 6\\right]\\right)"]
];

for (const [input, expected] of expressionCases) {
  assert.equal(expressionToLatex(input, { angleMode: "rad" }), expected, input);
}

assert.equal(expressionToLatex("sin(30)", { angleMode: "deg" }), "\\sin\\left(30^{\\circ}\\right)");
assert.equal(expressionToLatex("sin(pi / 2)", { angleMode: "rad" }), "\\sin\\left(\\frac{\\pi}{2}\\right)");
assert.equal(displayToLatex("1/2"), "\\frac{1}{2}");
assert.equal(displayToLatex("∞"), "\\infty");

const engine = new CalculatorEngine();
const result = engine.evaluate("1/3 + 1/6", DEG);
assert.equal(formatLatexEquation("1/3 + 1/6", result, { angleMode: DEG.angleMode }), "\\frac{1}{3} + \\frac{1}{6} = \\frac{1}{2}");
assert.equal(formatObsidianLatexBlock("x = 1"), "$$\nx = 1\n$$");

const radResult = new CalculatorEngine().evaluate("sin(pi / 2)", RAD);
assert.equal(formatLatexEquation("sin(pi / 2)", radResult, { angleMode: RAD.angleMode }), "\\sin\\left(\\frac{\\pi}{2}\\right) = 1");

console.log(`LaTeX formatter tests passed (${expressionCases.length + 6} assertions).`);
