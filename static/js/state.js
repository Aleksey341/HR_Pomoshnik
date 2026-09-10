/** Shared UI session state for results and AI report. */

let lastPayload = null;
let lastAiReport = '';

export function getLastPayload() {
  return lastPayload;
}

export function setLastPayload(payload) {
  lastPayload = payload;
}

export function getLastAiReport() {
  return lastAiReport;
}

export function setLastAiReport(text) {
  lastAiReport = text;
}
