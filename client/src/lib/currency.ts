export interface ExchangeRate {
  id: number;
  usdToGuarani: string;
  updatedAt: string;
  updatedBy: number;
}

export function convertUsdToPyg(usdAmount: number, exchangeRate?: ExchangeRate | null, customRate?: string): number {
  const rate = customRate 
    ? parseFloat(customRate) 
    : (exchangeRate ? parseFloat(exchangeRate.usdToGuarani) : 7300);
  return Math.round(usdAmount * rate);
}

export function formatWithPyg(usdAmount: number | string, exchangeRate?: ExchangeRate | null, customRate?: string): string {
  const amount = typeof usdAmount === 'string' ? parseFloat(usdAmount) : usdAmount;
  const pygAmount = convertUsdToPyg(amount, exchangeRate, customRate);
  return `$${amount.toLocaleString()} USD (₲${pygAmount.toLocaleString('es-PY')} PYG)`;
}
