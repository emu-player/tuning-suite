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

/**
 * Tokenizzatore robusto a livello di carattere che supporta numeri decimali,
 * notazione scientifica, variabili e distinzione degli operatori unari.
 */
function tokenizeExpression(expr: string): InfixToken[] {
  const res: InfixToken[] = [];
  let i = 0;
  const len = expr.length;
  let expectUnary = true;

  while (i < len) {
    const char = expr[i]!;

    if (char <= ' ') {
      i++;
      continue;
    }

    if (char === '(') {
      res.push({ type: 'LPAREN' });
      expectUnary = true;
      i++;
      continue;
    }

    if (char === ')') {
      res.push({ type: 'RPAREN' });
      expectUnary = false;
      i++;
      continue;
    }

    if (char === '+' || char === '*' || char === '/') {
      res.push({ type: 'OP', value: char });
      expectUnary = true;
      i++;
      continue;
    }

    if (char === '-') {
      if (expectUnary) {
        res.push({ type: 'UNARY_MINUS' });
      } else {
        res.push({ type: 'OP', value: '-' });
      }
      expectUnary = true;
      i++;
      continue;
    }

    if (char === 'x' || char === 'X') {
      res.push({ type: 'VAR' });
      expectUnary = false;
      i++;
      continue;
    }

    // Estrazione dei costrutti numerici (incluso supporto a formati del tipo 1e-5 o 2.3e+3)
    if ((char >= '0' && char <= '9') || char === '.') {
      let start = i;
      while (i < len) {
        const c = expr[i]!;
        if ((c >= '0' && c <= '9') || c === '.') {
          i++;
        } else if (c === 'e' || c === 'E') {
          i++;
          if (i < len && (expr[i] === '+' || expr[i] === '-')) {
            i++;
          }
        } else {
          break;
        }
      }
      const numStr = expr.substring(start, i);
      res.push({ type: 'NUM', value: numStr });
      expectUnary = false;
      continue;
    }

    i++; // Salta caratteri non supportati in modo sicuro
  }
  return res;
}

/**
 * Converte i token infissi in notazione postfissa (RPN) tramite l'algoritmo Shunting-Yard.
 */
function compileToRpn(expression: string): RpnToken[] {
  const tokens = tokenizeExpression(expression);
  const outputQueue: RpnToken[] = [];
  const operatorStack: InfixToken[] = [];

  const precedence: Record<string, number> = {
    '+': 1,
    '-': 1,
    '*': 2,
    '/': 2,
    'UNARY_MINUS': 3
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;

    if (token.type === 'NUM') {
      outputQueue.push({ type: 'NUM', value: parseFloat(token.value!) });
    } else if (token.type === 'VAR') {
      outputQueue.push({ type: 'VAR' });
    } else if (token.type === 'UNARY_MINUS') {
      operatorStack.push(token);
    } else if (token.type === 'OP') {
      const op = token.value!;
      while (
        operatorStack.length > 0 &&
        operatorStack[operatorStack.length - 1]!.type !== 'LPAREN'
      ) {
        const top = operatorStack[operatorStack.length - 1]!;
        const topKey = top.type === 'UNARY_MINUS' ? 'UNARY_MINUS' : (top.value ?? '');
        if ((precedence[topKey] ?? 0) >= precedence[op]!) {
          operatorStack.pop();
          if (top.type === 'UNARY_MINUS') {
            outputQueue.push({ type: 'UNARY_MINUS' });
          } else {
            outputQueue.push({ type: 'OP', op: top.value as any });
          }
        } else {
          break;
        }
      }
      operatorStack.push(token);
    } else if (token.type === 'LPAREN') {
      operatorStack.push(token);
    } else if (token.type === 'RPAREN') {
      while (
        operatorStack.length > 0 &&
        operatorStack[operatorStack.length - 1]!.type !== 'LPAREN'
      ) {
        const top = operatorStack.pop()!;
        if (top.type === 'UNARY_MINUS') {
          outputQueue.push({ type: 'UNARY_MINUS' });
        } else {
          outputQueue.push({ type: 'OP', op: top.value as any });
        }
      }
      operatorStack.pop(); // Rimuove '('
    }
  }

  while (operatorStack.length > 0) {
    const top = operatorStack.pop()!;
    if (top.type !== 'LPAREN') {
      if (top.type === 'UNARY_MINUS') {
        outputQueue.push({ type: 'UNARY_MINUS' });
      } else {
        outputQueue.push({ type: 'OP', op: top.value as any });
      }
    }
  }

  return outputQueue;
}

/**
 * Valutatore ultra-rapido basato su stack del bytecode RPN.
 */
function evaluateRpn(rpn: RpnToken[], variableValue: number): number {
  const stack: number[] = [];

  for (let i = 0; i < rpn.length; i++) {
    const t = rpn[i]!;
    if (t.type === 'NUM') {
      stack.push(t.value!);
    } else if (t.type === 'VAR') {
      stack.push(variableValue);
    } else if (t.type === 'UNARY_MINUS') {
      const val = stack.pop() ?? 0;
      stack.push(-val);
    } else if (t.type === 'OP') {
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

// Cache globale pre-compilata per le formule matematiche A2L/XDF
const rpnCache = new Map<string, RpnToken[]>();

function getOrCompileRpn(expression: string): RpnToken[] {
  let compiled = rpnCache.get(expression);
  if (!compiled) {
    compiled = compileToRpn(expression);
    rpnCache.set(expression, compiled);
  }
  return compiled;
}

/**
 * Gestore matematico e interprete dinamico delle equazioni di conversione.
 * Esegue il calcolo diretto e la risoluzione numerica (inversione) delle formule A2L/XDF.
 */
export class CompuMethod {
  /**
   * Converte il valore esadecimale grezzo (RAW) in unità ingegneristica reale (Physical).
   */
  public static rawToPhysical(raw: number, def: MapDefinition): number {
    if (def.formulaForward) {
      try {
        return this.evaluateExpression(def.formulaForward, raw);
      } catch {
        // Fallback in caso di errore di parsing della formula custom
      }
    }
    // Fallback standard lineare (aX + b)
    return raw * def.factor + def.offsetA2l;
  }

  /**
   * Converte l'unità ingegneristica reale (Physical) nel valore esadecimale grezzo (RAW).
   * Se non è dichiarata una formula inversa, risolve analiticamente o numericamente.
   */
  public static physicalToRaw(phys: number, def: MapDefinition): number {
    if (def.formulaReverse) {
      try {
        return Math.round(this.evaluateExpression(def.formulaReverse, phys));
      } catch {
        // Fallback
      }
    }

    if (def.formulaForward) {
      try {
        // Risoluzione numerica tramite Metodo delle Secanti o Bisezione
        return Math.round(this.solveNumericRoot(def.formulaForward, phys));
      } catch {
        // Fallback
      }
    }

    // Risoluzione lineare standard invertita: X = (Y - b) / a
    if (def.factor === 0) return phys - def.offsetA2l;
    return Math.round((phys - def.offsetA2l) / def.factor);
  }

  /**
   * Valuta in sicurezza un'espressione matematica compilando ed eseguendo l'RPN.
   */
  public static evaluateExpression(expression: string, variableValue: number): number {
    try {
      const rpn = getOrCompileRpn(expression);
      return evaluateRpn(rpn, variableValue);
    } catch {
      return variableValue;
    }
  }

  /**
   * Risolutore di radici numeriche ibrido (Secante + Bisezione) per invertire espressioni non-lineari.
   */
  private static solveNumericRoot(formula: string, targetPhys: number): number {
    const f = (x: number) => this.evaluateExpression(formula, x) - targetPhys;

    // Tentativo iniziale tramite Metodo delle Secanti
    let x0 = targetPhys;
    let x1 = targetPhys + 1.0;
    
    let f0 = f(x0);
    let f1 = f(x1);

    for (let iter = 0; iter < 80; iter++) {
      const denom = f1 - f0;
      if (Math.abs(denom) < 1e-12) {
        break; // Regione piatta, esce e ricorre alla bisezione di sicurezza
      }
      const xNext = x1 - f1 * (x1 - x0) / denom;
      if (isNaN(xNext) || !isFinite(xNext)) {
        break;
      }
      x0 = x1;
      f0 = f1;
      x1 = xNext;
      f1 = f(x1);
      if (Math.abs(f1) < 1e-6) {
        return x1;
      }
    }

    // Meccanismo di sicurezza: Bisezione (garantisce convergenza se i segni divergono) [1]
    let lower = targetPhys - 1000.0;
    let upper = targetPhys + 1000.0;
    let fLower = f(lower);
    let fUpper = f(upper);

    if (fLower * fUpper < 0) {
      for (let iter = 0; iter < 40; iter++) {
        const mid = lower + (upper - lower) / 2.0;
        const fMid = f(mid);
        if (Math.abs(fMid) < 1e-6) {
          return mid;
        }
        if (fLower * fMid < 0) {
          upper = mid;
          fUpper = fMid;
        } else {
          lower = mid;
          fLower = fMid;
        }
      }
      return lower + (upper - lower) / 2.0;
    }

    return x1;
  }
}