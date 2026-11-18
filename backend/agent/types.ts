import * as z from "zod";

export const EVENT_TIMEZONE = "Europe/Berlin";

export const EVENT_CATEGORIES = [
  // Exhibitions
  "Architecture & Design",
  "History & Archaeology",
  "Film, Theatre, Literature & Music",
  "Photography",
  "Art",
  "Science & Technology",
  // Education
  "Lectures & Readings",
  "Excursions",
  "Panel Discussion",
  "Workshop",
  "Family",
  // Festivals & Markets
  "Festival",
  "Market",
  "Street Festival / Folk Festival",
  "Christmas & Winter Markets",
  // Concerts
  "Classical Music",
  "Blues & Jazz",
  "Pop, Electro & Rock",
  // Groups without sub-types
  "Films",
  "Events for Foodies",
  "Cabaret & Comedy",
  "Trade Fair & Congress",
  "Nightlife",
  "Opera & Dance",
  "Theatre",
  "Sports",
  "Guided Tours",
  "Miscellaneous",
] as const;

export const EventSchema = z
  .object({
    title: z.string().meta({
      description:
        "Original event name as published. Do not translate it or add the venue or date.",
    }),
    description: z.string().meta({
      description: "Short summary of the event in one or two sentences.",
    }),
    link: z.url().meta({
      description:
        "URL of the event page, taken from the search results. Never invent a URL. Prefer the organizer's own page if it appears in the results; otherwise use the page where the event was found.",
    }),
    category: z.array(z.enum(EVENT_CATEGORIES)).min(1).meta({
      description:
        "One or more categories, best fit first. Pick the most specific labels. The first six are exhibition types (e.g. 'Photography' means a photo exhibition, not a workshop). Use 'Miscellaneous' only if nothing else fits.",
    }),
    venue: z.string().optional().meta({
      description:
        "Name of the venue (e.g. 'Berghain'), not a full address. Omit if unknown.",
    }),
    startDate: z.iso.date().optional().meta({
      description:
        "Date the event starts, format YYYY-MM-DD, e.g. 2026-11-13. For an event that repeats on several dates, use the first date inside the searched date window and mention the other dates in the description. Omit if unknown; do not guess.",
    }),
    endDate: z.iso.date().optional().meta({
      description:
        "Last day of a multi-day event that runs continuously (e.g. an exhibition), format YYYY-MM-DD. Must not be before startDate. Omit for single-day events.",
    }),
    startTime: z.iso
      .time()
      .optional()
      .meta({
        description: `Start time in ${EVENT_TIMEZONE} local time, format HH:MM, e.g. 23:00. Omit if unknown; do not guess.`,
      }),
    endTime: z.iso
      .time()
      .optional()
      .meta({
        description: `End time in ${EVENT_TIMEZONE} local time, format HH:MM, e.g. 06:00. If it is earlier than startTime, the event ends the next day. Omit if unknown; do not guess.`,
      }),
  })
  .refine(
    // ISO dates (YYYY-MM-DD) sort alphabetically in date order, so plain
    // string comparison works. Only compare when both dates are present.
    (event) =>
      !event.startDate || !event.endDate || event.endDate >= event.startDate,
    { message: "endDate must not be before startDate", path: ["endDate"] },
  );

export const EventListSchema = z.array(EventSchema);

export type Event = z.infer<typeof EventSchema>;

export type EventList = Array<Event>;
