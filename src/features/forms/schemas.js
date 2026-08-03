import { z } from "zod";

const MIN_SCHEDULE_DURATION_MINUTES = 15;
const DEFAULT_NEW_BLOCK = {
  itemKind: "activity",
  category: "Open Time",
  start: "10:00",
  duration: 60,
  status: "Proposed"
};

function dateSortValue(dateValue) {
  const time = new Date(`${dateValue}T12:00:00`).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

const schedule = z.object({
  id: z.string().min(1),
  itemKind: z.string().optional().default(DEFAULT_NEW_BLOCK.itemKind),
  title: z.string().optional().default(""),
  locationInput: z.string().optional().default(""),
  category: z.string().optional().default(DEFAULT_NEW_BLOCK.category),
  city: z.string().optional().default(""),
  start: z.string().optional().default(DEFAULT_NEW_BLOCK.start),
  duration: z.coerce.number().min(MIN_SCHEDULE_DURATION_MINUTES).default(DEFAULT_NEW_BLOCK.duration),
  status: z.string().optional().default(DEFAULT_NEW_BLOCK.status),
  notes: z.string().optional().default(""),
  cost: z.string().optional().default(""),
  link: z.string().optional().default(""),
  mapLink: z.string().optional().default(""),
  stayStartDayId: z.string().optional().default(""),
  stayEndDayId: z.string().optional().default(""),
  checkInTime: z.string().optional().default(""),
  checkOutTime: z.string().optional().default(""),
  place: z.any().optional()
});

const idea = z.object({
  id: z.string().min(1),
  title: z.string().optional().default(""),
  locationInput: z.string().optional().default(""),
  category: z.string().optional().default("Culture"),
  city: z.string().optional().default(""),
  status: z.string().optional().default("Proposed"),
  notes: z.string().optional().default(""),
  cost: z.string().optional().default(""),
  link: z.string().optional().default(""),
  mapLink: z.string().optional().default(""),
  place: z.any().optional(),
  reactions: z.any().optional(),
  votes: z.any().optional(),
  _mode: z.string().optional()
});

const invite = z.object({
  email: z.string().trim().email("Enter a valid email."),
  role: z.enum(["editor", "viewer"]).default("editor")
});

const passwordUser = z.object({
  email: z.string().trim().email("Enter a valid email."),
  displayName: z.string().trim().optional().default(""),
  password: z.string().min(6, "Use at least 6 characters."),
  role: z.enum(["editor", "viewer"]).default("editor")
});

const day = z.object({
  id: z.string().min(1),
  label: z.string().optional().default(""),
  date: z.string().min(1, "Choose a date."),
  locationInput: z.string().optional().default(""),
  city: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  baseMapLink: z.string().optional().default(""),
  basePlace: z.any().optional()
});

const firstTrip = z
  .object({
    name: z.string().trim().min(1, "Add a trip name."),
    city: z.string().trim().min(1, "Add your first destination."),
    startDate: z.string().min(1, "Choose a start date."),
    endDate: z.string().min(1, "Choose an end date.")
  })
  .superRefine((value, context) => {
    if (dateSortValue(value.endDate) < dateSortValue(value.startDate)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "End date must be on or after the start date."
      });
    }
  });

export const FORM_SCHEMAS = { schedule, idea, invite, passwordUser, day, firstTrip };
