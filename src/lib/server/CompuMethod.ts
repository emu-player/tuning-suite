import type { MapDefinition } from '@/types/calibration';

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
        // Risoluzione numerica tramite Metodo delle Secanti: f(raw) - phys = 0
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
   * Valuta in sicurezza un'espressione matematica per evitare rischi di iniezione di codice (RCE).
   * Supporta operatori algebrici di base e parentesi.
   */
  public static evaluateExpression(expression: string, variableValue: number): number {
    // Normalizzazione dell'espressione
    const cleanExpr = expression.replace(/\s+/g, '').toLowerCase().replace(/x/g, String(variableValue));
    
    // Parser matematico per scomposizione dei token
    const tokens = cleanExpr.match(/(\d+(\.\d+)?|\+|\-|\*|\/|\(|\))/g);
    if (!tokens) return variableValue;

    return this.parseAndEvaluate(tokens);
  }

  /**
   * Risolutore di radici numeriche per invertire espressioni complesse o funzioni razionali (ASAM RAT_FUNC).
   */
  private static solveNumericRoot(formula: string, targetPhys: number): number {
    const f = (x: number) => this.evaluateExpression(formula, x) - targetPhys;

    // Approssimazione iniziale (Secant Method)
    let x0 = targetPhys;
    let x1 = targetPhys + 1.0;
    
    let f0 = f(x0);
    let f1 = f(x1);

    for (let iter = 0; iter < 100; iter++) {
      if (Math.abs(f1 - f0) < 1e-10) {
        break;
      }
      const xNext = x1 - f1 * (x1 - x0) / (f1 - f0);
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
    return x1;
  }

  /**
   * Valutatore di token algebrici basato su precedenza degli operatori.
   */
  private static parseAndEvaluate(tokens: string[]): number {
    const values: number[] = [];
    const ops: string[] = [];

    const precedence = (op: string): number => {
      if (op === '+' || op === '-') return 1;
      if (op === '*' || op === '/') return 2;
      return 0;
    };

    const applyOp = () => {
      const op = ops.pop();
      if (!op) return;
      const b = values.pop() ?? 0;
      const a = values.pop() ?? 0;
      if (op === '+') values.push(a + b);
      else if (op === '-') values.push(a - b);
      else if (op === '*') values.push(a * b);
      else if (op === '/') values.push(b === 0 ? 0 : a / b);
    };

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token) continue;

      if (token === '(') {
        ops.push(token);
      } else if (token === ')') {
        while (ops.length > 0 && ops[ops.length - 1] !== '(') {
          applyOp();
        }
        ops.pop(); // Rimuove '('
      } else if (['+', '-', '*', '/'].includes(token)) {
        while (ops.length > 0 && precedence(ops[ops.length - 1] ?? '') >= precedence(token)) {
          applyOp();
        }
        ops.push(token);
      } else {
        values.push(parseFloat(token));
      }
    }

    while (ops.length > 0) {
      applyOp();
    }

    return values[0] ?? 0;
  }
}
