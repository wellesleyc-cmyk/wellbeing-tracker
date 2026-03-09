// history.js — History screen for wellbeing-tracker
// Renders a WHO-5 line chart and a scrollable entries table.

import { getAllEntries } from './db.js';

// Module-level chart instance so we can destroy it before re-rendering
// (Fix 1: replaces the broken Chart.getChart approach).
let _chartInstance = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a "YYYY-MM-DD" date string as "D MMM" for chart x-axis labels.
 * e.g. "2026-03-08" → "8 Mar"
 * @param {string} dateStr
 * @returns {string}
 */
function formatDateShort(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const dd = String(date.getDate());
  const mmm = date.toLocaleString('en-GB', { month: 'short' });
  return `${dd} ${mmm}`;
}

/**
 * Format a "YYYY-MM-DD" date string as "D MMM YYYY" for the table.
 * e.g. "2026-03-08" → "8 Mar 2026"
 * @param {string} dateStr
 * @returns {string}
 */
function formatDateLong(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Return a badge HTML string for a scaled WHO-5 score (0–100).
 * ≥72 → Good, 52–71 → Moderate, <52 → Low
 * @param {number} scaledScore
 * @returns {string}
 */
function getBadge(scaledScore) {
  if (scaledScore >= 72) {
    return '<span class="badge badge--good">Good</span>';
  }
  if (scaledScore >= 52) {
    return '<span class="badge badge--moderate">Moderate</span>';
  }
  return '<span class="badge badge--low">Low</span>';
}

/**
 * Escape a string for safe insertion into HTML text content.
 * @param {string} str
 * @returns {string}
 */
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

/**
 * Build and mount a Chart.js line chart into `container`.
 * Assumes `container` is already in the DOM.
 * @param {HTMLElement} container  - element that will receive the chart wrapper
 * @param {Object[]}   entries    - ascending-sorted array of entry objects
 */
function renderChart(container, entries) {
  // Chart.js CDN not yet loaded — show graceful fallback.
  if (typeof Chart === 'undefined') {
    const fallback = document.createElement('p');
    fallback.className = 'chart-unavailable';
    fallback.textContent = 'Chart unavailable — please check your connection and reload.';
    container.appendChild(fallback);
    return;
  }

  // Fix 1: Destroy any previous chart instance before touching the DOM.
  if (_chartInstance) {
    _chartInstance.destroy();
    _chartInstance = null;
  }

  // Wrap in a fixed-height div so Chart.js does not expand infinitely.
  const wrapper = document.createElement('div');
  wrapper.className = 'chart-container';
  wrapper.style.height = '220px';

  const canvas = document.createElement('canvas');
  canvas.id = 'wellbeing-chart';

  // Fix 4: Accessibility attributes on the canvas element.
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'WHO-5 wellbeing score over time');

  wrapper.appendChild(canvas);
  container.appendChild(wrapper);

  const labels = entries.map((e) => formatDateShort(e.date));
  const scores = entries.map((e) => e.scaled_score);

  // Fix 1: Assign to module-level variable instead of a local one.
  _chartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'WHO-5 Score',
          data: scores,
          borderColor: '#4A90E2',
          backgroundColor: 'rgba(74, 144, 226, 0.08)',
          pointBackgroundColor: '#4A90E2',
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2,
          fill: false,
          tension: 0.3,
        },
        {
          label: 'Good wellbeing',
          data: entries.map(() => 72),
          borderColor: '#27ae60',
          borderDash: [6, 4],
          pointRadius: 0,
          borderWidth: 1.5,
          fill: false,
        },
        {
          label: 'Clinical threshold',
          data: entries.map(() => 52),
          borderColor: '#e67e22',
          borderDash: [6, 4],
          pointRadius: 0,
          borderWidth: 1.5,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            boxWidth: 14,
            font: { size: 11 },
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (ctx.datasetIndex === 0) {
                return ` Score: ${ctx.parsed.y}%`;
              }
              return ` ${ctx.dataset.label}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 }, maxRotation: 45, minRotation: 0 },
        },
        y: {
          min: 0,
          max: 100,
          ticks: {
            font: { size: 11 },
            callback: (value) => `${value}%`,
            stepSize: 20,
          },
          grid: { color: 'rgba(0,0,0,0.06)' },
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

/**
 * Build and return the HTML string for the entries table.
 * Entries are expected newest-first (descending).
 * @param {Object[]} entries  - descending-sorted array of entry objects
 * @returns {string}
 */
function buildTableHTML(entries) {
  const rows = entries
    .map((entry) => {
      const dateLabel = escapeHTML(formatDateLong(entry.date));
      const location = escapeHTML(entry.location || 'Unknown');
      const raw = entry.raw_score;
      const scaled = entry.scaled_score;
      const badge = getBadge(scaled);

      return `
        <tr>
          <td class="history-table__date">${dateLabel}</td>
          <td class="history-table__location">${location}</td>
          <td class="history-table__score">
            ${raw} / 25 (${scaled}%)
            ${badge}
          </td>
        </tr>`;
    })
    .join('');

  return `
    <div class="history-table-wrapper">
      <table class="history-table" aria-label="Survey history">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Location</th>
            <th scope="col">Score</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Initialise (or refresh) the History screen.
 * Called by app.js every time the user navigates to the History tab.
 */
export async function initHistoryScreen() {
  const screen = document.getElementById('screen-history');
  if (!screen) return;

  // Clear previous content so we get a clean rebuild on every navigation.
  screen.innerHTML = '';

  // Header
  const header = document.createElement('h1');
  header.className = 'screen-header';
  header.textContent = 'History';
  screen.appendChild(header);

  let entries;
  try {
    entries = await getAllEntries(); // ascending by date
  } catch (err) {
    console.error('initHistoryScreen — getAllEntries failed:', err);
    const errMsg = document.createElement('p');
    errMsg.className = 'history-error';
    errMsg.textContent = 'Could not load entries. Please try again.';
    screen.appendChild(errMsg);
    return;
  }

  // Empty state
  if (!entries || entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent =
      'No entries yet. Complete your first survey to see your history here.';
    screen.appendChild(empty);
    return;
  }

  // --- Chart (ascending order) ---
  const chartSection = document.createElement('section');
  chartSection.className = 'history-chart-section';
  screen.appendChild(chartSection);
  renderChart(chartSection, entries);

  // --- Summary stats ---
  const count = entries.length;
  const avg = Math.round(
    entries.reduce((sum, e) => sum + e.scaled_score, 0) / count
  );
  const summary = document.createElement('p');
  summary.className = 'history-summary';
  summary.textContent = `${count} ${count === 1 ? 'entry' : 'entries'} · Avg score: ${avg}%`;
  screen.appendChild(summary);

  // --- Entries table (descending order — newest first) ---
  const descEntries = [...entries].reverse();
  const tableSection = document.createElement('section');
  tableSection.className = 'history-table-section';
  tableSection.innerHTML = buildTableHTML(descEntries);
  screen.appendChild(tableSection);
}
