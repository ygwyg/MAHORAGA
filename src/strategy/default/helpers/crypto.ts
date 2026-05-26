/**
 * Crypto symbol helpers for the default strategy.
 *
 * Pure functions — no side effects, no state.
 */

/** Normalize a crypto symbol to SYMBOL/QUOTE format (e.g., "BTCUSD" → "BTC/USD"). */
export function normalizeCryptoSymbol(symbol: string): string {
  if (symbol.includes("/")) {
    return symbol.toUpperCase();
  }
  const match = symbol.toUpperCase().match(/^([A-Z]{2,5})(USD|USDT|USDC)$/);
  if (match) {
    return `${match[1]}/${match[2]}`;
  }
  return symbol;
}

/** Check if a symbol is a configured crypto symbol. */
export function isCryptoSymbol(symbol: string, cryptoSymbols: string[]): boolean {
  const normalizedInput = normalizeCryptoSymbol(symbol);
  for (const configSymbol of cryptoSymbols) {
    if (normalizeCryptoSymbol(configSymbol) === normalizedInput) {
      return true;
    }
  }
  return /^[A-Z]{2,5}\/(USD|USDT|USDC)$/.test(normalizedInput);
}
