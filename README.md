# Weight Loss Tracker (v1)

Small local web app for tracking weight loss with a single `data.json` file.

## What v1 includes

- Three-page flow: Setup, Entries, Chart
- File-based persistence using the File System Access API
- Auto-save after setup and entry changes
- Goal and progress summary cards on chart page
- Target path overlay and daily date axis labels in `DD Mon` format (for example `20 Apr`)

## App pages

- `index.html`
  - Landing page with links to Setup, Entries, and Chart
- `pages/setup.html`
  - Connect existing `data.json` or create a new one
  - Save start date/weight and target date/weight
- `pages/entries.html`
  - Add or update one entry per date
  - Edit and delete entries
  - Start-date weight from Setup is shown as a locked row
- `pages/chart.html`
  - Shows actual weight trend
  - Shows target path when setup profile is complete
  - Includes Goal, Progress, and Plan Status cards

## Storage model

- Data is stored in one JSON file chosen by the user
- The file handle is saved in IndexedDB so the app can reconnect later
- If file permission changes, reconnect from Setup

### Data shape

```json
{
  "version": 1,
  "profile": {
    "startDate": "2026-04-01",
    "startWeight": 95.2,
    "targetDate": "2026-08-01",
    "targetWeight": 82.0
  },
  "entries": [
    { "id": "2026-04-20", "date": "2026-04-20", "weight": 93.7 }
  ],
  "updatedAt": "2026-04-21T10:15:30.000Z"
}
```

## Browser support

- Recommended: latest desktop Microsoft Edge or Google Chrome
- Other browsers may not support File System Access API

## Run locally

1. Open `index.html` in Edge or Chrome.
2. Open Setup and connect/create `data.json`.
3. Save your goal setup.
4. Use Entries to log weight.
5. Use Chart to review progress.
