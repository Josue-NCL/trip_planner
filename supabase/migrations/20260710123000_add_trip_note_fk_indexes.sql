create index if not exists trip_notes_author_profile_id_idx
  on public.trip_notes(author_profile_id);

create index if not exists trip_notes_trip_day_id_idx
  on public.trip_notes(trip_day_id)
  where trip_day_id is not null;
