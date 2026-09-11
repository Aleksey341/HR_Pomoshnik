/** Shared UI session state for results, reports and quality. */

let lastPayload = null;
let lastAiReport = '';
let lastQuality = null;
let reportVariants = {};

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
  lastAiReport = String(text || '');
}

export function getLastQuality() {
  return lastQuality;
}

export function setLastQuality(value) {
  lastQuality = value || null;
}

export function getReportVariants() {
  return { ...reportVariants };
}

export function setReportVariant(key, text) {
  if (!key) return;
  reportVariants = { ...reportVariants, [key]: String(text || '') };
}

export function setReportVariants(value) {
  reportVariants = value && typeof value === 'object' ? { ...value } : {};
}

export function clearReportVariants() {
  reportVariants = {};
}
