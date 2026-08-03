alter table public.schedule_items
  drop constraint if exists schedule_items_category_check,
  add constraint schedule_items_category_check
    check (category in (
      'Food',
      'Coffee/Bar',
      'Culture',
      'Transit',
      'Hotel',
      'Shopping',
      'Nature',
      'Nightlife',
      'Wellness',
      'Beauty',
      'Entertainment',
      'Family',
      'Adventure',
      'Sightseeing',
      'Markets',
      'Work-friendly',
      'Open Time'
    ));

alter table public.ideas
  drop constraint if exists ideas_category_check,
  add constraint ideas_category_check
    check (category in (
      'Food',
      'Coffee/Bar',
      'Culture',
      'Transit',
      'Hotel',
      'Shopping',
      'Nature',
      'Nightlife',
      'Wellness',
      'Beauty',
      'Entertainment',
      'Family',
      'Adventure',
      'Sightseeing',
      'Markets',
      'Work-friendly',
      'Open Time'
    ));

do $migration$
declare
  function_oid regprocedure := to_regprocedure('public.replace_trip_payload(bigint,jsonb)');
  function_sql text;
  updated_function_sql text;
  old_clause constant text :=
    'where category not in (''Food'', ''Coffee/Bar'', ''Culture'', ''Transit'', ''Hotel'', ''Shopping'', ''Nature'', ''Nightlife'', ''Wellness'', ''Entertainment'', ''Family'', ''Adventure'', ''Sightseeing'', ''Markets'', ''Beach & Water'', ''Work-friendly'', ''Open Time'')';
  new_clause constant text :=
    'where category not in (''Food'', ''Coffee/Bar'', ''Culture'', ''Transit'', ''Hotel'', ''Shopping'', ''Nature'', ''Nightlife'', ''Wellness'', ''Beauty'', ''Entertainment'', ''Family'', ''Adventure'', ''Sightseeing'', ''Markets'', ''Work-friendly'', ''Open Time'')';
  occurrence_count integer;
begin
  if function_oid is null then
    raise exception 'public.replace_trip_payload(bigint,jsonb) does not exist';
  end if;

  select pg_get_functiondef(function_oid::oid)
  into function_sql;

  occurrence_count :=
    (length(function_sql) - length(replace(function_sql, old_clause, '')))
    / length(old_clause);

  if occurrence_count <> 2 then
    raise exception
      'Expected two Beach & Water validations in replace_trip_payload, found %',
      occurrence_count;
  end if;

  updated_function_sql := replace(function_sql, old_clause, new_clause);
  execute updated_function_sql;
end
$migration$;
