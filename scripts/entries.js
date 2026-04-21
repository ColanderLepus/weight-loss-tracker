import {
  supportsFileSystemAccess,
  getSavedHandle,
  loadData,
  writeData,
  createEntryId,
  formatDate
} from "./core.js";

const connectBtn = document.querySelector("#go-setup-btn");
const form = document.querySelector("#entry-form");
const dateInput = document.querySelector("#entry-date");
const weightInput = document.querySelector("#entry-weight");
const rows = document.querySelector("#entry-rows");

const todayISO = new Date().toISOString().split("T")[0];
dateInput.value = todayISO;

let datePicker = null;

let fileHandle = null;
let data = null;
let saveTimer = null;

init().catch(() => {});

async function init() {
  initDatePicker();

  if (!supportsFileSystemAccess()) {
    form.querySelector("button[type='submit']").disabled = true;
    return;
  }

  fileHandle = await getSavedHandle();
  if (!fileHandle) {
    connectBtn.classList.remove("hidden");
    return;
  }

  data = await loadData(fileHandle);
  renderEntries();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!data) {
    return;
  }

  const date = dateInput.value;
  const weight = Number.parseFloat(weightInput.value);

  if (!date || Number.isNaN(weight) || weight <= 0) {
    return;
  }

  if (data.profile?.startDate && date === data.profile.startDate) {
    return;
  }

  const id = createEntryId(date);
  const existingIndex = data.entries.findIndex((entry) => entry.id === id);
  const normalizedWeight = Number(weight.toFixed(2));

  if (existingIndex >= 0) {
    data.entries[existingIndex] = { id, date, weight: normalizedWeight };
  } else {
    data.entries.push({ id, date, weight: normalizedWeight });
  }

  data.entries.sort((a, b) => a.date.localeCompare(b.date));
  renderEntries();
  queueSave();

  form.reset();
  if (datePicker) {
    datePicker.setDate(todayISO, true, "Y-m-d");
  } else {
    dateInput.value = todayISO;
  }
  weightInput.focus();
});

rows.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const id = target.dataset.entryId;
  if (!id || !data) {
    return;
  }

  if (target.matches("[data-action='delete']")) {
    data.entries = data.entries.filter((entry) => entry.id !== id);
    renderEntries();
    queueSave();
  }

  if (target.matches("[data-action='edit']")) {
    const entry = data.entries.find((candidate) => candidate.id === id);
    if (!entry) {
      return;
    }

    dateInput.value = entry.date;
    if (datePicker) {
      datePicker.setDate(entry.date, true, "Y-m-d");
    }
    weightInput.value = String(entry.weight);
    weightInput.focus();
  }
});

function renderEntries() {
  rows.innerHTML = "";

  const displayEntries = getDisplayEntries();

  if (!displayEntries.length) {
    rows.innerHTML = '<tr><td colspan="3" class="px-4 py-4 text-slate-500">No entries yet.</td></tr>';
    return;
  }

  displayEntries.forEach((entry) => {
    const tr = document.createElement("tr");
    tr.className = "border-b border-slate-200/70";
    const isLockedStart = entry.id === "__setup_start__";
    const actionCell = isLockedStart
      ? '<span class="rounded-md bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-200">Setup only</span>'
      : `<div class="flex gap-2">
            <button data-action="edit" data-entry-id="${entry.id}" class="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">Edit</button>
            <button data-action="delete" data-entry-id="${entry.id}" class="rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-500">Delete</button>
          </div>`;

    tr.innerHTML = `
        <td class="px-4 py-3">${formatDate(entry.date)}</td>
        <td class="px-4 py-3 font-semibold">${entry.weight.toFixed(2)} kg</td>
        <td class="px-4 py-3">
          ${actionCell}
        </td>
      `;
    rows.append(tr);
  });
}

function queueSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }

  saveTimer = setTimeout(async () => {
    try {
      await writeData(fileHandle, data);
    } catch (error) {
      // silently fail
    }
  }, 180);
}

function getDisplayEntries() {
  const lockedStart = getLockedStartEntry();
  const rest = [...data.entries].sort((a, b) => a.date.localeCompare(b.date));

  if (!lockedStart) {
    return rest;
  }

  return [lockedStart, ...rest.filter((entry) => entry.date !== lockedStart.date)];
}

function getLockedStartEntry() {
  if (!data?.profile?.startDate || !Number.isFinite(data?.profile?.startWeight)) {
    return null;
  }

  return {
    id: "__setup_start__",
    date: data.profile.startDate,
    weight: Number(data.profile.startWeight)
  };
}

function initDatePicker() {
  if (typeof window.flatpickr !== "function") {
    return;
  }

  datePicker = window.flatpickr(dateInput, {
    dateFormat: "Y-m-d",
    altInput: true,
    altFormat: "d-m-Y",
    allowInput: true,
    locale: {
      firstDayOfWeek: 1
    }
  });

  datePicker.setDate(todayISO, true, "Y-m-d");
}
