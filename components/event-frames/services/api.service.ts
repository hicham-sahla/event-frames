import type { ComponentContext, BackendComponentClient } from "@ixon-cdk/types";
import type { Note, NoteDisplay } from "../types";
import { DateTime } from "luxon";
import { NotesManager } from "./notes-manager";

interface CacheItem {
  data: any;
  timestamp: number;
  expiresAt: number;
}

export class ApiService {
  context: ComponentContext;
  backendClient: BackendComponentClient;
  cache: Map<string, CacheItem> = new Map();
  cacheTTL: number = 5 * 60 * 1000; // 5 minutes in milliseconds

  constructor(context: ComponentContext) {
    this.context = context;
    this.backendClient = context.createBackendComponentClient();
  }

  getCacheKey(params?: Record<string, any>): string {
    let key = "notes.get";
    if (params) {
      key += JSON.stringify(params);
    }
    return key;
  }

  isCacheValid(cacheItem: CacheItem): boolean {
    return Date.now() < cacheItem.expiresAt;
  }

  clearCache(cacheKey?: string) {
    if (cacheKey) {
      this.cache.delete(cacheKey);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Fetches notes using the backend component function call
   * Uses context.createBackendComponentClient() to call 'notes.get'
   */
  async fetchNotes(forceFresh: boolean = false): Promise<Note[]> {
    const cacheKey = this.getCacheKey();

    if (!forceFresh && this.cache.has(cacheKey)) {
      const cachedItem = this.cache.get(cacheKey)!;
      if (this.isCacheValid(cachedItem)) {
        return cachedItem.data;
      }
    }

    try {
      // Call the backend function using the IXON SDK
      const rawResponse = await this.backendClient.call("notes.get", {});

      // Cast to any to access nested properties
      const response = rawResponse as any;

      console.log("Raw API response:", response);

      // Extract notes from the response structure
      // Response structure: { call: {...}, data: { data: Note[], message: null, success: true } }
      let notes: Note[] = [];

      if (response?.data?.data && Array.isArray(response.data.data)) {
        // This is the actual structure: response.data.data
        notes = response.data.data;
      } else if (
        response?.data?.value?.data &&
        Array.isArray(response.data.value.data)
      ) {
        notes = response.data.value.data;
      } else if (response?.value?.data && Array.isArray(response.value.data)) {
        notes = response.value.data;
      } else if (response?.data && Array.isArray(response.data)) {
        notes = response.data;
      } else if (Array.isArray(response)) {
        notes = response;
      }

      console.log("Extracted notes:", notes.length, "items");

      // Cache the result
      this.cache.set(cacheKey, {
        data: notes,
        timestamp: Date.now(),
        expiresAt: Date.now() + this.cacheTTL,
      });

      return notes;
    } catch (error) {
      console.error("Error fetching notes:", error);
      throw error;
    }
  }

  /**
   * Fetches notes and transforms them to the display format
   * Handles pagination client-side since the backend returns all notes
   */
  async getFlatSortedNotes(
    pageSize: number = 50,
    pageAfter?: string,
    searchQuery?: string,
    forceFresh: boolean = false
  ): Promise<{ notes: NoteDisplay[]; moreAfter?: string }> {
    try {
      // Fetch all notes from backend
      const allNotes = await this.fetchNotes(forceFresh);

      // Transform to display format
      let displayNotes: NoteDisplay[] = allNotes.map((note: Note) => {
        const formattedDate = NotesManager.formatDate(note.created_on);
        const performedOnFormatted = note.performed_on
          ? NotesManager.formatDate(note.performed_on).formattedDate
          : "N/A";

        return {
          publicId: note._id,
          name: `${note.note_category || "Note"}\ncreated by ${
            note.author_name
          }`,
          occurredOn: formattedDate,
          severity: performedOnFormatted,
          text: note.text,
          author_name: note.author_name,
          note_category: note.note_category,
        };
      });

      // Sort by created_on descending (newest first)
      displayNotes.sort((a, b) => {
        const dateA = DateTime.fromISO(a.occurredOn.fullDate).toMillis();
        const dateB = DateTime.fromISO(b.occurredOn.fullDate).toMillis();
        return dateB - dateA;
      });

      // Apply search filter if provided
      if (searchQuery && searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase().trim();
        displayNotes = displayNotes.filter((note) => {
          return (
            note.publicId.toLowerCase().includes(query) ||
            note.name.toLowerCase().includes(query) ||
            note.text.toLowerCase().includes(query) ||
            note.author_name.toLowerCase().includes(query) ||
            (note.note_category &&
              note.note_category.toLowerCase().includes(query)) ||
            note.occurredOn.formattedDate.toLowerCase().includes(query)
          );
        });
      }

      // Handle pagination client-side
      let startIndex = 0;
      if (pageAfter) {
        const afterIndex = displayNotes.findIndex(
          (n) => n.publicId === pageAfter
        );
        if (afterIndex !== -1) {
          startIndex = afterIndex + 1;
        }
      }

      const paginatedNotes = displayNotes.slice(
        startIndex,
        startIndex + pageSize
      );
      const hasMore = startIndex + pageSize < displayNotes.length;
      const nextPageAfter = hasMore
        ? paginatedNotes[paginatedNotes.length - 1]?.publicId
        : undefined;

      return {
        notes: paginatedNotes,
        moreAfter: nextPageAfter,
      };
    } catch (error) {
      console.error("Error in getFlatSortedNotes:", error);
      return {
        notes: [],
        moreAfter: undefined,
      };
    }
  }
}
