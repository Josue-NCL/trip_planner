import { getCurrencyFractionDigits, normalizeCurrency } from "./money.js";

export const DEFAULT_JPY_PER_USD = 160;
export const DEFAULT_MXN_PER_USD = 18;

export const DEFAULT_BUDGET_EXCHANGE_RATES = Object.freeze([
  { id: "usd-jpy", fromCurrency: "USD", toCurrency: "JPY", rate: DEFAULT_JPY_PER_USD },
  { id: "usd-mxn", fromCurrency: "USD", toCurrency: "MXN", rate: DEFAULT_MXN_PER_USD }
]);

export function normalizeExchangeRate(value, fallbackRate = null) {
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : fallbackRate;
}

export function createDefaultBudgetExchangeRates(legacySettings = {}) {
  return DEFAULT_BUDGET_EXCHANGE_RATES.map((rate) => ({
    ...rate,
    rate: rate.toCurrency === "JPY"
      ? normalizeExchangeRate(legacySettings.jpyPerUsd, DEFAULT_JPY_PER_USD)
      : normalizeExchangeRate(legacySettings.mxnPerUsd, DEFAULT_MXN_PER_USD)
  }));
}

export function normalizeBudgetExchangeRates(exchangeRates = []) {
  if (!Array.isArray(exchangeRates)) {
    return createDefaultBudgetExchangeRates(exchangeRates);
  }

  const seenPairs = new Set();
  return exchangeRates.flatMap((exchangeRate, index) => {
    const fromCurrency = normalizeCurrency(exchangeRate?.fromCurrency ?? exchangeRate?.from);
    const toCurrency = normalizeCurrency(exchangeRate?.toCurrency ?? exchangeRate?.to);
    const rate = normalizeExchangeRate(exchangeRate?.rate ?? exchangeRate?.value);
    const pairKey = `${fromCurrency}-${toCurrency}`;

    if (!rate || fromCurrency === toCurrency || seenPairs.has(pairKey)) {
      return [];
    }

    seenPairs.add(pairKey);
    return [{
      id: String(exchangeRate?.id ?? `${pairKey.toLowerCase()}-${index + 1}`),
      fromCurrency,
      toCurrency,
      rate
    }];
  });
}

export function convertMoneyMinor(amountMinor, sourceCurrency = "JPY", targetCurrency = "JPY", exchangeRates = []) {
  const amount = Math.max(0, Number(amountMinor) || 0);
  const source = normalizeCurrency(sourceCurrency);
  const target = normalizeCurrency(targetCurrency);

  if (source === target) {
    return Math.round(amount);
  }

  const graph = buildExchangeGraph(normalizeBudgetExchangeRates(exchangeRates));
  const sourceMajor = amount / (10 ** getCurrencyFractionDigits(source));
  const queue = [{ currency: source, amount: sourceMajor }];
  const visited = new Set([source]);

  while (queue.length) {
    const current = queue.shift();
    const nextRates = graph.get(current.currency) ?? [];

    for (const nextRate of nextRates) {
      if (visited.has(nextRate.currency)) {
        continue;
      }

      const convertedAmount = current.amount * nextRate.rate;
      if (nextRate.currency === target) {
        return Math.round(convertedAmount * (10 ** getCurrencyFractionDigits(target)));
      }

      visited.add(nextRate.currency);
      queue.push({ currency: nextRate.currency, amount: convertedAmount });
    }
  }

  return null;
}

function buildExchangeGraph(exchangeRates) {
  const graph = new Map();
  const addRate = (fromCurrency, toCurrency, rate) => {
    const entries = graph.get(fromCurrency) ?? [];
    entries.push({ currency: toCurrency, rate });
    graph.set(fromCurrency, entries);
  };

  exchangeRates.forEach(({ fromCurrency, toCurrency, rate }) => {
    addRate(fromCurrency, toCurrency, rate);
    addRate(toCurrency, fromCurrency, 1 / rate);
  });

  return graph;
}
