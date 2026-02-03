import { ApiService } from "./api.service";
import type { ComponentContext } from "@ixon-cdk/types";
import type { NoteDisplay } from "../types";
import { DateTime } from "luxon";

export class NotesManager {
  apiService: ApiService;
  context: ComponentContext;

  constructor(context: ComponentContext) {
    this.context = context;
    this.apiService = new ApiService(context);
  }

  /**
   * Fetches a flat list of globally sorted notes for display.
   * This method is used by the component to render the table.
   */
  async getGloballySortedNotes(
    pageSize: number = 50,
    pageAfter?: string,
    searchQuery?: string,
    forceFresh: boolean = false,
  ): Promise<{ notes: NoteDisplay[]; moreAfter?: string }> {
    try {
      const result = await this.apiService.getFlatSortedNotes(
        pageSize,
        pageAfter,
        searchQuery,
        forceFresh,
      );

      return result;
    } catch (error) {
      console.error("Error in getGloballySortedNotes:", error);
      return { notes: [], moreAfter: undefined };
    }
  }

  refreshData() {
    this.apiService.clearCache();
  }

  /**
   * Formats a timestamp (in milliseconds) to various date formats.
   * Handles both ISO strings and numeric timestamps.
   */
  static formatDate(dateValue: number | string | undefined | null): {
    fullDate: string;
    dateOnly: string;
    timeOnly: string;
    formattedDate: string;
  } {
    if (!dateValue && dateValue !== 0) {
      return {
        fullDate: "No Date Provided",
        dateOnly: "No Date Provided",
        timeOnly: "No Time Provided",
        formattedDate: "No Date Provided",
      };
    }

    let dt;

    if (typeof dateValue === "number") {
      dt = DateTime.fromMillis(dateValue);
    } else if (typeof dateValue === "string") {
      dt = DateTime.fromISO(dateValue);
    } else {
      return {
        fullDate: String(dateValue),
        dateOnly: "Invalid Date",
        timeOnly: "Invalid Time",
        formattedDate: "Invalid Date Format",
      };
    }

    if (!dt.isValid) {
      return {
        fullDate: String(dateValue),
        dateOnly: "Invalid Date",
        timeOnly: "Invalid Time",
        formattedDate: "Invalid Date Format",
      };
    }

    return {
      fullDate: dt.toISO()!,
      dateOnly: dt.toFormat("MM-dd-yyyy"), // was "dd-MM-yyyy"
      timeOnly: dt.toFormat("HH:mm"),
      formattedDate: dt.toFormat("MM-dd-yyyy HH:mm"), // was "dd-MM-yyyy HH:mm"
    };
  }
}
