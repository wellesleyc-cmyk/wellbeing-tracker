// survey.js — WHO-5 Wellbeing survey screen for wellbeing-tracker
// Dynamically builds and manages #screen-survey content.

import { saveEntry, getEntry } from './db.js';
import { detectLocation } from './location.js';

// ---------------------------------------------------------------------------
// WHO-5 question definitions
// ---------------------------------------------------------------------------

const QUESTIONS = [
  'I have felt cheerful and in good spirits',
  'I have felt calm and relaxed',
  'I have felt active and vigorous',
  'I woke up feeling fresh and rested',
  'My daily life has been filled with things that interest me',
];

const SCALE_LABELS = [
  'At no time',
  'Some of the time',
  'Less than half the time',
  'More than half the time',
  'Most of the time',
  'All of the time',
];

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Return today's date key in "YYYY-MM-DD" format (local time).
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
 * Format a Date object as e.g. "Sunday, 8 March 2026".
 * @param {Date} date
 * @returns {string}
 */
function formatDateHeader(date) {
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Derive an interpretation string from a scaled score (0–100).
 * @param {number} scaled
 * @returns {string}
 */
function getInterpretation(scaled) {
  if (scaled >= 72) return 'Good wellbeing';
  if (scaled >= 52) return 'Moderate wellbeing';
  return 'Low wellbeing — consider speaking to a healthcare professional';
}

// ---------------------------------------------------------------------------
// DOM builders — fresh (editable) form
// ---------------------------------------------------------------------------

/**
 * Build and inject the editable survey form into #screen-survey.
 * @param {HTMLElement} container  — #screen-survey element
 * @param {object|null} prefill    — existing entry to pre-fill, or null
 * @param {boolean}     isEdit     — true when editing an existing entry
 */
function buildForm(container, prefill, isEdit) {
  const today = getTodayKey();
  const dateLabel = formatDateHeader(new Date());

  // ------------------------------------------------------------------
  // Skeleton HTML — we wire events after injection
  // ------------------------------------------------------------------
  container.innerHTML = `
    <div class="survey-wrapper">
      <h2 class="survey-date">${dateLabel}</h2>

      <!-- Location row -->
      <div class="survey-location-row">
        <span class="location-pin" aria-hidden="true">📍</span>
        <input
          id="location-input"
          class="location-input"
          type="text"
          placeholder="Enter location"
          value="${prefill ? escapeAttr(prefill.location === 'Unknown' ? '' : prefill.location) : ''}"
          aria-label="Location"
        >
        <span id="location-spinner" class="location-spinner" aria-label="Detecting location">&#8987;</span>
      </div>

      <!-- Questions -->
      <div id="questions-container" class="questions-container">
        ${QUESTIONS.map((q, i) => buildQuestionHTML(i, prefill)).join('')}
      </div>

      <!-- Running score -->
      <div id="running-score" class="running-score" aria-live="polite">
        Score: <span id="score-raw">0</span> / 25
        &nbsp;(<span id="score-pct">0</span>%)
      </div>

      <!-- Submit -->
      <button id="submit-btn" class="btn btn--primary btn--full" disabled>
        ${isEdit ? 'Update' : 'Submit'}
      </button>
    </div>
  `;

  // ------------------------------------------------------------------
  // Wire score-button events
  // ------------------------------------------------------------------
  const questionsContainer = container.querySelector('#questions-container');
  const submitBtn = container.querySelector('#submit-btn');
  const scoreRaw = container.querySelector('#score-raw');
  const scorePct = container.querySelector('#score-pct');
  const locationInput = container.querySelector('#location-input');
  const locationSpinner = container.querySelector('#location-spinner');

  // Answers array — null means unanswered
  const answers = prefill
    ? [prefill.q1, prefill.q2, prefill.q3, prefill.q4, prefill.q5]
    : [null, null, null, null, null];

  // If prefilling, mark buttons selected immediately
  if (prefill) {
    answers.forEach((val, qi) => {
      const btn = container.querySelector(`.score-btn[data-question="${qi}"][data-value="${val}"]`);
      if (btn) btn.classList.add('selected');
    });
  }

  /**
   * Recompute running score and enable/disable submit.
   */
  function updateScore() {
    const answered = answers.filter((a) => a !== null);
    const raw = answered.reduce((sum, v) => sum + v, 0);
    scoreRaw.textContent = String(raw);
    scorePct.textContent = String(raw * 4);
    submitBtn.disabled = answered.length < 5;
  }

  updateScore();

  // Delegate click events on score buttons
  questionsContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.score-btn');
    if (!btn) return;

    const qi = parseInt(btn.dataset.question, 10);
    const val = parseInt(btn.dataset.value, 10);

    // Deselect sibling buttons for this question
    questionsContainer
      .querySelectorAll(`.score-btn[data-question="${qi}"]`)
      .forEach((b) => b.classList.remove('selected'));

    btn.classList.add('selected');
    answers[qi] = val;
    updateScore();
  });

  // ------------------------------------------------------------------
  // Location detection (non-blocking)
  // ------------------------------------------------------------------
  if (!prefill) {
    // Only auto-detect when not pre-filling from a saved entry
    detectLocation().then((city) => {
      locationSpinner.style.display = 'none';
      locationSpinner.setAttribute('aria-hidden', 'true');
      if (city && !locationInput.value.trim()) {
        locationInput.value = city;
      }
    }).catch(() => {
      locationSpinner.style.display = 'none';
      locationSpinner.setAttribute('aria-hidden', 'true');
    });
  } else {
    locationSpinner.style.display = 'none';
    locationSpinner.setAttribute('aria-hidden', 'true');
  }

  // ------------------------------------------------------------------
  // Submit handler
  // ------------------------------------------------------------------
  submitBtn.addEventListener('click', async () => {
    if (submitBtn.disabled) return;

    const raw = answers.reduce((sum, v) => sum + v, 0);
    const entry = {
      date: today,
      timestamp: new Date().toISOString(),
      location: locationInput.value.trim() || 'Unknown',
      q1: answers[0],
      q2: answers[1],
      q3: answers[2],
      q4: answers[3],
      q5: answers[4],
      raw_score: raw,
      scaled_score: raw * 4,
    };

    try {
      await saveEntry(entry);
    } catch (err) {
      console.error('saveEntry failed:', err);
      alert('Could not save your entry. Please try again.');
      return;
    }

    buildPostSubmit(container, entry);
  });
}

/**
 * Build HTML for a single WHO-5 question block.
 * @param {number}      questionIndex  0-based
 * @param {object|null} prefill
 * @returns {string}
 */
function buildQuestionHTML(questionIndex, prefill) {
  const qi = questionIndex;
  const qNum = qi + 1;
  const qText = QUESTIONS[qi];

  const buttons = Array.from({ length: 6 }, (_, v) => {
    const isSelected = prefill && prefill[`q${qNum}`] === v ? ' selected' : '';
    return `<button
      class="score-btn${isSelected}"
      data-question="${qi}"
      data-value="${v}"
      aria-label="${SCALE_LABELS[v]}"
    >${v}</button>`;
  }).join('');

  const labelCells = SCALE_LABELS.map(
    (label) => `<span class="scale-label">${label}</span>`
  ).join('');

  return `
    <div class="question-block">
      <p class="question-text"><strong>${qNum}.</strong> ${qText}</p>
      <div class="score-buttons" role="group" aria-label="Score for question ${qNum}">
        ${buttons}
      </div>
      <div class="scale-labels" aria-hidden="true">
        ${labelCells}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// DOM builders — post-submit result view
// ---------------------------------------------------------------------------

/**
 * Show the result screen immediately after a successful submit.
 * @param {HTMLElement} container
 * @param {object}      entry
 */
function buildPostSubmit(container, entry) {
  const interpretation = getInterpretation(entry.scaled_score);
  const dateLabel = formatDateHeader(new Date());

  container.innerHTML = `
    <div class="survey-wrapper">
      <h2 class="survey-date">${dateLabel}</h2>

      <div class="result-box">
        <div class="result-check" aria-label="Completed">&#10003; Completed today</div>
        <div class="result-score">
          ${entry.raw_score} / 25
          <span class="result-pct">(${entry.scaled_score}%)</span>
        </div>
        <div class="result-interpretation">${interpretation}</div>
      </div>

      <div class="result-actions">
        <button id="share-btn" class="btn btn--secondary btn--full">Save to iCloud Drive</button>
        <button id="done-btn" class="btn btn--primary btn--full">Done</button>
      </div>
    </div>
  `;

  // Share / download
  container.querySelector('#share-btn').addEventListener('click', async () => {
    const csvContent =
      `date,location,q1,q2,q3,q4,q5,raw_score,scaled_score\n` +
      `${entry.date},${entry.location},${entry.q1},${entry.q2},${entry.q3},` +
      `${entry.q4},${entry.q5},${entry.raw_score},${entry.scaled_score}`;

    const file = new File([csvContent], `wellbeing-${entry.date}.csv`, {
      type: 'text/csv',
    });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Wellbeing Entry' });
      } catch (err) {
        // User cancelled — not an error worth surfacing
        if (err.name !== 'AbortError') {
          console.error('navigator.share failed:', err);
        }
      }
    } else {
      // Fallback: trigger a download
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wellbeing-${entry.date}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  });

  // Done → show read-only view
  container.querySelector('#done-btn').addEventListener('click', () => {
    buildReadOnly(container, entry);
  });
}

// ---------------------------------------------------------------------------
// DOM builders — read-only (already completed today) view
// ---------------------------------------------------------------------------

/**
 * Build the read-only completed-today view.
 * @param {HTMLElement} container
 * @param {object}      entry
 */
function buildReadOnly(container, entry) {
  const dateLabel = formatDateHeader(new Date());

  const questionBlocks = QUESTIONS.map((q, qi) => {
    const qNum = qi + 1;
    const savedVal = entry[`q${qNum}`];

    const buttons = Array.from({ length: 6 }, (_, v) => {
      const isSelected = savedVal === v ? ' selected' : '';
      return `<button
        class="score-btn${isSelected}"
        data-question="${qi}"
        data-value="${v}"
        disabled
        aria-label="${SCALE_LABELS[v]}"
      >${v}</button>`;
    }).join('');

    const labelCells = SCALE_LABELS.map(
      (label) => `<span class="scale-label">${label}</span>`
    ).join('');

    return `
      <div class="question-block">
        <p class="question-text"><strong>${qNum}.</strong> ${q}</p>
        <div class="score-buttons" role="group" aria-label="Score for question ${qNum}">
          ${buttons}
        </div>
        <div class="scale-labels" aria-hidden="true">
          ${labelCells}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="survey-wrapper">
      <h2 class="survey-date">${dateLabel}</h2>

      <!-- Location (read-only) -->
      <div class="survey-location-row">
        <span class="location-pin" aria-hidden="true">📍</span>
        <span class="location-readonly">${escapeHTML(entry.location)}</span>
      </div>

      <!-- Completion banner -->
      <div class="completion-banner">
        <span class="completion-check" aria-label="Completed">&#10003; Completed today</span>
        <span class="completion-score-badge">
          ${entry.raw_score} / 25
          <span class="completion-pct">(${entry.scaled_score}%)</span>
        </span>
      </div>

      <!-- Read-only questions -->
      <div class="questions-container questions-container--readonly">
        ${questionBlocks}
      </div>

      <!-- Edit button -->
      <button id="edit-btn" class="btn btn--secondary btn--full">Edit</button>
    </div>
  `;

  // Edit → re-build editable form pre-filled with existing values
  container.querySelector('#edit-btn').addEventListener('click', () => {
    buildForm(container, entry, /* isEdit */ true);
  });
}

// ---------------------------------------------------------------------------
// Escape helpers (avoids XSS when inserting user data into innerHTML)
// ---------------------------------------------------------------------------

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// escapeAttr: same escaping as escapeHTML — both prevent XSS in attribute values
const escapeAttr = escapeHTML;

// ---------------------------------------------------------------------------
// Public export
// ---------------------------------------------------------------------------

/**
 * Initialise (or re-initialise) the Survey screen.
 * Called by app.js every time the user navigates to the Survey tab.
 */
export async function initSurveyScreen() {
  const container = document.getElementById('screen-survey');
  if (!container) {
    console.error('initSurveyScreen: #screen-survey not found in DOM');
    return;
  }

  const today = getTodayKey();
  let existingEntry = null;

  try {
    existingEntry = await getEntry(today);
  } catch (err) {
    console.error('getEntry failed:', err);
  }

  if (existingEntry) {
    buildReadOnly(container, existingEntry);
  } else {
    buildForm(container, null, /* isEdit */ false);
  }
}
