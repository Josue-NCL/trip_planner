import { JPY, USD, dinero, toSnapshot } from "dinero.js";

export const SUPPORTED_CURRENCIES = ["JPY", "USD"];

const CURRENCY_DEFINITIONS = {
  JPY,
  USD
};

const CURRENCY_FRACTION_DIGITS = {
  JPY: 0,
  USD: 2
};

const VAGUE_COST_PATTERN = /\b(tbd|unknown|varies|variable|included|free|n\/a|none)\b/i;

export function makeMoney(amountMinor, currency = "JPY") {
  return dinero({
    amount: Number(amountMinor) || 0,
    currency: CURRENCY_DEFINITIONS[normalizeCurrency(currency)]
  });
}

export function formatMoney(amountMinor, currency = "JPY") {
  const normalizedCurrency = normalizeCurrency(currency);
  const snapshot = toSnapshot(makeMoney(amountMinor, normalizedCurrency));
  const fractionDigits = CURRENCY_FRACTION_DIGITS[normalizedCurrency];
  const majorAmount = snapshot.amount / (10 ** fractionDigits);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: normalizedCurrency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(majorAmount);
}

export function formatMajorAmount(amountMinor, currency = "JPY") {
  const normalizedCurrency = normalizeCurrency(currency);
  const fractionDigits = CURRENCY_FRACTION_DIGITS[normalizedCurrency];
  const majorAmount = Number(amountMinor || 0) / (10 ** fractionDigits);
  return majorAmount.toFixed(fractionDigits);
}

export function parseMoneyValue(value, defaultCurrency = "JPY") {
  const rawValue = String(value ?? "").trim();
  if (!rawValue || VAGUE_COST_PATTERN.test(rawValue)) {
    return null;
  }

  const currency = detectCurrency(rawValue, defaultCurrency);
  if (!currency || isOnlyCurrencySymbols(rawValue)) {
    return null;
  }

  const amountMatch = rawValue.replace(/[,\s]/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!amountMatch) {
    return null;
  }

  const amount = Number(amountMatch[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const fractionDigits = CURRENCY_FRACTION_DIGITS[currency];
  return {
    amountMinor: Math.round(amount * (10 ** fractionDigits)),
    currency
  };
}

export function splitAmountEvenly(amountMinor, participantClientIds = []) {
  const normalizedAmount = Math.max(0, Math.trunc(Number(amountMinor) || 0));
  const participants = participantClientIds.filter(Boolean);
  if (!participants.length) {
    return [];
  }

  const baseShare = Math.floor(normalizedAmount / participants.length);
  let remainder = normalizedAmount % participants.length;

  return participants.map((travelerClientId) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return {
      travelerClientId,
      shareAmountMinor: baseShare + extra
    };
  });
}

export function normalizeCurrency(currency = "JPY") {
  const normalized = String(currency || "JPY").trim().toUpperCase();
  return SUPPORTED_CURRENCIES.includes(normalized) ? normalized : "JPY";
}

function detectCurrency(value, defaultCurrency) {
  const upperValue = value.toUpperCase();
  if (upperValue.includes("USD") || value.includes("$")) {
    return "USD";
  }
  if (upperValue.includes("JPY") || upperValue.includes("YEN") || value.includes("¥")) {
    return "JPY";
  }
  return normalizeCurrency(defaultCurrency);
}

function isOnlyCurrencySymbols(value) {
  return /^[\s$¥￥]+$/.test(value);
}
