import * as assert from "node:assert/strict";
import { Complex } from "../src/engine/Complex";
import { decimalToFraction, formatComplex, formatNumber } from "../src/engine/format";

const cases: Array<[string | null, string | null, string]> = [
  [formatNumber(0.30000000000000004, 12), "0.3", "cleans floating noise"],
  [formatNumber(1000, 12), "1000", "integer"],
  [formatNumber(Infinity, 12), "∞", "infinity"],
  [formatNumber(-Infinity, 12), "−∞", "negative infinity"],
  [formatComplex(new Complex(0, 1), 12), "i", "imaginary unit"],
  [formatComplex(new Complex(2, -3), 12), "2 − 3i", "complex negative"],
  [formatComplex(new Complex(2, 3), 12), "2 + 3i", "complex positive"],
  [decimalToFraction(0.5), "1/2", "half"],
  [decimalToFraction(0.125), "1/8", "eighth"],
  [decimalToFraction(-1.25), "-5/4", "negative fraction"]
];

for (const [actual, expected, label] of cases) {
  assert.equal(actual, expected, label);
}

console.log(`Formatting snapshot tests passed (${cases.length} assertions).`);
