import { openDB } from './db.js';
import { initSurveyScreen } from './survey.js';
import { initHistoryScreen } from './history.js';
import { initExportScreen } from './export.js';

// Map screen IDs to their init functions
const screenInitializers = {
  'screen-survey': initSurveyScreen,
  'screen-history': initHistoryScreen,
  'screen-export': initExportScreen,
};

/**
 * Show a screen by its ID (e.g. 'screen-survey').
 * Removes 'active' from all screens and nav buttons, then
 * activates the target screen and calls its init function.
 *
 * @param {string} screenId - The ID of the section to show
 */
export function showScreen(screenId) {
  // Update screen visibility
  document.querySelectorAll('.screen').forEach((screen) => {
    screen.classList.remove('active');
  });
  const targetScreen = document.getElementById(screenId);
  if (targetScreen) {
    targetScreen.classList.add('active');
  }

  // Update nav button active states
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    if (btn.dataset.target === screenId) {
      btn.classList.add('nav-btn--active');
    } else {
      btn.classList.remove('nav-btn--active');
    }
  });

  // Call the screen's init function if one is registered
  const initFn = screenInitializers[screenId];
  if (typeof initFn === 'function') {
    initFn();
  }
}

// Bootstrap the app once the DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await openDB();
  } catch (err) {
    console.error('Failed to initialize database:', err);
    // App can still work for viewing; survey submission will fail gracefully
  }

  // Wire up bottom nav buttons
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      showScreen(btn.dataset.target);
    });
  });

  // Show the survey screen by default
  showScreen('screen-survey');
});
