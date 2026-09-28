// A bounded arithmetic grammar; never execute the expression as JavaScript.
const MAX_LENGTH = 500;
const MAX_DEPTH = 32;
const MAX_OPERATIONS = 200;

export function calculate(expression: string): number {
  if (typeof expression !== "string" || !expression.trim() || expression.length > MAX_LENGTH) {
    throw new Error("Calculator expression must be 1–500 characters.");
  }

  let position = 0;
  let depth = 0;
  let operations = 0;

  function skipSpace(): void {
    while (position < expression.length && /\s/.test(expression[position])) position++;
  }

  function peek(): string {
    skipSpace();
    return expression[position] ?? "";
  }

  function bounded(value: number): number {
    if (++operations > MAX_OPERATIONS) throw new Error("Calculator expression is too complex.");
    if (!Number.isFinite(value)) throw new Error("Calculator result is not finite.");
    return value;
  }

  function primary(): number {
    if (++depth > MAX_DEPTH) throw new Error("Calculator expression is too deeply nested.");
    try {
      if (peek() === "(") {
        position++;
        const value = sum();
        if (peek() !== ")") throw new Error("Expected closing parenthesis.");
        position++;
        return value;
      }
      skipSpace();
      const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(expression.slice(position));
      if (!match) throw new Error(`Expected a number at position ${position + 1}.`);
      position += match[0].length;
      const value = Number(match[0]);
      if (!Number.isFinite(value)) throw new Error("Calculator result is not finite.");
      return value;
    } finally {
      depth--;
    }
  }

  // Exponentiation binds more tightly than unary minus and is right-associative.
  function power(): number {
    const value = primary();
    if (peek() === "^") {
      if (++depth > MAX_DEPTH) throw new Error("Calculator expression is too deeply nested.");
      position++;
      try {
        return bounded(value ** unary());
      } finally {
        depth--;
      }
    }
    return value;
  }

  function unary(): number {
    const char = peek();
    if (char === "+" || char === "-") {
      if (++depth > MAX_DEPTH) throw new Error("Calculator expression is too deeply nested.");
      position++;
      try {
        const value = unary();
        return bounded(char === "-" ? -value : value);
      } finally {
        depth--;
      }
    }
    return power();
  }

  function product(): number {
    let value = unary();
    while (true) {
      const op = peek();
      if (op !== "*" && op !== "/" && op !== "%") break;
      position++;
      const right = unary();
      if ((op === "/" || op === "%") && right === 0) throw new Error("Division by zero.");
      value = bounded(op === "*" ? value * right : op === "/" ? value / right : value % right);
    }
    return value;
  }

  function sum(): number {
    let value = product();
    while (true) {
      const op = peek();
      if (op !== "+" && op !== "-") break;
      position++;
      const right = product();
      value = bounded(op === "+" ? value + right : value - right);
    }
    return value;
  }

  const result = sum();
  if (peek()) throw new Error(`Unexpected character at position ${position + 1}.`);
  return result;
}