import {
  supportsFileSystemAccess,
  getSavedHandle,
  loadData,
  isProfileComplete
} from "./core.js";

const chartCanvas = document.querySelector("#weight-chart");
const statGoal = document.querySelector("#stat-goal");
const statProgress = document.querySelector("#stat-progress");
const statPace = document.querySelector("#stat-pace");
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const PACE_THRESHOLD_KG = 0.1;
const LEGEND_BOTTOM_GAP = 12;

let chart = null;

const legendBottomGapPlugin = {
  id: "legendBottomGap",
  beforeInit(chartInstance) {
    const originalFit = chartInstance.legend.fit;
    chartInstance.legend.fit = function fit() {
      originalFit.bind(this)();
      this.height += LEGEND_BOTTOM_GAP;
    };
  }
};

init().catch(() => {});

async function init() {
  if (!supportsFileSystemAccess()) {
    return;
  }

  const fileHandle = await getSavedHandle();
  if (!fileHandle) {
    return;
  }

  const data = await loadData(fileHandle);
  renderStats(data);
  renderChart(data);
}

function renderStats(data) {
  const actualSeries = getActualSeries(data);
  const { startWeight, targetWeight } = data.profile;
  const paceCard = statPace.parentElement;

  // Goal: Start → Target
  if (Number.isFinite(startWeight) && Number.isFinite(targetWeight)) {
    statGoal.textContent = `${startWeight.toFixed(2)} → ${targetWeight.toFixed(2)} kg`;
  } else {
    statGoal.textContent = "—";
  }

  // Progress & Remaining
  if (actualSeries.length >= 2) {
    const current = actualSeries[actualSeries.length - 1].weight;
    const delta = Number((current - startWeight).toFixed(2));
    const remaining = Number(Math.abs(targetWeight - current).toFixed(2));
    const sign = delta <= 0 ? "" : "+";
    statProgress.textContent = `${sign}${delta.toFixed(2)} kg / ${remaining.toFixed(2)} to go`;
  } else if (actualSeries.length === 1) {
    const remaining = Number((targetWeight - startWeight).toFixed(2));
    statProgress.textContent = `${remaining.toFixed(2)} kg to go`;
  } else {
    statProgress.textContent = "—";
  }

  // Ahead/Behind plan
  if (actualSeries.length >= 2 && data.profile.targetDate) {
    const today = new Date().toISOString().split("T")[0];
    const current = actualSeries[actualSeries.length - 1].weight;
    const startDate = new Date(`${data.profile.startDate}T00:00:00`);
    const targetDate = new Date(`${data.profile.targetDate}T00:00:00`);
    const todayDate = new Date(`${today}T00:00:00`);
    
    const totalDays = Math.max(1, daysBetween(startDate, targetDate));
    const elapsedDays = Math.max(0, daysBetween(startDate, todayDate));
    const progress = Math.min(1, elapsedDays / totalDays);

    const goalDelta = targetWeight - startWeight;
    const expectedWeight = startWeight + goalDelta * progress;
    const aheadBehind = Number((expectedWeight - current).toFixed(2));
    
    if (aheadBehind > PACE_THRESHOLD_KG) {
      statPace.textContent = `${aheadBehind.toFixed(2)} kg ahead`;
      setPaceCardTone(paceCard, "ahead");
    } else if (aheadBehind < -PACE_THRESHOLD_KG) {
      statPace.textContent = `${Math.abs(aheadBehind).toFixed(2)} kg behind`;
      setPaceCardTone(paceCard, "behind");
    } else {
      statPace.textContent = "On track";
      setPaceCardTone(paceCard, "neutral");
    }
  } else {
    statPace.textContent = "—";
    setPaceCardTone(paceCard, "neutral");
  }
}

function renderChart(data) {
  const firstEntryDate = data.entries.length ? data.entries[0].date : "";
  const lastEntryDate = data.entries.length ? data.entries[data.entries.length - 1].date : "";

  const rangeStart = data.profile.startDate || firstEntryDate;
  const rangeEnd = data.profile.targetDate || lastEntryDate;

  const hasRange = Boolean(rangeStart && rangeEnd && rangeEnd >= rangeStart);
  const rangeDates = hasRange ? buildDateRange(rangeStart, rangeEnd) : data.entries.map((entry) => entry.date);

  const labels = rangeDates.map((date) => formatChartDate(date));
  const entryMap = new Map(data.entries.map((entry) => [entry.date, entry.weight]));
  if (data.profile.startDate && Number.isFinite(data.profile.startWeight)) {
    entryMap.set(data.profile.startDate, Number(data.profile.startWeight));
  }
  const values = rangeDates.map((date) => (entryMap.has(date) ? entryMap.get(date) : null));
  const targetDataset = buildTargetDataset(data.profile, rangeDates);

  const datasets = [
    {
      label: "Actual Weight",
      data: values,
      borderColor: "#0f766e",
      backgroundColor: "rgba(15, 118, 110, 0.16)",
      borderWidth: 3,
      tension: 0.25,
      fill: true,
      pointRadius: 2,
      pointHoverRadius: 4
    },
    ...(targetDataset ? [targetDataset] : [])
  ];

  if (chart) {
    chart.destroy();
  }

  chart = new Chart(chartCanvas, {
    type: "line",
    plugins: [legendBottomGapPlugin],
    data: {
      labels,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            usePointStyle: true,
            padding: 18
          }
        },
        tooltip: {
          filter: function (context) {
            return context.dataset.label !== "Target Path"; // Exclude Target Path from tooltips
          }
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: "#475569",
            autoSkip: false,
            maxRotation: 45,
            minRotation: 0,
            callback: function (_value, index) {
              // Show start date (index 0) and every 7th day after
              if (index === 0 || index % 7 === 0) {
                return labels[index];
              }
              return "";
            }
          }
        },
        y: {
          grid: {
            display: true,
            color: "rgba(148, 163, 184, 0.22)",
            drawBorder: false
          },
          ticks: {
            color: "#475569"
          },
          beginAtZero: false
        }
      }
    }
  });

  if (!getActualSeries(data).length) {
    chart.destroy();
  }
}

function getActualSeries(data) {
  const byDate = new Map(data.entries.map((entry) => [entry.date, entry.weight]));

  if (data.profile.startDate && Number.isFinite(data.profile.startWeight)) {
    byDate.set(data.profile.startDate, Number(data.profile.startWeight));
  }

  return [...byDate.entries()]
    .map(([date, weight]) => ({ date, weight }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildDateRange(startDate, endDate) {
  const result = [];
  const cursor = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  while (cursor <= end) {
    result.push(toIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatChartDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short"
  }).format(date);
}

function setPaceCardTone(card, tone) {
  card.classList.remove("bg-slate-800/60", "bg-emerald-900/40", "bg-rose-900/40");

  if (tone === "ahead") {
    card.classList.add("bg-emerald-900/40");
    return;
  }

  if (tone === "behind") {
    card.classList.add("bg-rose-900/40");
    return;
  }

  card.classList.add("bg-slate-800/60");
}

function daysBetween(startDate, endDate) {
  return (endDate - startDate) / MS_PER_DAY;
}

function buildTargetDataset(profile, rangeDates) {
  if (!isProfileComplete(profile) || !rangeDates.length) {
    return null;
  }

  const targetLine = rangeDates.map(() => null);
  const startIndex = rangeDates.findIndex((date) => date === profile.startDate);
  const endIndex = rangeDates.findIndex((date) => date === profile.targetDate);

  if (startIndex < 0 || endIndex < 0 || endIndex < startIndex) {
    return null;
  }

  if (endIndex === startIndex) {
    targetLine[startIndex] = profile.startWeight;
  } else {
    const totalSteps = endIndex - startIndex;
    const delta = profile.targetWeight - profile.startWeight;

    for (let i = startIndex; i <= endIndex; i += 1) {
      const progress = (i - startIndex) / totalSteps;
      const interpolated = profile.startWeight + delta * progress;
      targetLine[i] = Number(interpolated.toFixed(2));
    }
  }

  return {
    label: "Target Path",
    data: targetLine,
    borderColor: "rgba(190, 18, 60, 0.6)", // Reduced saturation
    borderWidth: 2,
    borderDash: [8, 6],
    pointRadius: 0, // No data point popups
    pointHoverRadius: 0, // No hover effect
    tension: 0
  };
}
