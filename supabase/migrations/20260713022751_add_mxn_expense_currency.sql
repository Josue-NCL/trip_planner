alter table public.trip_expenses
  drop constraint if exists trip_expenses_currency_check,
  add constraint trip_expenses_currency_check
    check (currency in ('JPY', 'USD', 'MXN'));
