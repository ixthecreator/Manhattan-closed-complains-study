# Manhattan closed complains study

An interactive study of NYC 311 residential noise complaints, built with HTML, CSS, JavaScript and Chart.js.

[Live study](https://ixthecreator.github.io/Manhattan-closed-complains-study/)

## Run

From this folder, run `npm run dev` and open `http://127.0.0.1:8781/`. No dependency installation is needed.

## Views

Three modes

Choose **View → Chart**:

- **Waiting time** — submission-to-closure intervals.
- **Submission date** — submission date versus hours to closure.
- **Official responses** — request counts grouped by identical replies.

Select records, filter replies, toggle labels or export the current chart as PNG.

## Files

| Files | Purpose |
| --- | --- |
| `index.html`, `style.css` | Desktop layout and styling. |
| `app.js` | Loading, shared state, filtering, selection and export. |
| `plot.js`, `studies.js` | Timeline and alternative chart configurations. |
| `data/requests.json` | Processed records and generated statistics. |
| `data/source-records.json` | Original sample fields for verification. |
| `scripts/collect.py` | Data collection and processing. |
| `vendor/` | Chart.js 4.5.1 and its MIT license. |
| `package.json` | Local server command. |
| `.gitignore` | Research snapshots, caches and generated files excluded from Git. |

## Data

Source: [NYC 311](https://data.cityofnewyork.us/Social-Services/311-Service-Requests-from-2020-to-Present/erm2-nwe9).

Data was captured in October 12, 2026, containing 300 records selected from 5,264 Manhattan residential-noise complaints submitted in September: ten midpoint-spaced records per day. 

All selected records are marked Closed, and that status does not establish whether the noise stopped.
