import type { MapDefinition } from '@/types/calibration';

type RpnTokenType = 'NUM' | 'VAR' | 'OP' | 'UNARY_MINUS';

interface RpnToken {
  type: RpnTokenType;
  value?: number;
  op?: '+' | '-' | '*' | '/';
}

interface InfixToken {
  type: 'NUM' | 'VAR' | 'OP' | 'LPAREN' | 'RPAREN' | 'UNARY_MINUS';
  value?: string;
}

function tokenizeExpression(expr: string): InfixToken[] {
  const res: InfixToken[] = [];
  let i = 0;
  const len = expr.length;
  let expectUnary = true;
  while (i < len) {
    const char = expr[i]!;
    if (char <= ' ') { i++; continue; }
    if (char === '(') { res.push({ type: 'LPAREN' }); expectUnary = true; i++; continue; }
    if (char === ')') { res.push({ type: 'RPAREN' }); expectUnary = false; i++; continue; }
    if (char === '+' || char === '*' || char === '/') { res.push({ type: 'OP', value: char }); expectUnary = true; i++; continue; }
    if (char === '-') {
      if (expectUnary) res.push({ type: 'UNARY_MINUS' });
      else res.push({ type: 'OP', value: '-' });
      expectUnary = true; i++; continue;
    }
    if (char === 'x' || char === 'X') { res.push({ type: 'VAR' }); expectUnary = false; i++; continue; }
    if ((char >= '0' && char <= '9') || char === '.') {
      let start = i;
      while (i < len) {
        const c = expr[i]!;
        if ((c >= '0' && c <= '9') || c === '.') i++;
        else if (c === 'e' || c === 'E') {
          i++;
          if (i < len && (expr[i] === '+' || expr[i] === '-')) i++;
        } else break;
      }
      res.push({ type: 'NUM', value: expr.substring(start, i) });
      expectUnary = false;
      continue;
    }
    i++;
  }
  return res;
}

function compileToRpn(expression: string): RpnToken[] {
  const tokens = tokenizeExpression(expression);
  const outputQueue: RpnToken[] = [];
  const operatorStack: InfixToken[] = [];
  const precedence: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, 'UNARY_MINUS': 3 };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.type === 'NUM') outputQueue.push({ type: 'NUM', value: parseFloat(token.value!) });
    else if (token.type === 'VAR') outputQueue.push({ type: 'VAR' });
    else if (token.type === 'UNARY_MINUS') operatorStack.push(token);
    else if (token.type === 'OP') {
      const op = token.value!;
      while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1]!.type !== 'LPAREN') {
        const top = operatorStack[operatorStack.length - 1]!;
        const topKey = top.type === 'UNARY_MINUS' ? 'UNARY_MINUS' : (top.value ?? '');
        if ((precedence[topKey] ?? 0) >= precedence[op]!) {
          operatorStack.pop();
          outputQueue.push(top.type === 'UNARY_MINUS' ? { type: 'UNARY_MINUS' } : { type: 'OP', op: top.value as any });
        } else break;
      }
      operatorStack.push(token);
    } else if (token.type === 'LPAREN') {
      operatorStack.push(token);
    } else if (token.type === 'RPAREN') {
      while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1]!.type !== 'LPAREN') {
        const top = operatorStack.pop()!;
        outputQueue.push(top.type === 'UNARY_MINUS' ? { type: 'UNARY_MINUS' } : { type: 'OP', op: top.value as any });
      }
      operatorStack.pop();
    }
  }
  while (operatorStack.length > 0) {
    const top = operatorStack.pop()!;
    if (top.type !== 'LPAREN') {
      outputQueue.push(top.type === 'UNARY_MINUS' ? { type: 'UNARY_MINUS' } : { type: 'OP', op: top.value as any });
    }
  }
  return outputQueue;
}

function evaluateRpn(rpn: RpnToken[], variableValue: number): number {
  const stack: number[] = [];
  for (let i = 0; i < rpn.length; i++) {
    const t = rpn[i]!;
    if (t.type === 'NUM') stack.push(t.value!);
    else if (t.type === 'VAR') stack.push(variableValue);
    else if (t.type === 'UNARY_MINUS') stack.push(-(stack.pop() ?? 0));
    else if (t.type === 'OP') {
      const b = stack.pop() ?? 0;
      const a = stack.pop() ?? 0;
      switch (t.op) {
        case '+': stack.push(a + b); break;
        case '-': stack.push(a - b); break;
        case '*': stack.push(a * b); break;
        case '/': stack.push(b === 0 ? 0 : a / b); break;
      }
    }
  }
  return stack[0] ?? 0;
}

const rpnCache = new Map<string, RpnToken[]>();
function getOrCompileRpn(expression: string): RpnToken[] {
  let compiled = rpnCache.get(expression);
  if (!compiled) {
    compiled = compileToRpn(expression);
    rpnCache.set(expression, compiled);
  }
  return compiled;
}

export class CompuMethod {
  public static rawToPhysical(raw: number, def: MapDefinition): number {
    if (def.formulaForward) {
      try {
        return this.evaluateExpression(def.formulaForward, raw);
      } catch {}
    }
    return raw * def.factor + def.offsetA2l;
  }

  public static physicalToRaw(phys: number, def: MapDefinition): number {
    if (def.formulaReverse) {
      try {
        return Math.round(this.evaluateExpression(def.formulaReverse, phys));
      } catch {}
    }
    if (def.formulaForward) {
      try {
        return Math.round(this.solveNumericRoot(def.formulaForward, phys));
      } catch {}
    }
    if (def.factor === 0) return phys - def.offsetA2l;
    return Math.round((phys - def.offsetA2l) / def.factor);
  }

  public static evaluateExpression(expression: string, variableValue: number): number {
    try {
      return evaluateRpn(getOrCompileRpn(expression), variableValue);
    } catch {
      return variableValue;
    }
  }

  private static solveNumericRoot(formula: string, targetPhys: number): number {
    const f = (x: number) => this.evaluateExpression(formula, x) - targetPhys;
    let x0 = targetPhys;
    let x1 = targetPhys + 1.0;
    let f0 = f(x0);
    let f1 = f(x1);

    // Iterazione con limite protetto per evitare Infinite Loop (Max 50 iterazioni per tolleranza 1e-5)
    let iter = 0;
    for (; iter < 50; iter++) {
      const denom = f1 - f0;
      if (Math.abs(denom) < 1e-12) break;
      const xNext = x1 - f1 * (x1 - x0) / denom;
      if (isNaN(xNext) || !isFinite(xNext)) break;
      x0 = x1; f0 = f1; x1 = xNext; f1 = f(x1);
      if (Math.abs(f1) < 1e-5) return x1;
    }

    // Fallback Metodo Bisezione protetta
    let lower = targetPhys - 10000.0;
    let upper = targetPhys + 10000.0;
    let fLower = f(lower);
    let fUpper = f(upper);

    if (fLower * fUpper < 0) {
      for (let i = 0; i < 50; i++) {
        const mid = lower + (upper - lower) / 2.0;
        const fMid = f(mid);
        if (Math.abs(fMid) < 1e-5) return mid;
        if (fLower * fMid < 0) { upper = mid; fUpper = fMid; }
        else { lower = mid; fLower = fMid; }
      }
      return lower + (upper - lower) / 2.0;
    }

    return targetPhys; // Extrema ratio lineare
  }
}
