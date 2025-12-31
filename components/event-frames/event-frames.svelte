<script lang="ts">
  import { onMount, afterUpdate } from "svelte";
  import { DateTime } from "luxon";
  import { NotesManager } from "./services/notes-manager";
  import type { ComponentContext } from "@ixon-cdk/types";
  import { filterNotes } from "./utils/search-utils";
  import type { NoteDisplay } from "./types";

  export let context: ComponentContext;
  let notesManager: NotesManager;

  let notesList: NoteDisplay[] = [];
  let filteredNotes: NoteDisplay[] = [];
  let loading = true;
  let tableWidth = 0;
  let tableScrollTop = 0;
  $: isNarrow = tableWidth < 320;

  let agentId: string | null = null;
  let agentName = "unknown-agent";
  let search = "";
  let previousSearch = "";
  let isSearchFocused = false;
  let translations: Record<string, string>;

  let from = "";
  let to = "";

  // Pagination variables
  let pageSize = 50;
  let currentPageAfter: string | undefined = undefined;
  let hasMoreData = true;
  let isLoadingMore = false;

  let isToDate = false;

  // Variables for export dialog
  let showExportDialog = false;
  let exportPeriod = "all";
  let exportStartDate = "";
  let exportEndDate = "";
  let exportInProgress = false;
  let exportProgress = 0;
  let exportTotalItems = 0;
  let exportCurrentItems = 0;

  function toggleDateAdjustment() {
    adjustmentTarget = isToDate ? "to" : "from";
  }

  let minuteAdjustment: number = 15;
  let adjustmentTarget: "from" | "to" = "from";

  onMount(async () => {
    notesManager = new NotesManager(context);
    translations = context.translate(
      ["SEARCH", "NO_OCCURRENCES_FOUND", "OCCURRENCES", "ACTIVE_SINCE"],
      undefined,
      { source: "global" }
    );

    if (context) {
      const client = context.createResourceDataClient();
      client.query(
        [{ selector: "Agent", fields: ["publicId", "name"] }],
        async (results) => {
          if (results && results.length > 0 && results[0].data) {
            if (results[0].data.publicId) {
              agentId = results[0].data.publicId;
              if (agentId) {
                await loadInitialData();
              }
            }
            if (results[0].data.name) {
              agentName = results[0].data.name
                .replace(/\s+/g, "-")
                .toLowerCase();
            }
          }
        }
      );
    } else {
      console.error("Context is not initialized.");
    }
  });

  // Helper function for sorting notes
  function sortNotesList(list: NoteDisplay[]): NoteDisplay[] {
    return list.sort((a, b) => {
      const timeA = a.occurredOn?.fullDate
        ? DateTime.fromISO(a.occurredOn.fullDate).toMillis()
        : 0;
      const timeB = b.occurredOn?.fullDate
        ? DateTime.fromISO(b.occurredOn.fullDate).toMillis()
        : 0;
      const validTimeA = !isNaN(timeA) ? timeA : 0;
      const validTimeB = !isNaN(timeB) ? timeB : 0;
      return validTimeB - validTimeA; // Newest first
    });
  }

  async function loadInitialData(forceFresh = false) {
    loading = true;
    try {
      const result = await notesManager.getGloballySortedNotes(
        pageSize,
        undefined,
        search.trim() !== "" ? search : undefined,
        forceFresh
      );

      notesList = result.notes;
      currentPageAfter = result.moreAfter;
      hasMoreData = !!result.moreAfter;
      previousSearch = search;

      if (notesList.length === 0 && search.trim() !== "") {
        const backupResult = await notesManager.getGloballySortedNotes(
          pageSize,
          undefined,
          undefined,
          forceFresh
        );

        notesList = filterNotes(
          backupResult.notes,
          search,
          context.appData.timeZone
        );

        if (notesList.length > 0) {
          currentPageAfter = backupResult.moreAfter;
          hasMoreData = !!backupResult.moreAfter;
        } else {
          currentPageAfter = undefined;
          hasMoreData = false;
        }
      }

      notesList = sortNotesList(notesList);
      console.log("All fetched notes (notesList after initial load):");
      console.table(notesList);
    } catch (error) {
      console.error("Error fetching initial data:", error);
      notesList = [];
      hasMoreData = false;
    } finally {
      loading = false;
    }
  }

  function handleTableScroll(event: Event): void {
    const target = event.target as HTMLDivElement;
    tableScrollTop = target.scrollTop;

    if (
      hasMoreData &&
      !isLoadingMore &&
      target.scrollHeight - target.scrollTop - target.clientHeight < 200
    ) {
      loadMoreData();
    }
  }

  async function loadMoreData() {
    if (!hasMoreData || isLoadingMore) return;

    isLoadingMore = true;
    try {
      const result = await notesManager.getGloballySortedNotes(
        pageSize,
        currentPageAfter,
        search.trim() !== "" ? search : undefined
      );

      const newNotes = result.notes;

      if (newNotes.length === 0 && search.trim() !== "") {
        hasMoreData = false;
      } else if (newNotes.length > 0) {
        notesList = [...notesList, ...newNotes];
        notesList = sortNotesList(notesList);
        console.log("All fetched notes (notesList after 'load more'):");
        console.table(notesList);
      }
      currentPageAfter = result.moreAfter;
      hasMoreData = !!result.moreAfter;
    } catch (error) {
      console.error("Error fetching more data:", error);
      hasMoreData = false;
    } finally {
      isLoadingMore = false;
    }
  }

  function formatDate(dateString: string | undefined) {
    return NotesManager.formatDate(dateString);
  }

  function handleSearchFocus() {
    isSearchFocused = true;
  }

  function handleSearchBlur() {
    isSearchFocused = false;
    if (search !== previousSearch) {
      executeSearch();
    }
  }

  function handleSearchKeyUp(event: KeyboardEvent) {
    if (event.key === "Enter") {
      executeSearch();
    }
  }

  function executeSearch() {
    currentPageAfter = undefined;
    hasMoreData = true;
    loadInitialData();
  }
  // Helper function to strip HTML tags
  function stripHtml(html: string): string {
    if (!html) return "";
    return html
      .replace(/<[^>]*>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&nbsp;/g, " ")
      .trim();
  }

  // Helper function to truncate ID
  function truncateId(id: string): string {
    if (!id) return "";
    return id.length > 9 ? id.substring(0, 9) + ".." : id;
  }

  // Helper function to format category
  function formatCategory(category: string | null): string {
    if (!category) return "Uncategorized";
    if (category === "Stack inspection") return "Stack visual inspection";
    return category;
  }
  function selectNote(note: NoteDisplay) {
    if (!note) {
      console.error("Invalid note data for selection");
      return;
    }

    // Use performed_on if available, otherwise use created_on (occurredOn)
    let dateToUse: string;

    if (note.severity && note.severity !== "N/A") {
      // severity contains performed_on formatted date, we need the full ISO
      // We need to get it from occurredOn since that's what we have
      // Actually, let's parse from the formatted date or use occurredOn
      dateToUse = note.occurredOn.fullDate;

      // Try to find a valid performed_on date
      const performedOnDate = DateTime.fromFormat(
        note.severity,
        "dd-MM-yyyy HH:mm",
        {
          zone: context.appData.timeZone,
        }
      );

      if (performedOnDate.isValid) {
        dateToUse = performedOnDate.toISO()!;
      }
    } else {
      dateToUse = note.occurredOn.fullDate;
    }

    const startTime = DateTime.fromISO(dateToUse, {
      zone: context.appData.timeZone,
    });

    if (!startTime.isValid) {
      console.error("Failed to parse start time from selected note");
      return;
    }

    const endTime = startTime.plus({ hours: 1 });
    context.setTimeRange({
      from: startTime.toMillis(),
      to: endTime.toMillis(),
    });
    localStorage.setItem("snapshot-date", startTime.toISO());
  }

  function incrementTimeRange() {
    adjustTimeRange(minuteAdjustment);
  }

  function decrementTimeRange() {
    adjustTimeRange(-minuteAdjustment);
  }

  function adjustTimeRange(minutes: number) {
    let newFrom = DateTime.fromMillis(context.timeRange.from, {
      zone: context.appData.timeZone,
    });
    let newTo = DateTime.fromMillis(context.timeRange.to, {
      zone: context.appData.timeZone,
    });

    if (adjustmentTarget === "from") {
      newFrom = newFrom.plus({ minutes });
    } else {
      newTo = newTo.plus({ minutes });
    }
    context.setTimeRange({ from: newFrom.toMillis(), to: newTo.toMillis() });
  }

  $: if (context && context.timeRange) {
    from = DateTime.fromMillis(context.timeRange.from, {
      zone: context.appData.timeZone,
    }).toISO();
    to = DateTime.fromMillis(context.timeRange.to, {
      zone: context.appData.timeZone,
    }).toISO();
  }

  $: {
    if (search.trim() !== "" && !loading && !isLoadingMore) {
      filteredNotes = filterNotes(notesList, search, context.appData.timeZone);
    } else {
      filteredNotes = notesList;
    }
    if ((!loading && !isLoadingMore) || filteredNotes.length > 0) {
      console.log("Notes displayed in table (filteredNotes):");
      console.table(filteredNotes);
    }
  }

  function toggleRefresh(): void {
    currentPageAfter = undefined;
    hasMoreData = true;
    loadInitialData(true);
  }

  let copySuccess: Record<string, boolean> = {};
  async function copyToClipboard(id: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(id);
      copySuccess = { ...copySuccess, [id]: true };
      setTimeout(() => {
        copySuccess = { ...copySuccess, [id]: false };
      }, 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
      copySuccess = { ...copySuccess, [id]: false };
    }
  }

  function resetSelectedNote() {
    localStorage.removeItem("snapshot-date");
    const now = DateTime.now().setZone(context.appData.timeZone);
    const startOfDay = now.startOf("day").toMillis();
    const endOfDay = now.endOf("day").toMillis();
    if (context && context.setTimeRange) {
      context.setTimeRange({ from: startOfDay, to: endOfDay });
    }
  }

  function showExportOptions(): void {
    exportPeriod = "all";
    if (context && context.timeRange) {
      const fromDate = DateTime.fromMillis(context.timeRange.from, {
        zone: context.appData.timeZone,
      });
      const toDate = DateTime.fromMillis(context.timeRange.to, {
        zone: context.appData.timeZone,
      });
      exportStartDate = fromDate.toFormat("yyyy-MM-dd'T'HH:mm");
      exportEndDate = toDate.toFormat("yyyy-MM-dd'T'HH:mm");
    } else {
      const now = DateTime.now().setZone(context.appData.timeZone);
      exportStartDate = now.startOf("day").toFormat("yyyy-MM-dd'T'HH:mm");
      exportEndDate = now.endOf("day").toFormat("yyyy-MM-dd'T'HH:mm");
    }
    showExportDialog = true;
  }

  function formatDateForDisplay(isoDate: string): string {
    if (!isoDate) return "Invalid date";
    const dt = DateTime.fromISO(isoDate);
    return dt.isValid ? dt.toFormat("dd/MM/yyyy HH:mm") : "Invalid date";
  }

  function closeExportDialog(): void {
    showExportDialog = false;
    exportInProgress = false;
    exportProgress = 0;
    exportCurrentItems = 0;
    exportTotalItems = 0;
  }

  function processNotesToCSV(notes: NoteDisplay[]): string[][] {
    return notes.map((note) => [
      note.publicId,
      note.name.replace(/\n/g, " - "),
      formatDateForTable(note.occurredOn.fullDate),
      note.severity,
      note.text.replace(/\n/g, " | "),
    ]);
  }

  async function exportAllNotes(): Promise<NoteDisplay[]> {
    let allNotes: NoteDisplay[] = [];
    let hasMore = true;
    let pageAfter: string | undefined = undefined;
    const batchSize = 100;
    exportTotalItems = 0;
    exportCurrentItems = 0;
    exportInProgress = true;

    while (hasMore) {
      try {
        const result = await notesManager.getGloballySortedNotes(
          batchSize,
          pageAfter,
          undefined,
          false
        );
        allNotes = [...allNotes, ...result.notes];

        exportCurrentItems = allNotes.length;
        if (result.moreAfter) {
          exportTotalItems = exportCurrentItems + batchSize;
        } else {
          exportTotalItems = exportCurrentItems;
        }
        exportProgress =
          exportTotalItems > 0
            ? Math.round((exportCurrentItems / exportTotalItems) * 100)
            : 0;

        pageAfter = result.moreAfter;
        hasMore = !!result.moreAfter;
      } catch (error) {
        console.error("Error fetching notes for export:", error);
        exportInProgress = false;
        throw error;
      }
    }
    return sortNotesList(allNotes);
  }

  async function exportNotesInDateRange(
    startDate: string,
    endDate: string
  ): Promise<NoteDisplay[]> {
    const start = DateTime.fromISO(startDate);
    const end = DateTime.fromISO(endDate);
    if (!start.isValid || !end.isValid)
      throw new Error("Invalid date format for export range");

    let allNotesInRange: NoteDisplay[] = [];
    let pageAfter: string | undefined = undefined;
    let hasMorePotentialData = true;
    const batchSize = 100;
    exportTotalItems = 0;
    exportCurrentItems = 0;
    exportInProgress = true;

    while (hasMorePotentialData) {
      try {
        const result = await notesManager.getGloballySortedNotes(
          batchSize,
          pageAfter,
          undefined,
          false
        );

        if (result.notes.length === 0) {
          hasMorePotentialData = false;
          break;
        }

        for (const note of result.notes) {
          const noteDate = DateTime.fromISO(note.occurredOn.fullDate);
          if (noteDate.isValid) {
            if (noteDate >= start && noteDate <= end) {
              allNotesInRange.push(note);
            }
            if (noteDate < start) {
              hasMorePotentialData = false;
              break;
            }
          }
        }

        exportCurrentItems = allNotesInRange.length;
        if (hasMorePotentialData && result.moreAfter) {
          exportTotalItems = exportCurrentItems + batchSize;
        } else {
          exportTotalItems = exportCurrentItems;
        }
        exportProgress =
          exportTotalItems > 0
            ? Math.round((exportCurrentItems / exportTotalItems) * 100)
            : 0;

        if (!hasMorePotentialData || !result.moreAfter) {
          break;
        }
        pageAfter = result.moreAfter;
      } catch (error) {
        console.error("Error fetching for date range export:", error);
        exportInProgress = false;
        throw error;
      }
    }
    return sortNotesList(allNotesInRange);
  }

  async function executeExport(): Promise<void> {
    exportProgress = 0;
    exportCurrentItems = 0;
    exportTotalItems = 0;

    let notesToExport: NoteDisplay[] = [];

    try {
      if (exportPeriod === "all") {
        notesToExport = await exportAllNotes();
      } else if (exportPeriod === "current") {
        exportInProgress = true;
        notesToExport = [...filteredNotes];
        exportProgress = 100;
        exportCurrentItems = notesToExport.length;
        exportTotalItems = notesToExport.length;
      } else if (exportPeriod === "custom") {
        if (!exportStartDate || !exportEndDate) {
          alert("Please select both a start and end date for custom export.");
          return;
        }
        notesToExport = await exportNotesInDateRange(
          exportStartDate,
          exportEndDate
        );
      }

      if (notesToExport.length === 0) {
        alert("No notes found for the selected export criteria.");
        exportInProgress = false;
        return;
      }

      const headers = [
        "ID",
        "Category & Author",
        "Created On",
        "Performed On",
        "Text",
      ];
      const csvData = processNotesToCSV(notesToExport);
      csvData.unshift(headers);
      const csvContent = csvData
        .map((row) =>
          row
            .map((cell) =>
              typeof cell === "string" &&
              (cell.includes(",") || cell.includes('"') || cell.includes("\n"))
                ? `"${cell.replace(/"/g, '""')}"`
                : cell
            )
            .join(",")
        )
        .join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `notes-export-${agentName}-${DateTime.now().toFormat(
          "yyyyMMdd-HHmmss"
        )}.csv`
      );
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      closeExportDialog();
    } catch (error) {
      console.error("Export failed:", error);
      alert(
        "Export failed: " +
          (error instanceof Error ? error.message : "Unknown error")
      );
      exportInProgress = false;
    }
  }

  async function exportToCSV(): Promise<void> {
    showExportOptions();
  }

  function formatDateForTable(dateString: string | undefined): string {
    if (!dateString) return "No Date";
    const dt = DateTime.fromISO(dateString);
    return dt.isValid ? dt.toFormat("dd/MM/yyyy, HH:mm") : "Invalid Date";
  }

  let refreshButtonEl: HTMLButtonElement;
  let resetButtonEl: HTMLButtonElement;
  let incrementTimeRangeButtonEl: HTMLButtonElement;
  let decrementTimeRangeButtonEl: HTMLButtonElement;
  let fromDateInputSwitchEl: HTMLLabelElement;
  let exportCsvButtonEl: HTMLButtonElement;

  afterUpdate(() => {
    if (refreshButtonEl)
      context.createTooltip(refreshButtonEl, {
        message: "Refresh the notes list",
      });
    if (resetButtonEl)
      context.createTooltip(resetButtonEl, {
        message: "Reset the selected note",
      });
    if (incrementTimeRangeButtonEl)
      context.createTooltip(incrementTimeRangeButtonEl, {
        message: "Extend the time range",
      });
    if (decrementTimeRangeButtonEl)
      context.createTooltip(decrementTimeRangeButtonEl, {
        message: "Shorten the time range",
      });
    if (fromDateInputSwitchEl)
      context.createTooltip(
        fromDateInputSwitchEl.parentElement as HTMLElement,
        { message: "Toggle to adjust start or end date" }
      );
    if (exportCsvButtonEl)
      context.createTooltip(exportCsvButtonEl, {
        message: "Export notes to CSV file",
      });
    document.querySelectorAll(".copy-button").forEach((button) => {
      context.createTooltip(button as HTMLElement, {
        message: "Copy ID to clipboard",
      });
    });
  });
</script>

<div class="card">
  {#if loading && notesList.length === 0}
    <div class="loading-state">
      <div class="spinner">
        <svg
          preserveAspectRatio="xMidYMid meet"
          focusable="false"
          viewBox="0 0 100 100"
        >
          <circle cx="50%" cy="50%" r="45" />
        </svg>
      </div>
    </div>
  {:else}
    <div class="card-header with-actions">
      <h3 class="card-title" data-testid="notes-overview-card-title">
        Event frames
      </h3>
      <div class="actions-top">
        <div class="time-adjustment">
          <div class="input-switch">
            <label for="toggleTarget" class="switch-label">Start Date</label>
            <input
              type="checkbox"
              id="toggleTarget"
              class="input"
              bind:checked={isToDate}
              on:change={toggleDateAdjustment}
            />
            <label
              bind:this={fromDateInputSwitchEl}
              for="toggleTarget"
              class="switch"
            ></label>
            <label for="toggleTarget" class="switch-label">End Date</label>
          </div>
          <div class="button-group">
            <button
              on:click={decrementTimeRange}
              bind:this={decrementTimeRangeButtonEl}
              aria-label="Decrease time range"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                height="24px"
                viewBox="0 -960 960 960"
                width="24px"
                fill="currentColor"
              >
                <path
                  d="M480-120q-138 0-240.5-91.5T122-440h82q14 104 92.5 172T480-200q117 0 198.5-81.5T760-480q0-117-81.5-198.5T480-760q-69 0-129 32t-101 88h110v80H120v-240h80v94q51-64 124.5-99T480-840q75 0 140.5 28.5t114 77q48.5 48.5 77 114T840-480q0 75-28.5 140.5t-77 114q-48.5 48.5-114 77T480-120Zm112-192L440-464v-216h80v184l128 128-56 56Z"
                />
              </svg>
            </button>
            <input
              type="number"
              bind:value={minuteAdjustment}
              min="1"
              aria-label="Adjustment in minutes"
            />
            <button
              on:click={incrementTimeRange}
              bind:this={incrementTimeRangeButtonEl}
              aria-label="Increase time range"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                height="24px"
                viewBox="0 -960 960 960"
                width="24px"
                fill="currentColor"
              >
                <path
                  d="M480-120q-75 0-140.5-28.5t-114-77q-48.5-48.5-77-114T120-480q0-75 28.5-140.5t77-114q48.5-48.5 114-77T480-840q82 0 155.5 35T760-706v-94h80v240H600v-80h110q-41-56-101-88t-129-32q-117 0-198.5 81.5T200-480q0 117 81.5 198.5T480-200q105 0 183.5-68T756-440h82q-15 137-117.5 228.5T480-120Zm112-192L440-464v-216h80v184l128 128-56 56Z"
                />
              </svg>
            </button>
          </div>
        </div>
        <div
          class="search-input-container"
          style={isNarrow ? "width: 100px" : ""}
        >
          <div class="search-input-prefix">
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M0 0h24v24H0z" fill="none" />
              <path
                d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
                fill="currentColor"
              />
            </svg>
          </div>
          <input
            class="search-input"
            placeholder={translations?.SEARCH || "Search"}
            bind:value={search}
            on:focus={handleSearchFocus}
            on:blur={handleSearchBlur}
            on:keyup={handleSearchKeyUp}
            style={isNarrow ? "display: flex" : ""}
            aria-label="Search notes"
          />
        </div>
        <div class="refresh-container">
          <button
            class="refresh ripple"
            on:click={toggleRefresh}
            bind:this={refreshButtonEl}
            aria-label="Refresh data"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 -960 960 960"
              aria-hidden="true"
              fill="currentColor"
            >
              <path
                d="M204-318q-22-38-33-78t-11-82q0-134 93-228t227-94h7l-64-64 56-56 160 160-160 160-56-56 64-64h-7q-100 0-170 70.5T240-478q0 26 6 51t18 49l-60 60ZM481-40 321-200l160-160 56 56-64 64h7q100 0 170-70.5T720-482q0-26-6-51t-18-49l60-60q22 38 33 78t11 82q0 134-93 228t-227 94h-7l64 64-56 56Z"
              />
            </svg>
          </button>
          <button
            class="auto-refresh ripple"
            on:click={resetSelectedNote}
            bind:this={resetButtonEl}
            aria-label="Reset note selection"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="24px"
              viewBox="0 -960 960 960"
              width="24px"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                d="m656-120-56-56 84-84-84-84 56-56 84 84 84-84 56 56-83 84 83 84-56 56-84-83-84 83Zm-176 0q-138 0-240.5-91.5T122-440h82q14 104 92.5 172T480-200q11 0 20.5-.5T520-203v81q-10 1-19.5 1.5t-20.5.5ZM120-560v-240h80v94q51-64 124.5-99T480-840q150 0 255 105t105 255h-80q0-117-81.5-198.5T480-760q-69 0-129 32t-101 88h110v80H120Zm414 190-94-94v-216h80v184l56 56-42 70Z"
              />
            </svg>
          </button>
          <button
            class="refresh ripple export-csv"
            on:click={exportToCSV}
            aria-label="Download CSV"
            bind:this={exportCsvButtonEl}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="24px"
              viewBox="0 -960 960 960"
              width="24px"
              fill="currentColor"
            >
              <path
                d="M230-360h120v-60H250v-120h100v-60H230q-17 0-28.5 11.5T190-560v160q0 17 11.5 28.5T230-360Zm156 0h120q17 0 28.5-11.5T546-400v-60q0-17-11.5-31.5T506-506h-60v-34h100v-60H426q-17 0-28.5 11.5T386-560v60q0 17 11.5 30.5T426-456h60v36H386v60Zm264 0h60l70-240h-60l-40 138-40-138h-60l70 240ZM160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm0-80h640v-480H160v480Zm0 0v-480 480Z"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
    <div class="card-content">
      {#if loading && filteredNotes.length === 0}
        <div class="loading-state">
          <div class="spinner">
            <svg
              preserveAspectRatio="xMidYMid meet"
              focusable="false"
              viewBox="0 0 100 100"
            >
              <circle cx="50%" cy="50%" r="45" />
            </svg>
          </div>
        </div>
      {:else if filteredNotes.length === 0 && !loading}
        <div class="no-occurrences-message">
          <p>No notes found for the searched criteria</p>
          <p>Please try adjusting your search or refresh the data.</p>
        </div>
      {:else}
        <div
          class="table-wrapper"
          bind:clientWidth={tableWidth}
          on:scroll={handleTableScroll}
        >
          <table class="base-table">
            <thead>
              <tr>
                <th class="id-column">ID</th>
                <th>Author</th>
                <th>Category</th>
                <th class="content-column">Content</th>
                <th>Created On</th>
                <th>Performed On</th>
              </tr>
            </thead>
            <tbody>
              {#each filteredNotes as note (note.publicId)}
                <tr on:click={() => selectNote(note)} class="ripple">
                  <td class="id-column">
                    <span title={note.publicId}
                      >{truncateId(note.publicId)}</span
                    >
                    <button
                      class="copy-button {copySuccess[note.publicId]
                        ? 'success'
                        : ''}"
                      on:click|stopPropagation={() =>
                        copyToClipboard(note.publicId)}
                      aria-label="Copy ID to clipboard"
                    >
                      {#if copySuccess[note.publicId]}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          height="16px"
                          viewBox="0 -960 960 960"
                          width="16px"
                          fill="currentColor"
                        >
                          <path
                            d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"
                          />
                        </svg>
                      {:else}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          height="16px"
                          viewBox="0 -960 960 960"
                          width="16px"
                          fill="currentColor"
                        >
                          <path
                            d="M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Zm160-240v-480 480Z"
                          />
                        </svg>
                      {/if}
                    </button>
                  </td>
                  <td>{note.author_name}</td>
                  <td>{formatCategory(note.note_category)}</td>
                  <td class="content-column" title={stripHtml(note.text)}
                    >{stripHtml(note.text)}</td
                  >
                  <td>{formatDateForTable(note.occurredOn.fullDate)}</td>
                  <td>{note.severity}</td>
                </tr>
              {/each}
            </tbody>
            {#if isLoadingMore}
              <tfoot>
                <tr>
                  <td colspan="6" style="text-align: center; padding: 10px;">
                    <div
                      class="spinner"
                      style="display: inline-block; width: 24px; height: 24px;"
                    >
                      <svg
                        preserveAspectRatio="xMidYMid meet"
                        focusable="false"
                        viewBox="0 0 100 100"
                      >
                        <circle cx="50%" cy="50%" r="45" />
                      </svg>
                    </div>
                  </td>
                </tr>
              </tfoot>
            {/if}
          </table>
        </div>
      {/if}
    </div>
  {/if}
</div>

{#if showExportDialog}
  <div class="dialog-overlay">
    <div class="export-dialog">
      <div class="dialog-header">
        <h3>Export Notes</h3>
        <button
          class="close-button"
          on:click={closeExportDialog}
          aria-label="Close export dialog">×</button
        >
      </div>
      <div class="dialog-content">
        {#if exportInProgress}
          <div class="export-progress">
            <p>Processing export: {exportProgress}%</p>
            <div class="progress-bar-container">
              <div class="progress-bar" style="width: {exportProgress}%"></div>
            </div>
            {#if exportTotalItems > 0 && exportProgress < 100}
              <p>{exportCurrentItems} of {exportTotalItems} items processed.</p>
            {:else if exportProgress === 100}
              <p>Export completed: {exportCurrentItems} items processed.</p>
            {:else}
              <p>{exportCurrentItems} items processed.</p>
            {/if}
          </div>
        {:else}
          <div class="export-options">
            <div class="option">
              <input
                type="radio"
                id="export-all"
                name="exportPeriod"
                value="all"
                bind:group={exportPeriod}
              />
              <label for="export-all">Export all notes from this unit</label>
            </div>
            <div class="option">
              <input
                type="radio"
                id="export-current"
                name="exportPeriod"
                value="current"
                bind:group={exportPeriod}
              />
              <label for="export-current"
                >Export currently displayed notes ({filteredNotes.length}
                items)</label
              >
            </div>
            <div class="option">
              <input
                type="radio"
                id="export-custom"
                name="exportPeriod"
                value="custom"
                bind:group={exportPeriod}
              />
              <label for="export-custom"
                >Export notes in custom time range</label
              >
            </div>
            {#if exportPeriod === "custom"}
              <div class="date-range-inputs">
                <div class="date-field">
                  <label for="export-start-date">Start Date</label>
                  <input
                    type="datetime-local"
                    id="export-start-date"
                    bind:value={exportStartDate}
                  />
                  <div class="date-display">
                    {formatDateForDisplay(exportStartDate)}
                  </div>
                </div>
                <div class="date-field">
                  <label for="export-end-date">End Date</label>
                  <input
                    type="datetime-local"
                    id="export-end-date"
                    bind:value={exportEndDate}
                  />
                  <div class="date-display">
                    {formatDateForDisplay(exportEndDate)}
                  </div>
                </div>
              </div>
            {/if}
          </div>
          <div class="actions">
            <button class="cancel-button" on:click={closeExportDialog}
              >Cancel</button
            >
            <button
              class="export-button"
              on:click={executeExport}
              disabled={exportInProgress}>Export CSV</button
            >
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  @use "./styles/card";
  @use "./styles/spinner";
  @use "./styles/table";
  @use "./styles/refresh";
  @use "./styles/ripple";
  @use "./styles/search-input";
  @use "./styles/dialog-export";

  .copy-button svg {
    vertical-align: middle;
  }
  .id-column {
    min-width: 100px;
    max-width: 120px;
  }
  .content-column {
    max-width: 250px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
