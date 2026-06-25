# Japan Travel Tag Icon Assets

This folder contains small transparent PNG illustrations for the Japan 2026 travel planner. They are intended as lead icons for tags, labels, chips, itinerary cards, empty states, and compact metadata rows.

## Style

- Format: transparent PNG
- Size: 256x256 px
- Default visual language: soft Japanese travel illustration, navy outlines, red accents, pale-blue shadows, warm cream highlights
- Generic visual language: same navy/red/blue illustration system, but without Japan-specific motifs
- Best display size: 18-32 px for chips/labels, 40-64 px for empty states or larger card accents
- Intended pairing: icon + short text label, such as `Food`, `Booked`, or `Budget`

## Theme Packs

Two matching theme packs are available:

| Theme | Filename Pattern | Use When |
| --- | --- | --- |
| Japan-specific | `tag-food.png`, `tag-booked.png` | The planner should feel tailored to the Japan trip |
| Generic travel | `tag-food-generic.png`, `tag-booked-generic.png` | The planner needs a less destination-specific theme |

The generic files preserve the same semantic names and suggested uses as the default files, with `-generic` added before `.png`.

## Category Icons

| File | Meaning | Suggested Uses |
| --- | --- | --- |
| `tag-food.png` | Food, meals, cafes, snacks | Category chips, meal itinerary blocks, food idea cards |
| `tag-culture.png` | Temples, shrines, museums, cultural visits | Category chips, sightseeing items, cultural itinerary blocks |
| `tag-transit.png` | Trains, airport transfers, route movement | Transit category chips, travel-day blocks, route notes |
| `tag-hotel.png` | Lodging, ryokan, hotels, check-in/check-out | Hotel category chips, stay cards, reservation rows |
| `tag-shopping.png` | Shops, souvenirs, markets | Shopping category chips, saved shopping ideas |
| `tag-open-time.png` | Flexible free time, buffers, unscheduled windows | Open-time category chips, rest windows, day buffers |

## Trip Tool Icons

| File | Meaning | Suggested Uses |
| --- | --- | --- |
| `tag-reservation.png` | Reservation or confirmation | Booking details, confirmation links, reserved itinerary blocks |
| `tag-map-pin.png` | Location, map, route point | City/location metadata, map links, neighborhood tags |
| `tag-calendar.png` | Date or schedule | Date selectors, day cards, schedule metadata |
| `tag-budget.png` | Cost, budget, yen, spending | Cost fields, budget filters, price notes |
| `tag-notes.png` | Notes or reminders | Notes fields, itinerary detail sections, todo items |
| `tag-link.png` | URL, reference, external link | Saved links, source/reference metadata, external booking links |

## Status And Planning Icons

| File | Meaning | Suggested Uses |
| --- | --- | --- |
| `tag-booked.png` | Confirmed or booked | Booked status chip, confirmed reservations, locked itinerary items |
| `tag-maybe.png` | Maybe, undecided, tentative | Maybe status chip, undecided ideas, compare-later lists |
| `tag-favorite.png` | Favorite, loved, high-interest | Vote/love badges, favorites, must-discuss ideas |
| `tag-skipped.png` | Skipped or removed from plan | Skipped status chip, archived ideas, lower-priority options |
| `tag-priority.png` | Priority or important | Must-do flags, high-priority itinerary items |
| `tag-flexible.png` | Flexible timing or movable plan | Flexible blocks, movable schedule items, buffer-friendly activities |

## Implementation Notes For Codex

- These icons already include transparency. Do not add a background unless the UI needs one.
- Prefer using them as decorative `img` elements with meaningful nearby text, not as the only accessible label.
- Good default CSS for chips:

```css
.tag-icon {
  width: 1.25rem;
  height: 1.25rem;
  object-fit: contain;
  flex: 0 0 auto;
}
```

- In Vite/React, public assets can be referenced with `import.meta.env.BASE_URL`, for example `${import.meta.env.BASE_URL}assets/icons/tag-food.png`.
- Generic theme assets use the same path pattern, for example `${import.meta.env.BASE_URL}assets/icons/tag-food-generic.png`.
- The existing app also uses lucide icons. Use these PNGs where a warmer illustrated tag style is desired, and lucide icons where controls/actions need compact symbol clarity.
