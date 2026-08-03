import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Filter, Plus, ReceiptText, Settings2, Trash2, X } from "lucide-react";
import { EXPENSE_SOURCE_TYPES, calculateExpenseSummary, deriveExpenseSuggestions, getExpenseSourceKey } from "../../lib/expenses.js";
import { convertMoneyMinor, createDefaultBudgetExchangeRates, normalizeBudgetExchangeRates } from "../../lib/budgetCurrency.js";
import { getCategoryClassName } from "../../lib/categoryPresentation.js";
import { formatMoney, SUPPORTED_CURRENCIES } from "../../lib/money.js";

const BUDGET_CURRENCY_SETTINGS_KEY = "japan-2026-budget-currency:v1";
const BUDGET_CURRENCY_VIEWS = [
  { value: "native", label: "Original" },
  { value: "JPY", label: "JPY" },
  { value: "USD", label: "USD" },
  { value: "MXN", label: "MXN" }
];

function TagIcon({ src, size = "chip" }) {
  if (!src) {
    return null;
  }
  return <img className={`tag-icon tag-icon-${size}`} src={src} alt="" aria-hidden="true" draggable={false} />;
}

function getExpenseCategoryConfig(category, tagAssets) {
  return {
    className: getCategoryClassName(category),
    asset: tagAssets?.category?.[category] ?? tagAssets?.category?.["Open Time"] ?? ""
  };
}

function ExpensesSection({
  hidden = false,
  trip,
  status,
  expenses,
  travelers,
  tagAssets,
  currentTravelerClientId,
  onAddExpense,
  onTrackSuggestion,
  onEditExpense
}) {
  const [activeExpenseTab, setActiveExpenseTab] = useState("budget");
  const [budgetCategoryFilter, setBudgetCategoryFilter] = useState("All");
  const [budgetCurrencySettings, setBudgetCurrencySettings] = useState(() => readBudgetCurrencySettings());
  const [isBudgetCurrencySheetOpen, setIsBudgetCurrencySheetOpen] = useState(false);
  const travelerNameByClientId = useMemo(
    () => new Map(travelers.map((traveler) => [traveler.clientId, traveler.name])),
    [travelers]
  );
  const suggestions = useMemo(() => deriveExpenseSuggestions(trip, expenses), [trip, expenses]);
  const summary = useMemo(() => calculateExpenseSummary(expenses, travelers), [expenses, travelers]);
  const expenseSourceLookup = useMemo(() => buildExpenseSourceLookup(trip), [trip]);
  const budgetRows = useMemo(
    () => buildBudgetRows({ expenses, suggestions, sourceLookup: expenseSourceLookup }),
    [expenses, suggestions, expenseSourceLookup]
  );
  const budgetFilters = useMemo(() => buildBudgetFilters(budgetRows), [budgetRows]);
  const filteredBudgetRows = useMemo(
    () => budgetRows.filter((row) => budgetCategoryFilter === "All" || row.filterValue === budgetCategoryFilter),
    [budgetRows, budgetCategoryFilter]
  );
  const budgetCurrencyView = budgetCurrencySettings.view;
  const budgetExchangeRates = budgetCurrencySettings.exchangeRates;
  const budgetCurrencyLabel = BUDGET_CURRENCY_VIEWS.find((option) => option.value === budgetCurrencyView)?.label ?? "Original";
  const budgetTotalLabel = useMemo(
    () => formatBudgetTotal(budgetRows, budgetCurrencyView, budgetExchangeRates),
    [budgetRows, budgetCurrencyView, budgetExchangeRates]
  );
  const budgetDisplayRows = useMemo(
    () => filteredBudgetRows.map((row) => formatBudgetDisplayRow(row, budgetCurrencyView, budgetExchangeRates)),
    [filteredBudgetRows, budgetCurrencyView, budgetExchangeRates]
  );
  const primaryCurrency = summary.primaryCurrency;
  const currentBalance = currentTravelerClientId ? primaryCurrency.balancesByTraveler[currentTravelerClientId] ?? 0 : 0;
  const balanceTone = !currentTravelerClientId || currentBalance === 0
    ? "neutral"
    : currentBalance > 0
      ? "positive"
      : "negative";

  useEffect(() => {
    if (!budgetFilters.includes(budgetCategoryFilter)) {
      setBudgetCategoryFilter("All");
    }
  }, [budgetFilters, budgetCategoryFilter]);

  useEffect(() => {
    if (activeExpenseTab !== "budget") {
      setIsBudgetCurrencySheetOpen(false);
    }
  }, [activeExpenseTab]);

  function updateBudgetCurrencySettings(nextSettings) {
    const nextValue = { ...budgetCurrencySettings, ...nextSettings };
    setBudgetCurrencySettings(nextValue);
    writeBudgetCurrencySettings(nextValue);
  }

  return (
    <section className="expenses-section" aria-label="Trip expenses" hidden={hidden}>
      <div className="ideas-section-header expenses-section-header">
        <div>
          <h1>Expenses</h1>
          <p>{budgetRows.length} budget items</p>
        </div>
        <button className="primary-button desktop-section-action" type="button" onClick={onAddExpense}>
          <Plus size={17} />
          Add expense
        </button>
      </div>

      <button className="mobile-fab-action" type="button" aria-label="Add expense" title="Add expense" onClick={onAddExpense}>
        <Plus size={22} />
        <span>Add expense</span>
      </button>

      <div className="expenses-workspace">
        <div className={`expense-toolbar ${activeExpenseTab === "budget" ? "has-currency-trigger" : ""}`}>
          <div className="expense-view-tabs" role="tablist" aria-label="Expense views">
            <button className={activeExpenseTab === "budget" ? "is-active" : ""} type="button" role="tab" aria-selected={activeExpenseTab === "budget"} onClick={() => setActiveExpenseTab("budget")}>
              Trip budget
            </button>
            <button className={activeExpenseTab === "split" ? "is-active" : ""} type="button" role="tab" aria-selected={activeExpenseTab === "split"} onClick={() => setActiveExpenseTab("split")}>
              Split
            </button>
          </div>

          {activeExpenseTab === "budget" ? (
            <button className="expense-currency-settings-trigger" type="button" onClick={() => setIsBudgetCurrencySheetOpen(true)}>
              <Settings2 size={16} aria-hidden="true" />
              <span>Currency settings</span>
              <strong>{budgetCurrencyLabel}</strong>
            </button>
          ) : null}
        </div>

        {activeExpenseTab === "budget" ? (
          <section className="expense-panel expense-budget-panel" aria-label="Trip budget" role="tabpanel">
            <div className="expense-budget-hero">
              <div>
                <span>Trip budget</span>
                <h2>Estimated total</h2>
                <p>Tracked expenses plus planned trip costs. Treat this as a working estimate.</p>
              </div>
              <div className="expense-budget-total">
                <strong>{budgetTotalLabel}</strong>
                <span>{budgetRows.length} budget items</span>
              </div>
            </div>
            <ExpenseBudgetFilters filters={budgetFilters} activeFilter={budgetCategoryFilter} tagAssets={tagAssets} onChange={setBudgetCategoryFilter} />
            <div className="expense-budget-list">
              {budgetDisplayRows.map((row) => (
                <BudgetExpenseRow
                  row={row}
                  key={row.id}
                  tagAssets={tagAssets}
                  onTrack={row.suggestion ? () => onTrackSuggestion(row.suggestion) : null}
                  onEdit={row.expense ? () => onEditExpense(row.expense) : null}
                />
              ))}
              {!budgetRows.length ? <p className="expense-empty">Add costs to activities, ideas, hotels, flights, or manual expenses to build a trip estimate.</p> : null}
              {budgetRows.length && !filteredBudgetRows.length ? <p className="expense-empty">No budget items match this filter.</p> : null}
            </div>
          </section>
        ) : (
          <>
            <div className="expense-summary-grid expense-split-summary" role="tabpanel" aria-label="Split summary">
              <ExpenseMetric label="Tracked total" value={formatMoneyList(summary.currencies)} />
              <ExpenseMetric className={`is-balance-${balanceTone}`} label="My balance" value={currentTravelerClientId ? formatSignedMoney(currentBalance, primaryCurrency.currency) : "Choose traveler"} detail={balanceTone === "positive" ? "You are owed" : balanceTone === "negative" ? "You owe" : "Settled for now"} />
            </div>

            <div className="expenses-columns expense-split-columns">
              <section className="expense-panel" aria-label="Tracked split expenses">
                <div className="expense-panel-heading">
                  <div>
                    <h2>Split expenses</h2>
                    <p>Real amounts used for paid/owed calculations.</p>
                  </div>
                </div>
                <div className="tracked-expense-list">
                  {expenses.map((expense) => (
                    <ExpenseRow
                      expense={expense}
                      key={expense.clientId}
                      travelerNameByClientId={travelerNameByClientId}
                      onEdit={() => onEditExpense(expense)}
                    />
                  ))}
                  {!expenses.length ? <p className="expense-empty">Add a split expense or track a budget item to start settlement math.</p> : null}
                </div>
              </section>

              <section className="expense-panel settlement-panel" aria-label="Settlement recommendations">
                <div className="expense-panel-heading">
                  <div>
                    <h2>Settlement</h2>
                    <p>Based on all tracked split expenses.</p>
                  </div>
                </div>
                <div className="settlement-list">
                  {summary.currencies.flatMap((currencySummary) =>
                    currencySummary.settlements.map((settlement) => (
                      <div className="settlement-row" key={`${settlement.currency}-${settlement.fromTravelerClientId}-${settlement.toTravelerClientId}-${settlement.amountMinor}`}>
                        <span>{settlement.fromName}</span>
                        <ArrowRight size={16} />
                        <span>{settlement.toName}</span>
                        <strong>{formatMoney(settlement.amountMinor, settlement.currency)}</strong>
                      </div>
                    ))
                  )}
                  {expenses.length && !summary.currencies.some((currencySummary) => currencySummary.settlements.length) ? (
                    <p className="expense-empty">Everyone is even.</p>
                  ) : null}
                  {!expenses.length ? <p className="expense-empty">No settlement needed yet.</p> : null}
                </div>
              </section>
            </div>
          </>
        )}
      </div>

      {activeExpenseTab === "budget" && isBudgetCurrencySheetOpen ? (
        <div className="expense-currency-sheet-backdrop" role="presentation" onClick={() => setIsBudgetCurrencySheetOpen(false)}>
          <div className="expense-currency-sheet" role="dialog" aria-modal="true" aria-label="Currency settings" onClick={(event) => event.stopPropagation()}>
            <div className="expense-currency-sheet-header">
              <div>
                <strong>Currency settings</strong>
                <small>Choose how your trip budget is displayed.</small>
              </div>
              <button className="icon-button" type="button" aria-label="Close currency settings" data-dialog-close onClick={() => setIsBudgetCurrencySheetOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <BudgetCurrencyControls budgetCurrencyView={budgetCurrencyView} budgetCurrencySettings={budgetCurrencySettings} onChange={updateBudgetCurrencySettings} />
            <div className="expense-currency-sheet-actions">
              <button className="primary-button" type="button" onClick={() => setIsBudgetCurrencySheetOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function BudgetCurrencyControls({ budgetCurrencyView, budgetCurrencySettings, onChange }) {
  const exchangeRates = budgetCurrencySettings.exchangeRates;

  function updateExchangeRate(id, field, value) {
    onChange({
      exchangeRates: exchangeRates.map((exchangeRate) => (
        exchangeRate.id === id ? { ...exchangeRate, [field]: value } : exchangeRate
      ))
    });
  }

  function addExchangeRate() {
    const id = `rate-${Date.now()}-${exchangeRates.length + 1}`;
    onChange({
      exchangeRates: [...exchangeRates, { id, fromCurrency: "USD", toCurrency: "JPY", rate: "" }]
    });
  }

  return (
    <div className="expense-currency-sheet-body">
      <label className="expense-currency-display-select">
        <span>Display budget in</span>
        <select value={budgetCurrencyView} onChange={(event) => onChange({ view: event.target.value })}>
          {BUDGET_CURRENCY_VIEWS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
        </select>
      </label>
      <div className="expense-exchange-rates">
        <div className="expense-exchange-rates-heading">
          <div>
            <strong>Exchange rates</strong>
            <small>Set the amount of the second currency for one of the first.</small>
          </div>
          <button className="expense-add-exchange-rate" type="button" onClick={addExchangeRate}>
            <Plus size={15} />
            Add exchange rate
          </button>
        </div>
        <div className="expense-exchange-rate-list">
          {exchangeRates.map((exchangeRate) => (
            <div className="expense-exchange-rate-row" key={exchangeRate.id}>
              <label>
                <span>From</span>
                <select value={exchangeRate.fromCurrency} aria-label="From currency" onChange={(event) => updateExchangeRate(exchangeRate.id, "fromCurrency", event.target.value)}>
                  {SUPPORTED_CURRENCIES.map((currency) => <option value={currency} key={currency}>{currency}</option>)}
                </select>
              </label>
              <ArrowRight className="expense-exchange-rate-arrow" size={18} aria-hidden="true" />
              <label>
                <span>To</span>
                <select value={exchangeRate.toCurrency} aria-label="To currency" onChange={(event) => updateExchangeRate(exchangeRate.id, "toCurrency", event.target.value)}>
                  {SUPPORTED_CURRENCIES.map((currency) => <option value={currency} key={currency}>{currency}</option>)}
                </select>
              </label>
              <label className="expense-exchange-rate-value">
                <span>Exchange rate</span>
                <input type="number" min="0.0001" step="any" inputMode="decimal" value={exchangeRate.rate} onChange={(event) => updateExchangeRate(exchangeRate.id, "rate", event.target.value)} />
              </label>
              <button className="icon-button expense-exchange-rate-remove" type="button" aria-label={`Remove ${exchangeRate.fromCurrency} to ${exchangeRate.toCurrency} exchange rate`} title="Remove exchange rate" onClick={() => onChange({ exchangeRates: exchangeRates.filter((rate) => rate.id !== exchangeRate.id) })}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {!exchangeRates.length ? <p className="expense-exchange-rate-empty">No exchange rates saved. Add one before converting a mixed-currency budget.</p> : null}
        </div>
      </div>
    </div>
  );
}

function ExpenseBudgetFilters({ filters, activeFilter, tagAssets, onChange }) {
  if (filters.length <= 1) {
    return null;
  }

  return (
    <div className="category-filters expense-budget-filters" aria-label="Expense category filters">
      <span className="category-filter-label">
        <Filter size={15} />
        Category
      </span>
      <div className="category-filter-options">
        {filters.map((filter) => {
          const config = filter === "All" || filter === "Expense" ? null : getExpenseCategoryConfig(filter, tagAssets);
          return (
            <button className={activeFilter === filter ? "is-active" : ""} type="button" key={filter} onClick={() => onChange(filter)}>
              {config?.asset ? <TagIcon src={config.asset} size="tiny" /> : null}
              {filter}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ExpenseMetric({ label, value, detail = "", className = "" }) {
  return (
    <div className={`expense-metric${className ? ` ${className}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function BudgetExpenseRow({ row, tagAssets, onTrack, onEdit }) {
  const config = row.category ? getExpenseCategoryConfig(row.category, tagAssets) : null;
  const content = (
    <>
      <span className={`budget-expense-type category-${config?.className ?? "expense"}`}>
        <span className="budget-expense-type-icon">
          {config?.asset ? <TagIcon src={config.asset} size="tiny" /> : <ReceiptText size={14} />}
        </span>
        <span>{row.typeLabel}</span>
      </span>
      <div className="budget-expense-main">
        <strong>{row.title}</strong>
        <small>{row.context || (row.isEstimate ? "Planned cost" : "Tracked expense")}</small>
      </div>
      <div className="budget-expense-cost">
        <strong>{row.displayAmountLabel ?? row.amountLabel}</strong>
        <small>{row.displayMetaLabel ?? (row.isEstimate ? "Estimate" : "Tracked")}</small>
        {onTrack ? (
          <button className="ghost-button compact-action" type="button" onClick={onTrack}>
            Track split
          </button>
        ) : null}
      </div>
    </>
  );

  if (onEdit) {
    return <button className={`budget-expense-row is-editable${row.isEstimate ? " is-estimate" : ""}`} type="button" onClick={onEdit} aria-label={`Edit expense: ${row.title}`}>{content}</button>;
  }

  return <article className={`budget-expense-row${row.isEstimate ? " is-estimate" : ""}`}>{content}</article>;
}
function buildExpenseSourceLookup(trip) {
  const lookup = new Map();
  let sortIndex = 0;

  (trip?.days ?? []).forEach((day) => {
    (day.schedule ?? []).forEach((item) => {
      lookup.set(getExpenseSourceKey(EXPENSE_SOURCE_TYPES.SCHEDULE_ITEM, item.id), {
        title: item.title,
        category: item.category,
        city: item.city || day.city,
        date: day.date,
        sourceLabel: `Day ${day.dayNumber}`,
        sortIndex
      });
      sortIndex += 1;
    });
  });

  (trip?.ideas ?? []).forEach((idea) => {
    lookup.set(getExpenseSourceKey(EXPENSE_SOURCE_TYPES.IDEA, idea.id), {
      title: idea.title,
      category: idea.category,
      city: idea.city,
      date: "",
      sourceLabel: "Idea",
      sortIndex
    });
    sortIndex += 1;
  });

  return lookup;
}

function buildBudgetRows({ expenses = [], suggestions = [], sourceLookup = new Map() }) {
  const trackedRows = expenses.map((expense, index) => {
    const source = expense.sourceClientId ? sourceLookup.get(getExpenseSourceKey(expense.sourceType, expense.sourceClientId)) : null;
    const category = source?.category || deriveBudgetCategory(expense.sourceType);
    return {
      id: `tracked-${expense.clientId}`,
      title: expense.title || source?.title || "Untitled expense",
      typeLabel: deriveBudgetTypeLabel({ sourceType: expense.sourceType, category }),
      category,
      context: [source?.sourceLabel || formatSourceType(expense.sourceType), source?.city, expense.expenseDate].filter(Boolean).join(" · "),
      amountMinor: expense.amountMinor,
      currency: expense.currency,
      amountLabel: formatMoney(expense.amountMinor, expense.currency),
      filterValue: category || "Expense",
      sortDate: source?.date || expense.expenseDate || "",
      sortIndex: source?.sortIndex ?? 10000 + index,
      isEstimate: false,
      expense
    };
  });

  const estimateRows = suggestions.map((suggestion, index) => {
    const category = suggestion.category || deriveBudgetCategory(suggestion.sourceType);
    return {
      id: `estimate-${suggestion.sourceType}-${suggestion.sourceClientId}`,
      title: suggestion.title || "Untitled cost",
      typeLabel: deriveBudgetTypeLabel({ sourceType: suggestion.sourceType, category }),
      category,
      context: [suggestion.sourceLabel, suggestion.city].filter(Boolean).join(" · "),
      amountMinor: suggestion.parsedCost?.amountMinor ?? 0,
      currency: suggestion.parsedCost?.currency ?? "JPY",
      amountLabel: suggestion.parsedCost ? formatMoney(suggestion.parsedCost.amountMinor, suggestion.parsedCost.currency) : suggestion.rawCost,
      filterValue: category || "Expense",
      sortDate: suggestion.date || "",
      sortIndex: 20000 + index,
      isEstimate: true,
      suggestion
    };
  });

  return [...trackedRows, ...estimateRows].sort((a, b) => {
    if (a.sortDate && b.sortDate && a.sortDate !== b.sortDate) {
      return a.sortDate.localeCompare(b.sortDate);
    }
    if (a.sortDate !== b.sortDate) {
      return a.sortDate ? -1 : 1;
    }
    return a.sortIndex - b.sortIndex;
  });
}

function buildBudgetFilters(rows = []) {
  const filters = rows.reduce((list, row) => {
    if (row.filterValue && !list.includes(row.filterValue)) {
      list.push(row.filterValue);
    }
    return list;
  }, []);

  return ["All", ...filters];
}

function summarizeBudgetRows(rows = []) {
  const totalsByCurrency = new Map();
  rows.forEach((row) => {
    if (!row.amountMinor || row.amountMinor <= 0) {
      return;
    }
    totalsByCurrency.set(row.currency, (totalsByCurrency.get(row.currency) ?? 0) + row.amountMinor);
  });

  return Array.from(totalsByCurrency.entries()).map(([currency, total]) => ({ currency, total }));
}

function formatBudgetTotal(rows = [], currencyView = "native", rates = {}) {
  if (currencyView === "native") {
    return formatMoneyList(summarizeBudgetRows(rows));
  }

  const normalizedView = ["JPY", "USD", "MXN"].includes(currencyView) ? currencyView : "JPY";
  const summary = rows.reduce((result, row) => {
    if (!row.amountMinor || row.amountMinor <= 0) {
      return result;
    }
    const convertedAmount = convertMoneyMinor(row.amountMinor, row.currency, normalizedView, rates);
    if (convertedAmount === null) {
      return { ...result, hasMissingRate: true };
    }
    return { ...result, total: result.total + convertedAmount };
  }, { total: 0, hasMissingRate: false });

  if (summary.hasMissingRate && summary.total === 0) {
    return "Rate needed";
  }

  return `~${formatMoney(summary.total, normalizedView)}${summary.hasMissingRate ? " · rate needed" : ""}`;
}

function formatBudgetDisplayRow(row, currencyView = "native", rates = {}) {
  if (currencyView === "native" || !row.amountMinor || row.amountMinor <= 0) {
    return {
      ...row,
      displayAmountLabel: row.amountLabel,
      displayMetaLabel: row.isEstimate ? "Estimate" : "Tracked"
    };
  }

  const normalizedView = ["JPY", "USD", "MXN"].includes(currencyView) ? currencyView : "JPY";
  const convertedAmount = convertMoneyMinor(row.amountMinor, row.currency, normalizedView, rates);
  const baseMeta = row.isEstimate ? "Estimate" : "Tracked";

  if (convertedAmount === null) {
    return {
      ...row,
      displayAmountLabel: row.amountLabel,
      displayMetaLabel: `${baseMeta} · ${row.currency} → ${normalizedView} rate needed`
    };
  }

  return {
    ...row,
    displayAmountLabel: `~${formatMoney(convertedAmount, normalizedView)}`,
    displayMetaLabel: row.currency === normalizedView ? baseMeta : `${baseMeta} · from ${row.currency}`
  };
}

function deriveBudgetCategory(sourceType) {
  if (sourceType === EXPENSE_SOURCE_TYPES.SCHEDULE_ITEM) {
    return "";
  }
  if (sourceType === EXPENSE_SOURCE_TYPES.IDEA) {
    return "";
  }
  return "";
}

function deriveBudgetTypeLabel({ sourceType, category }) {
  if (sourceType === EXPENSE_SOURCE_TYPES.MANUAL) {
    return "Expense";
  }
  if (category) {
    return category;
  }
  if (sourceType === EXPENSE_SOURCE_TYPES.SCHEDULE_ITEM) {
    return "Activity expense";
  }
  if (sourceType === EXPENSE_SOURCE_TYPES.IDEA) {
    return "Idea expense";
  }
  return "Expense";
}

function ExpenseRow({ expense, travelerNameByClientId, onEdit }) {
  const paidByName = travelerNameByClientId.get(expense.paidByTravelerClientId) ?? "Traveler";
  const participants = expense.participantTravelerClientIds
    .map((clientId) => travelerNameByClientId.get(clientId))
    .filter(Boolean)
    .join(", ");

  return (
    <article className="tracked-expense-row">
      <button className="tracked-expense-main" type="button" onClick={onEdit}>
        <span>
          <strong>{expense.title}</strong>
          <small>{[expense.expenseDate, formatSourceType(expense.sourceType)].filter(Boolean).join(" · ") || "Manual"}</small>
        </span>
        <span>
          <strong>{formatMoney(expense.amountMinor, expense.currency)}</strong>
          <small>Paid by: {paidByName}</small>
        </span>
        <small>Split: {participants || "No one selected"}</small>
      </button>
    </article>
  );
}
function formatMoneyList(currencySummaries = []) {
  const totals = currencySummaries
    .filter((summary) => summary.total > 0)
    .map((summary) => formatMoney(summary.total, summary.currency));
  return totals.length ? totals.join(" + ") : formatMoney(0, "JPY");
}

function formatSignedMoney(amountMinor, currency) {
  if (amountMinor === 0) {
    return formatMoney(0, currency);
  }
  const prefix = amountMinor > 0 ? "+" : "-";
  return `${prefix}${formatMoney(Math.abs(amountMinor), currency)}`;
}

function formatSourceType(sourceType) {
  if (sourceType === "schedule_item") {
    return "Activity";
  }
  if (sourceType === "idea") {
    return "Idea";
  }
  return "Manual";
}

function readBudgetCurrencySettings() {
  if (typeof window === "undefined") {
    return { view: "native", exchangeRates: createDefaultBudgetExchangeRates() };
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(BUDGET_CURRENCY_SETTINGS_KEY) ?? "{}");
    const view = BUDGET_CURRENCY_VIEWS.some((option) => option.value === parsed.view) ? parsed.view : "native";
    return {
      view,
      exchangeRates: Array.isArray(parsed.exchangeRates)
        ? normalizeBudgetExchangeRates(parsed.exchangeRates)
        : createDefaultBudgetExchangeRates(parsed)
    };
  } catch {
    return { view: "native", exchangeRates: createDefaultBudgetExchangeRates() };
  }
}

function writeBudgetCurrencySettings(settings) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const view = BUDGET_CURRENCY_VIEWS.some((option) => option.value === settings.view) ? settings.view : "native";
    window.localStorage.setItem(BUDGET_CURRENCY_SETTINGS_KEY, JSON.stringify({
      view,
      exchangeRates: normalizeBudgetExchangeRates(settings.exchangeRates)
    }));
  } catch {
    // Currency display preferences are local-only and safe to lose.
  }
}


export default ExpensesSection;
