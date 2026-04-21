import {
  supportsFileSystemAccess,
  connectExistingFile,
  createDataFile,
  getSavedHandle,
  loadData,
  writeData,
  normalizeData,
  profileValidationError
} from "./core.js";

const openBtn = document.querySelector("#open-file-btn");
const createBtn = document.querySelector("#create-file-btn");
const saveSetupBtn = document.querySelector("#save-setup-btn");
const status = document.querySelector("#status");
const fileNameText = document.querySelector("#file-name");

const startDateInput = document.querySelector("#start-date");
const startWeightInput = document.querySelector("#start-weight");
const targetDateInput = document.querySelector("#target-date");
const targetWeightInput = document.querySelector("#target-weight");

let startDatePicker = null;
let targetDatePicker = null;

let fileHandle = null;
let data = null;

init().catch((error) => setStatus(error.message, true));

async function init() {
  initDatePickers();

  if (!supportsFileSystemAccess()) {
    setStatus("This browser does not support File System Access API. Use Edge or Chrome.", true);
    disableControls(true);
    return;
  }

  const savedHandle = await getSavedHandle();
  if (savedHandle) {
    fileHandle = savedHandle;
    try {
      data = await loadData(fileHandle);
      fillProfile(data.profile);
      fileNameText.textContent = fileHandle.name || "data.json";
      setStatus("Connected to data file.");
    } catch {
      setStatus("Saved file handle needs reconnect. Click Open Existing File.", true);
    }
  }
}

openBtn.addEventListener("click", async () => {
  try {
    fileHandle = await connectExistingFile();
    data = normalizeData(await loadData(fileHandle));
    fillProfile(data.profile);
    fileNameText.textContent = fileHandle.name || "data.json";
    setStatus("Existing file connected.");
  } catch (error) {
    setStatus(error.message || "Could not open file.", true);
  }
});

createBtn.addEventListener("click", async () => {
  try {
    fileHandle = await createDataFile();
    data = normalizeData(await loadData(fileHandle));
    fillProfile(data.profile);
    fileNameText.textContent = fileHandle.name || "data.json";
    setStatus("New data.json created and connected.");
  } catch (error) {
    setStatus(error.message || "Could not create file.", true);
  }
});

saveSetupBtn.addEventListener("click", async () => {
  if (!fileHandle) {
    setStatus("Connect or create data.json first.", true);
    return;
  }

  const profile = {
    startDate: startDateInput.value,
    startWeight: Number.parseFloat(startWeightInput.value),
    targetDate: targetDateInput.value,
    targetWeight: Number.parseFloat(targetWeightInput.value)
  };

  const validationError = profileValidationError(profile);
  if (validationError) {
    setStatus(validationError, true);
    return;
  }

  data = data || normalizeData({});
  data.profile = {
    ...profile,
    startWeight: Number.isFinite(profile.startWeight) ? Number(profile.startWeight.toFixed(2)) : null,
    targetWeight: Number(profile.targetWeight.toFixed(2))
  };

  await saveData();
  setStatus("Setup saved.");
});

async function saveData() {
  try {
    await writeData(fileHandle, data);
  } catch (error) {
    setStatus(error.message || "Save failed.", true);
  }
}

function fillProfile(profile) {
  startDateInput.value = profile.startDate || "";
  startWeightInput.value = Number.isFinite(profile.startWeight) ? String(profile.startWeight) : "";
  targetDateInput.value = profile.targetDate || "";
  targetWeightInput.value = Number.isFinite(profile.targetWeight) ? String(profile.targetWeight) : "";

  if (startDatePicker) {
    startDatePicker.setDate(profile.startDate || "", false, "Y-m-d");
  }
  if (targetDatePicker) {
    targetDatePicker.setDate(profile.targetDate || "", false, "Y-m-d");
  }
}

function initDatePickers() {
  if (typeof window.flatpickr !== "function") {
    return;
  }

  const locale = {
    firstDayOfWeek: 1
  };

  startDatePicker = window.flatpickr(startDateInput, {
    dateFormat: "Y-m-d",
    altInput: true,
    altFormat: "d-m-Y",
    allowInput: true,
    locale
  });

  targetDatePicker = window.flatpickr(targetDateInput, {
    dateFormat: "Y-m-d",
    altInput: true,
    altFormat: "d-m-Y",
    allowInput: true,
    locale
  });
}

function setStatus(text, isError = false) {
  status.textContent = text;
  status.className = isError
    ? "rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700"
    : "rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700";
}

function disableControls(disabled) {
  [openBtn, createBtn, saveSetupBtn].forEach((el) => {
    el.disabled = disabled;
  });
}
