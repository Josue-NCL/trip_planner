export const TRIP_VERSION = 1;

export const CATEGORIES = ["Food", "Culture", "Transit", "Hotel", "Shopping", "Open Time"];
export const STATUSES = ["Proposed", "Maybe", "Booked", "Skipped"];
export const TRAVELERS = ["Me", "Wife"];

const tripDates = [
  "2026-09-25",
  "2026-09-26",
  "2026-09-27",
  "2026-09-28",
  "2026-09-29",
  "2026-09-30",
  "2026-10-01",
  "2026-10-02",
  "2026-10-03",
  "2026-10-04",
  "2026-10-05"
];

const daySeeds = {
  "2026-09-25": [
    {
      id: "sched-arrival",
      title: "Arrival buffer",
      category: "Transit",
      city: "Tokyo",
      start: "16:00",
      duration: 120,
      status: "Booked",
      notes: "Keep this flexible for customs, luggage, and getting oriented.",
      cost: "",
      link: ""
    },
    {
      id: "sched-first-dinner",
      title: "Low-key first dinner",
      category: "Food",
      city: "Tokyo",
      start: "19:00",
      duration: 90,
      status: "Maybe",
      notes: "Pick something close to the hotel.",
      cost: "",
      link: ""
    }
  ],
  "2026-09-28": [
    {
      id: "sched-breakfast",
      title: "Coffee and breakfast",
      category: "Food",
      city: "Kyoto",
      start: "08:30",
      duration: 60,
      status: "Proposed",
      notes: "Easy start before temple time.",
      cost: "",
      link: ""
    },
    {
      id: "sched-transit-temple",
      title: "Transit to eastern Kyoto",
      category: "Transit",
      city: "Kyoto",
      start: "09:45",
      duration: 35,
      status: "Proposed",
      notes: "Leave margin for station navigation.",
      cost: "",
      link: ""
    },
    {
      id: "sched-temple-walk",
      title: "Temple visit and garden walk",
      category: "Culture",
      city: "Kyoto",
      start: "10:30",
      duration: 120,
      status: "Maybe",
      notes: "Good candidate for a quieter morning.",
      cost: "",
      link: ""
    },
    {
      id: "sched-open-afternoon",
      title: "Open neighborhood time",
      category: "Open Time",
      city: "Kyoto",
      start: "14:00",
      duration: 120,
      status: "Proposed",
      notes: "Use for shopping, snacks, or resting.",
      cost: "",
      link: ""
    },
    {
      id: "sched-dinner",
      title: "Dinner reservation option",
      category: "Food",
      city: "Kyoto",
      start: "19:00",
      duration: 105,
      status: "Maybe",
      notes: "Promote a saved food idea once we decide.",
      cost: "",
      link: ""
    }
  ],
  "2026-10-05": [
    {
      id: "sched-departure",
      title: "Departure day buffer",
      category: "Transit",
      city: "Tokyo",
      start: "09:30",
      duration: 180,
      status: "Booked",
      notes: "Protect the morning for packing and airport transfer.",
      cost: "",
      link: ""
    }
  ]
};

export function makeTripDays() {
  return tripDates.map((date, index) => ({
    id: date,
    date,
    dayNumber: index + 1,
    city: index < 3 ? "Tokyo" : index < 8 ? "Kyoto / Osaka" : "Tokyo",
    notes: "",
    schedule: daySeeds[date] ?? []
  }));
}

export function makeInitialTrip() {
  return {
    version: TRIP_VERSION,
    name: "Japan 2026",
    dateRangeLabel: "Sep 25 - Oct 5",
    travelers: TRAVELERS,
    days: makeTripDays(),
    ideas: [
      {
        id: "idea-ramen",
        title: "Late-night ramen crawl",
        category: "Food",
        city: "Tokyo",
        duration: 90,
        status: "Proposed",
        notes: "Save a few options near the hotel so this stays low effort.",
        cost: "$$",
        link: "",
        votes: { Me: "love", Wife: "like" }
      },
      {
        id: "idea-fushimi",
        title: "Fushimi Inari early walk",
        category: "Culture",
        city: "Kyoto",
        duration: 150,
        status: "Maybe",
        notes: "Go early if this makes the final plan.",
        cost: "Free",
        link: "",
        votes: { Me: "like", Wife: "love" }
      },
      {
        id: "idea-shinkansen",
        title: "Tokyo to Kyoto train",
        category: "Transit",
        city: "Tokyo -> Kyoto",
        duration: 150,
        status: "Booked",
        notes: "Keep confirmation number here once booked.",
        cost: "",
        link: "",
        votes: { Me: "like", Wife: "like" }
      },
      {
        id: "idea-ryokan",
        title: "One-night ryokan splurge",
        category: "Hotel",
        city: "Hakone or Kyoto",
        duration: 1440,
        status: "Proposed",
        notes: "Worth comparing with hotel logistics before committing.",
        cost: "$$$",
        link: "",
        votes: { Me: "maybe", Wife: "love" }
      }
    ],
    updatedAt: new Date().toISOString()
  };
}
