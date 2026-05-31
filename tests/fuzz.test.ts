import * as assert from "node:assert/strict";
import { CalculatorEngine, type EngineSettings } from "../src/engine/CalculatorEngine";

const SETTINGS: EngineSettings = { angleMode: "deg", complexMode: false, precision: 12 };
let seed = 123456789;
let assertions = 0;

function random(): number {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
}

function int(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function atom(): string {
  return String(int(1, 20));
}

function expression(depth: number): string {
  if (depth <= 0) return atom();
  const left = expression(depth - 1);
  const right = expression(depth - 1);
  const op = ["+", "-", "*", "/"][int(0, 3)];
  return `(${left}${op}${right})`;
}

for (let i = 0; i < 220; i += 1) {
  const expr = expression(int(1, 3));
  const expected = Function(`"use strict"; return (${expr});`)() as number;
  if (!Number.isFinite(expected)) continue;
  const actual = new CalculatorEngine().evaluate(expr, SETTINGS).value.re;
  assertions += 1;
  assert.ok(Math.abs(actual - expected) < 1e-9, `${expr}: expected ${expected}, got ${actual}`);
}

console.log(`Parser fuzz tests passed (${assertions} assertions).`);
