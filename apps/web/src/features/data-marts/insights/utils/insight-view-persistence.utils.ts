const PREVIEW_PREF_KEY = 'owox.insight.preview.closed';
const PREVIEW_SIZE_KEY = 'owox.insight.preview.size';
const PREVIEW_COLLAPSED_SIZE = 0;
const PREVIEW_DEFAULT_SIZE = 45;

export function readPreviewPref(): boolean {
  try {
    return localStorage.getItem(PREVIEW_PREF_KEY) !== 'false'; // default: closed
  } catch {
    return true;
  }
}

export function savePreviewPref(closed: boolean) {
  try {
    localStorage.setItem(PREVIEW_PREF_KEY, String(closed));
  } catch (err) {
    console.warn('Failed to save preview preference to localStorage', err);
  }
}

export function readPreviewSize(): number {
  try {
    const val = localStorage.getItem(PREVIEW_SIZE_KEY);
    if (val === null) return PREVIEW_DEFAULT_SIZE;
    const n = Number(val);
    if (n > PREVIEW_COLLAPSED_SIZE && n <= 100) return n;
  } catch (err) {
    console.warn('Failed to read preview size from localStorage', err);
  }
  return PREVIEW_DEFAULT_SIZE;
}

export function savePreviewSize(size: number) {
  try {
    localStorage.setItem(PREVIEW_SIZE_KEY, String(size));
  } catch (err) {
    console.warn('Failed to save preview size to localStorage', err);
  }
}

const AI_PREF_KEY = 'owox.insight.ai.closed';
const AI_SIZE_KEY = 'owox.insight.ai.size';
const AI_COLLAPSED_SIZE = 0;
const AI_DEFAULT_SIZE = 28;

export function readAiPref(): boolean {
  try {
    return localStorage.getItem(AI_PREF_KEY) === 'true'; // default: open
  } catch {
    return false;
  }
}

export function saveAiPref(closed: boolean) {
  try {
    localStorage.setItem(AI_PREF_KEY, String(closed));
  } catch (err) {
    console.warn('Failed to save AI preference to localStorage', err);
  }
}

export function readAiSize(): number {
  try {
    const val = localStorage.getItem(AI_SIZE_KEY);
    if (val === null) return AI_DEFAULT_SIZE;
    const n = Number(val);
    if (n > AI_COLLAPSED_SIZE && n <= 100) return n;
  } catch (err) {
    console.warn('Failed to read AI size from localStorage', err);
  }
  return AI_DEFAULT_SIZE;
}

export function saveAiSize(size: number) {
  try {
    localStorage.setItem(AI_SIZE_KEY, String(size));
  } catch (err) {
    console.warn('Failed to save AI size to localStorage', err);
  }
}

export const PREVIEW_CONSTANTS = {
  COLLAPSED_SIZE: PREVIEW_COLLAPSED_SIZE,
  DEFAULT_SIZE: PREVIEW_DEFAULT_SIZE,
};

export const AI_CONSTANTS = {
  COLLAPSED_SIZE: AI_COLLAPSED_SIZE,
  DEFAULT_SIZE: AI_DEFAULT_SIZE,
};

const ARTIFACTS_PREF_KEY = 'owox.insight.artifacts.closed';

export function readArtifactsPref(): boolean {
  try {
    const val = localStorage.getItem(ARTIFACTS_PREF_KEY);
    return val !== 'false'; // default: closed
  } catch {
    return true;
  }
}

export function saveArtifactsPref(closed: boolean) {
  try {
    localStorage.setItem(ARTIFACTS_PREF_KEY, String(closed));
  } catch (err) {
    console.warn('Failed to save artifacts preference to localStorage', err);
  }
}
