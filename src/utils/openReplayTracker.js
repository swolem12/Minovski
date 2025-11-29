/**
 * OpenReplay Tracker Configuration
 * Session replay and debugging for the drone tracker application
 */

import Tracker from '@openreplay/tracker';
import trackerAssist from '@openreplay/tracker-assist';

// Initialize the OpenReplay tracker
const tracker = new Tracker({
  projectKey: "zXFPKcQIDn8QaN6cHeq1",
  // Optional: Add additional configuration
  __DISABLE_SECURE_MODE: import.meta.env.DEV, // Disable secure mode in development
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
