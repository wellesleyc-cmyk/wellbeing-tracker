// export.js — Export screen for wellbeing-tracker
// Builds the #screen-export section dynamically on each visit.

import { getAllEntries } from './db.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return today's date key in "YYYY-MM-DD" format (local time).
 * Matches the same pattern used in survey.js.
 * @returns {string}
 */
function getTodayKey() {
  const d = new Date();
  const year  = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day   = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format a "YYYY-MM-DD" date string as human-readable "D Mon YYYY".
 * e.g. "2026-03-08" -> "8 Mar 2026"
 * Uses local-time interpretation to match the key format.
 * @param {string} dateKey
 * @returns {string}
 */
function formatDateHuman(dateKey) {
  // Parse parts manually to avoid UTC-vs-local ambiguity with new Date('YYYY-MM-DD')
  const [year, month, day] = dateKey.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Build the CSV string from an array of entries (already sorted ascending).
 * @param {Object[]} entries
 * @returns {string}
 */
function buildCSV(entries) {
  const header = 'date,location,q1,q2,q3,q4,q5,raw_score,scaled_score';
  const rows = entries.map((e) => {
    const location = `"${(e.location ?? '').replace(/"/g, '""')}"`;
    return [
      e.date,
      location,
      e.q1,
      e.q2,
      e.q3,
      e.q4,
      e.q5,
      e.raw_score,
      e.scaled_score,
    ].join(',');
  });
  return [header, ...rows].join('\n');
}

/**
 * Trigger a file download of the given CSV content.
 * @param {string} csvContent
 * @param {string} filename
 */
function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Main exported function
// ---------------------------------------------------------------------------

/**
 * Initialise (or re-initialise) the Export screen.
 * Called by app.js every time the user navigates to the Export tab.
 */
export async function initExportScreen() {
  const container = document.getElementById('screen-export');
  if (!container) return;

  // Show a loading state while fetching
  container.innerHTML = `
    <div class="export-wrapper">
      <h2 class="export-header">Export Data</h2>
      <p class="export-loading">Loading…</p>
    </div>
  `;

  let entries = [];
  try {
    entries = await getAllEntries(); // already sorted ascending by date
    entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  } catch (err) {
    console.error('initExportScreen: getAllEntries failed:', err);
    container.innerHTML = `
      <div class="export-wrapper">
        <h2 class="export-header">Export Data</h2>
        <p class="export-error">Failed to load data. Please try again.</p>
      </div>
    `;
    return;
  }

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------
  if (entries.length === 0) {
    container.innerHTML = `
      <div class="export-wrapper">
        <h2 class="export-header">Export Data</h2>
        <p class="export-empty">No data to export yet. Complete your first survey to start tracking.</p>
      </div>
    `;
    return;
  }

  // -------------------------------------------------------------------------
  // Build CSV
  // -------------------------------------------------------------------------
  const csvContent = buildCSV(entries);
  const filename   = `wellbeing-${getTodayKey()}.csv`;

  // Summary dates
  const firstDate = formatDateHuman(entries[0].date);
  const lastDate  = formatDateHuman(entries[entries.length - 1].date);
  const count     = entries.length;

  // Data preview: header + first 3 data rows
  const csvLines   = csvContent.split('\n');
  const previewLines = [csvLines[0], ...csvLines.slice(1, 4)];
  const previewText  = previewLines.join('\n');

  // Share button — only rendered if Web Share API is available
  const hasShare     = typeof navigator.share === 'function';
  const shareBtnHTML = hasShare
    ? `<button id="export-share-btn" class="btn btn--secondary btn--full">&#8679; Share / Save to Files</button>`
    : '';

  // -------------------------------------------------------------------------
  // Inject HTML
  // -------------------------------------------------------------------------
  container.innerHTML = `
    <div class="export-wrapper">
      <h2 class="export-header">Export Data</h2>

      <p class="export-summary">
        ${count} ${count === 1 ? 'entry' : 'entries'} from ${firstDate} to ${lastDate}
      </p>

      <div class="export-actions">
        <button id="export-download-btn" class="btn btn--primary btn--full">&#8681; Download CSV</button>
        ${shareBtnHTML}
      </div>

      <hr class="export-divider">

      <details class="csv-preview">
        <summary>Preview CSV data</summary>
        <pre class="csv-code"></pre>
      </details>
    </div>
  `;

  container.querySelector('.csv-code').textContent = previewText;

  // -------------------------------------------------------------------------
  // Wire up Download button
  // -------------------------------------------------------------------------
  document.getElementById('export-download-btn').addEventListener('click', () => {
    downloadCSV(csvContent, filename);
  });

  // -------------------------------------------------------------------------
  // Wire up Share button (if rendered)
  // -------------------------------------------------------------------------
  if (hasShare) {
    document.getElementById('export-share-btn').addEventListener('click', async () => {
      const file = new File([csvContent], filename, { type: 'text/csv' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'Wellbeing Data Export',
          });
        } catch (err) {
          if (err.name !== 'AbortError') {
            console.error('Share failed:', err);
          }
        }
      } else {
        // Fallback: trigger a regular download
        downloadCSV(csvContent, filename);
      }
    });
  }
}
