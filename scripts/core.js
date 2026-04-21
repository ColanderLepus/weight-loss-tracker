const DB_NAME = "weight-tracker-fs";
const STORE_NAME = "handles";
const HANDLE_KEY = "data-file-handle";
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CUMULATIVE_DAYS_BY_MONTH = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

export const DEFAULT_DATA = {
  version: 1,
  profile: {
    startDate: "",
    startWeight: null,
    targetDate: "",
    targetWeight: null
  },
  entries: [],
  updatedAt: ""
};

export function supportsFileSystemAccess() {
  return (
    window.isSecureContext &&
    "showOpenFilePicker" in window &&
    "showSaveFilePicker" in window
  );
}

export async function connectExistingFile() {
  const [handle] = await window.showOpenFilePicker({
    multiple: false,
    types: [
      {
        description: "JSON Files",
        accept: { "application/json": [".json"] }
      }
    ]
  });

  await ensureReadWritePermission(handle);
  await saveHandle(handle);
  return handle;
}

export async function createDataFile() {
  const handle = await window.showSaveFilePicker({
    suggestedName: "data.json",
    types: [
      {
        description: "JSON Files",
        accept: { "application/json": [".json"] }
      }
    ]
  });

  await ensureReadWritePermission(handle);
  await writeData(handle, DEFAULT_DATA);
  await saveHandle(handle);
  return handle;
}

export async function getSavedHandle() {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  return promisifyRequest(store.get(HANDLE_KEY));
}

export async function loadData(handle) {
  const file = await handle.getFile();
  const text = await file.text();

  if (!text.trim()) {
    return structuredClone(DEFAULT_DATA);
  }

  const parsed = JSON.parse(text);
  return normalizeData(parsed);
}

export async function writeData(handle, data) {
  const writable = await handle.createWritable();
  const payload = {
    ...normalizeData(data),
    updatedAt: localDateYmd()
  };
  await writable.write(JSON.stringify(payload, null, 2));
  await writable.close();
}

export function normalizeData(input) {
  const safeProfile = {
    startDate: typeof input?.profile?.startDate === "string" && isIsoDateString(input.profile.startDate) ? input.profile.startDate : "",
    startWeight: Number.isFinite(input?.profile?.startWeight) ? input.profile.startWeight : null,
    targetDate: typeof input?.profile?.targetDate === "string" && isIsoDateString(input.profile.targetDate) ? input.profile.targetDate : "",
    targetWeight: Number.isFinite(input?.profile?.targetWeight) ? input.profile.targetWeight : null
  };

  const safeEntries = Array.isArray(input?.entries)
    ? input.entries
        .filter(
          (entry) =>
            typeof entry?.id === "string" &&
            typeof entry?.date === "string" &&
            entry.id === entry.date &&
            isIsoDateString(entry.date) &&
            Number.isFinite(entry?.weight)
        )
        .map((entry) => ({
          id: entry.id,
          date: entry.date,
          weight: Number(entry.weight)
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];

  return {
    version: 1,
    profile: safeProfile,
    entries: safeEntries,
    updatedAt: typeof input?.updatedAt === "string" ? input.updatedAt : ""
  };
}

export function createEntryId(date) {
  return date;
}

function isIsoDateString(value) {
  return parseIsoDateParts(value) !== null;
}

export function formatDate(dateString) {
  const parts = parseIsoDateParts(dateString);
  if (!parts) {
    return dateString;
  }

  const day = String(parts.day).padStart(2, "0");
  const month = String(parts.month).padStart(2, "0");
  return `${day}-${month}-${parts.year}`;
}

export function localDateYmd(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function daysBetweenIsoDates(startDate, endDate) {
  const startParts = parseIsoDateParts(startDate);
  const endParts = parseIsoDateParts(endDate);

  if (!startParts || !endParts) {
    return NaN;
  }

  const startDayNumber = toDayNumber(startParts.year, startParts.month, startParts.day);
  const endDayNumber = toDayNumber(endParts.year, endParts.month, endParts.day);
  return endDayNumber - startDayNumber;
}

export function buildIsoDateRange(startDate, endDate) {
  const startParts = parseIsoDateParts(startDate);
  const endParts = parseIsoDateParts(endDate);

  if (!startParts || !endParts) {
    return [];
  }

  const startDayNumber = toDayNumber(startParts.year, startParts.month, startParts.day);
  const endDayNumber = toDayNumber(endParts.year, endParts.month, endParts.day);

  if (endDayNumber < startDayNumber) {
    return [];
  }

  const result = [];
  let year = startParts.year;
  let month = startParts.month;
  let day = startParts.day;

  for (let dayNumber = startDayNumber; dayNumber <= endDayNumber; dayNumber += 1) {
    result.push(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    day += 1;

    if (day > daysInMonth(year, month)) {
      day = 1;
      month += 1;

      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  }

  return result;
}

export function isProfileComplete(profile) {
  return (
    typeof profile?.startDate === "string" &&
    typeof profile?.targetDate === "string" &&
    Number.isFinite(profile?.startWeight) &&
    Number.isFinite(profile?.targetWeight)
  );
}

export function profileValidationError(profile) {
  if (
    typeof profile?.startDate !== "string" ||
    !profile.startDate ||
    !Number.isFinite(profile?.startWeight) ||
    typeof profile?.targetDate !== "string" ||
    !profile.targetDate ||
    !Number.isFinite(profile?.targetWeight)
  ) {
    return "Start date, start weight, target date, and target weight are required.";
  }

  if (profile.startWeight <= 0 || profile.targetWeight <= 0) {
    return "Start weight and target weight must be greater than 0.";
  }

  if (profile.targetDate <= profile.startDate) {
    return "Target date must be after start date.";
  }

  if (Number.isFinite(profile.startWeight) && profile.targetWeight >= profile.startWeight) {
    return "Target weight should be lower than start weight for weight loss.";
  }

  return "";
}

async function saveHandle(handle) {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  await promisifyRequest(store.put(handle, HANDLE_KEY));
}

async function ensureReadWritePermission(handle) {
  const opts = { mode: "readwrite" };
  if ((await handle.queryPermission(opts)) === "granted") {
    return;
  }

  if ((await handle.requestPermission(opts)) !== "granted") {
    throw new Error("File permission was not granted.");
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function parseIsoDateParts(value) {
  if (!ISO_DATE_PATTERN.test(value)) {
    return null;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  if (month < 1 || month > 12) {
    return null;
  }

  if (day < 1 || day > daysInMonth(year, month)) {
    return null;
  }

  return { year, month, day };
}

function daysInMonth(year, month) {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }

  if (month === 4 || month === 6 || month === 9 || month === 11) {
    return 30;
  }

  return 31;
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function toDayNumber(year, month, day) {
  const yearsBefore = year - 1;
  const leapDaysBeforeYear =
    Math.floor(yearsBefore / 4) - Math.floor(yearsBefore / 100) + Math.floor(yearsBefore / 400);
  const daysBeforeYear = yearsBefore * 365 + leapDaysBeforeYear;

  const dayOfYearBase = CUMULATIVE_DAYS_BY_MONTH[month - 1];
  const leapOffset = month > 2 && isLeapYear(year) ? 1 : 0;
  const dayOfYear = dayOfYearBase + leapOffset + day;

  const epochYear = 1970;
  const epochYearsBefore = epochYear - 1;
  const epochLeapDays =
    Math.floor(epochYearsBefore / 4) - Math.floor(epochYearsBefore / 100) + Math.floor(epochYearsBefore / 400);
  const daysBeforeEpoch = epochYearsBefore * 365 + epochLeapDays;

  return daysBeforeYear + dayOfYear - (daysBeforeEpoch + 1);
}
