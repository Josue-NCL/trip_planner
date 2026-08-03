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
      'Entertainment',
      'Family',
      'Adventure',
      'Sightseeing',
      'Markets',
      'Beach & Water',
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
      'Entertainment',
      'Family',
      'Adventure',
      'Sightseeing',
      'Markets',
      'Beach & Water',
      'Work-friendly',
      'Open Time'
    ));
