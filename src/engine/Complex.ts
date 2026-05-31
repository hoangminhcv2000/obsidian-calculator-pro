export const EPSILON = 1e-12;

export class CalculatorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalculatorError";
  }
}

export class Complex {
  readonly re: number;
  readonly im: number;

  constructor(re: number, im = 0) {
    this.re = cleanNumber(re);
    this.im = cleanNumber(im);
  }

  static readonly ZERO = new Complex(0, 0);
  static readonly ONE = new Complex(1, 0);
  static readonly I = new Complex(0, 1);

  static from(value: number | Complex): Complex {
    return value instanceof Complex ? value : new Complex(value, 0);
  }

  isReal(eps = EPSILON): boolean {
    return Math.abs(this.im) <= eps;
  }

  add(other: Complex): Complex {
    return new Complex(this.re + other.re, this.im + other.im);
  }

  sub(other: Complex): Complex {
    return new Complex(this.re - other.re, this.im - other.im);
  }

  mul(other: Complex): Complex {
    return new Complex(
      this.re * other.re - this.im * other.im,
      this.re * other.im + this.im * other.re
    );
  }

  div(other: Complex): Complex {
    const denom = other.re * other.re + other.im * other.im;
    if (Math.abs(denom) <= EPSILON) {
      throw new CalculatorError("Cannot divide by zero.");
    }
    return new Complex(
      (this.re * other.re + this.im * other.im) / denom,
      (this.im * other.re - this.re * other.im) / denom
    );
  }

  neg(): Complex {
    return new Complex(-this.re, -this.im);
  }

  conj(): Complex {
    return new Complex(this.re, -this.im);
  }

  absNumber(): number {
    return Math.hypot(this.re, this.im);
  }

  argNumber(): number {
    return Math.atan2(this.im, this.re);
  }

  exp(): Complex {
    const factor = Math.exp(this.re);
    return new Complex(factor * Math.cos(this.im), factor * Math.sin(this.im));
  }

  log(): Complex {
    return new Complex(Math.log(this.absNumber()), this.argNumber());
  }

  sqrt(): Complex {
    if (this.isReal() && this.re >= 0) {
      return new Complex(Math.sqrt(this.re));
    }
    const r = this.absNumber();
    const theta = this.argNumber() / 2;
    return new Complex(Math.sqrt(r) * Math.cos(theta), Math.sqrt(r) * Math.sin(theta));
  }

  pow(exponent: Complex): Complex {
    if (this.isReal() && exponent.isReal() && this.re >= 0) {
      return new Complex(Math.pow(this.re, exponent.re));
    }
    if (this.absNumber() <= EPSILON && exponent.isReal() && exponent.re > 0) {
      return Complex.ZERO;
    }
    return exponent.mul(this.log()).exp();
  }

  sin(): Complex {
    return new Complex(
      Math.sin(this.re) * Math.cosh(this.im),
      Math.cos(this.re) * Math.sinh(this.im)
    );
  }

  cos(): Complex {
    return new Complex(
      Math.cos(this.re) * Math.cosh(this.im),
      -Math.sin(this.re) * Math.sinh(this.im)
    );
  }

  tan(): Complex {
    return this.sin().div(this.cos());
  }

  asin(): Complex {
    // asin(z) = -i log(iz + sqrt(1 - z^2))
    const iz = Complex.I.mul(this);
    const root = Complex.ONE.sub(this.mul(this)).sqrt();
    return Complex.I.neg().mul(iz.add(root).log());
  }

  acos(): Complex {
    // principal branch: acos(z) = pi/2 - asin(z)
    return new Complex(Math.PI / 2).sub(this.asin());
  }

  atan(): Complex {
    // atan(z) = i/2 * (log(1 - iz) - log(1 + iz))
    const iz = Complex.I.mul(this);
    return Complex.I.mul(new Complex(0.5)).mul(
      Complex.ONE.sub(iz).log().sub(Complex.ONE.add(iz).log())
    );
  }
}

export function cleanNumber(value: number): number {
  if (!Number.isFinite(value)) return value;
  if (Object.is(value, -0) || Math.abs(value) <= EPSILON) return 0;
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) <= EPSILON) return rounded;
  return value;
}

export function requireReal(value: Complex, label = "value"): number {
  if (!value.isReal()) {
    throw new CalculatorError(`${label} must be real.`);
  }
  return value.re;
}

export function requireInteger(value: Complex, label = "value"): number {
  const real = requireReal(value, label);
  const rounded = Math.round(real);
  if (!Number.isFinite(real) || Math.abs(real - rounded) > EPSILON) {
    throw new CalculatorError(`${label} must be an integer.`);
  }
  return rounded;
}
