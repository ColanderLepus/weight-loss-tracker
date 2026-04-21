const DB_NAME = "weight-tracker-fs";
const STORE_NAME = "handles";
const HANDLE_KEY = "data-file-handle";
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
  return "showOpenFilePicker" in window && "showSaveFilePicker" in window;
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
    updatedAt: new Date().toISOString()
  };
  await writable.write(JSON.stringify(payload, null, 2));
  await writable.close();
}

export function normalizeData(input) {
  const safeProfile = {
    startDate: typeof input?.profile?.startDate === "string" ? input.profile.startDate : "",
    startWeight: Number.isFinite(input?.profile?.startWeight) ? input.profile.startWeight : null,
    targetDate: typeof input?.profile?.targetDate === "string" ? input.profile.targetDate : "",
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
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }

  const utcDate = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(utcDate.getTime()) && utcDate.toISOString().slice(0, 10) === value;
}

export function formatDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
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
