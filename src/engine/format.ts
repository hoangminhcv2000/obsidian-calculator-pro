import { Complex, EPSILON, cleanNumber } from "./Complex";

export function formatComplex(value: Complex, precision: number): string {
  const re = cleanNumber(value.re);
  const im = cleanNumber(value.im);

  if (Math.abs(im) <= EPSILON) {
    return formatNumber(re, precision);
  }

  if (Math.abs(re) <= EPSILON) {
    return `${formatImaginary(im, precision)}i`;
  }

  const sign = im < 0 ? "−" : "+";
  return `${formatNumber(re, precision)} ${sign} ${formatImaginary(Math.abs(im), precision)}i`;
}

export function formatNumber(value: number, precision: number): string {
  const cleaned = cleanNumber(value);
  if (Number.isNaN(cleaned)) return "NaN";
  if (cleaned === Infinity) return "∞";
  if (cleaned === -Infinity) return "−∞";
  if (Number.isInteger(cleaned) && Math.abs(cleaned) < 1e21) return String(cleaned);

  const safePrecision = Math.min(Math.max(Math.trunc(precision), 4), 16);
  let text = cleaned.toPrecision(safePrecision);

  if (text.includes("e")) {
    const [mantissa, exponent] = text.split("e");
    return `${trimTrailingZeros(mantissa)}e${Number(exponent) >= 0 ? "+" : ""}${Number(exponent)}`;
  }

  return trimTrailingZeros(text);
}

function trimTrailingZeros(text: string): string {
  if (!text.includes(".")) return text;
  return text.replace(/(\.\d*?[1-9])0+$/u, "$1").replace(/\.0+$/u, "");
}

function formatImaginary(value: number, precision: number): string {
  if (Math.abs(value - 1) <= EPSILON) return "";
  return formatNumber(value, precision);
}

export function decimalToFraction(value: number, maxDenominator = 100000): string | null {
  if (!Number.isFinite(value)) return null;
  if (Math.abs(value) <= EPSILON) return "0";

  const sign = value < 0 ? -1 : 1;
  let x = Math.abs(value);
  const integer = Math.floor(x);
  x -= integer;

  if (x <= EPSILON) return String(sign * integer);

  let h1 = 1;
  let h0 = 0;
  let k1 = 0;
  let k0 = 1;
  let b = x;

  do {
    const a = Math.floor(b);
    const h2 = a * h1 + h0;
    const k2 = a * k1 + k0;
    if (k2 > maxDenominator) break;
    h0 = h1;
    h1 = h2;
    k0 = k1;
    k1 = k2;
    const remainder = b - a;
    if (Math.abs(remainder) <= EPSILON) break;
    b = 1 / remainder;
  } while (k1 <= maxDenominator);

  const numerator = sign * (integer * k1 + h1);
  const denominator = k1;

  if (denominator === 1) return String(numerator);
  const reconstructed = numerator / denominator;
  if (Math.abs(reconstructed - value) > 1e-10) return null;
  return `${numerator}/${denominator}`;
}
