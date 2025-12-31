import { DateTime } from "luxon";
import type { NoteDisplay } from "../types";

// Fuzzy matching for search
export function fuzzyMatch(text: string, query: string): boolean {
  if (!text || !query) return false;
  const normalizedText = text.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  return normalizedText.includes(normalizedQuery);
}

// Date parsing result interface
interface DateParseResult {
  isDate: boolean;
  dateObj: ReturnType<typeof DateTime.fromFormat> | null;
  apiFilters: string[];
}

// Parse search query for date patterns
export function parseSearchDate(
  query: string,
  timeZone: string
): DateParseResult {
  const result: DateParseResult = {
    isDate: false,
    dateObj: null,
    apiFilters: [],
  };

  const normalizedQuery = query.replace(/[\/\-\.]/g, "");

  const formats = [
    "M/d/yyyy",
    "MM/dd/yyyy",
    "d/M/yyyy",
    "dd/MM/yyyy",
    "d-M-yyyy",
    "dd-MM-yyyy",
    "yyyy/MM/dd",
    "yyyy-MM-dd",
    "yyyy.MM.dd",
    "M/d/yyyy, h:mm a",
    "MM/dd/yyyy, h:mm a",
    "d/M/yyyy, h:mm a",
    "dd/MM/yyyy, h:mm a",
    "M/d/yyyy HH:mm",
    "d/M/yyyy HH:mm",
    "yyyy/MM/dd HH:mm",
    "yyyy-MM-dd HH:mm",
    "h:mm a",
    "HH:mm",
    "MM/yyyy",
    "MM-yyyy",
    "yyyy/MM",
    "yyyy-MM",
    "MM/dd",
    "dd/MM",
    "M/d",
    "d/M",
  ];

  try {
    for (const format of formats) {
      const dt = DateTime.fromFormat(query, format, { zone: timeZone });
      if (dt.isValid) {
        result.isDate = true;
        result.dateObj = dt;
        break;
      }
    }

    if (
      !result.isDate &&
      normalizedQuery.length >= 6 &&
      /^\d+$/.test(normalizedQuery)
    ) {
      const patterns = [
        { year: 0, month: 4, day: 6 },
        { year: 4, month: 0, day: 2 },
        { year: 4, month: 2, day: 0 },
      ];

      for (const pattern of patterns) {
        const minLength = Math.max(
          pattern.year + 4,
          pattern.month + 2,
          pattern.day + 2
        );
        if (normalizedQuery.length < minLength) continue;

        const yearPart = normalizedQuery.substr(pattern.year, 4);
        const monthPart = normalizedQuery.substr(pattern.month, 2);
        const dayPart = normalizedQuery.substr(pattern.day, 2);

        const year = parseInt(yearPart);
        const month = parseInt(monthPart);
        const day = parseInt(dayPart);

        if (
          year >= 2000 &&
          year <= 2050 &&
          month >= 1 &&
          month <= 12 &&
          day >= 1 &&
          day <= 31
        ) {
          const dateStr = `${year}-${month.toString().padStart(2, "0")}-${day
            .toString()
            .padStart(2, "0")}`;
          const dt = DateTime.fromISO(dateStr, { zone: timeZone });

          if (dt.isValid) {
            result.isDate = true;
            result.dateObj = dt;
            break;
          }
        }
      }
    }
  } catch (error) {
    console.log("Date parsing error:", error);
  }

  return result;
}

// Client-side note filtering
export function filterNotes(
  notes: NoteDisplay[],
  searchQuery: string,
  timeZone: string
): NoteDisplay[] {
  if (!searchQuery || !searchQuery.trim()) {
    return notes;
  }

  const trimmedQuery = searchQuery.trim();
  const dateCheck = parseSearchDate(trimmedQuery, timeZone);

  return notes.filter((note) => {
    if (fuzzyMatch(note.publicId, trimmedQuery)) return true;
    if (fuzzyMatch(note.name, trimmedQuery)) return true;
    if (fuzzyMatch(note.text, trimmedQuery)) return true;
    if (fuzzyMatch(note.author_name, trimmedQuery)) return true;
    if (note.note_category && fuzzyMatch(note.note_category, trimmedQuery))
      return true;
    if (fuzzyMatch(note.severity, trimmedQuery)) return true;

    if (dateCheck.isDate && dateCheck.dateObj) {
      const occDate = DateTime.fromISO(note.occurredOn.fullDate, {
        zone: timeZone,
      });

      if (!occDate.isValid) return false;

      if (!trimmedQuery.includes(":")) {
        if (dateCheck.dateObj.year && occDate.year !== dateCheck.dateObj.year)
          return false;

        if (!/\d{4}/.test(trimmedQuery)) {
          return (
            occDate.month === dateCheck.dateObj.month &&
            occDate.day === dateCheck.dateObj.day
          );
        }

        return occDate.hasSame(dateCheck.dateObj, "day");
      }

      if (
        !/\d{1,2}[-\/\.]\d{1,2}/.test(trimmedQuery) &&
        !/\d{4}/.test(trimmedQuery)
      ) {
        const hourMatch = occDate.hour === dateCheck.dateObj.hour;
        const minuteMatch =
          Math.abs(occDate.minute - dateCheck.dateObj.minute) <= 5;
        return hourMatch && minuteMatch;
      }

      return Math.abs(occDate.diff(dateCheck.dateObj, "minutes").minutes) <= 10;
    }

    return false;
  });
}
