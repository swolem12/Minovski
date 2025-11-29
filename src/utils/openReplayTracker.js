/**
 * OpenReplay Tracker Configuration
 * Session replay and debugging for the drone tracker application
 */

import Tracker from '@openreplay/tracker';
import trackerAssist from '@openreplay/tracker-assist';

// Project key can be configured via environment variable or defaults to the provided key
// Note: OpenReplay project keys are designed to be client-side and are not secret credentials
const PROJECT_KEY = import.meta.env.VITE_OPENREPLAY_PROJECT_KEY || "zXFPKcQIDn8QaN6cHeq1";

// Initialize the OpenReplay tracker
const tracker = new Tracker({
  projectKey: PROJECT_KEY,
});

// Enable the assist plugin for live session support
tracker.use(trackerAssist());

/**
 * Start the OpenReplay tracker
 * Should be called once when the application initializes
 */
export function startTracker() {
  tracker.start();
}

/**
 * Get the tracker instance for advanced usage
 */
export function getTracker() {
  return tracker;
}

export default tracker;
