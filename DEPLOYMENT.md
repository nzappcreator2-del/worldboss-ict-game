# Deployment and migration checklist

Use this checklist when moving the migrated Vite + React + Firestore app into Firebase Hosting. The project intentionally uses Firebase Hosting, Authentication, and Cloud Firestore only. Do not add or deploy Cloud Functions.

## 1. Firebase Console setup

- Confirm the active Firebase project is `nextgen-play-19dd2`.
- Create the Cloud Firestore database.
- Enable Authentication sign-in methods:
  - Anonymous
  - Email/Password
- Create the admin Email/Password account:
  - Email: `admin@nextgen-play.local`
  - Password: choose a strong private password and do not commit it.

## 2. Local verification before any external write

Run this from the repository root:

```bash
npm install
npm run preflight
npm run test:rules
npm run verify
```

`npm run preflight` checks the Firebase deploy shape before any external write: Firebase Hosting must serve `firebase-app/dist`, Firestore rules/indexes must be wired, the CLI project must match `nextgen-play-19dd2`, and Cloud Functions config/dependencies must not be present.

Preflight also prints non-blocking environment warnings for the final migration machine:

- Install `firebase-tools` before deploying Hosting/Firestore from the CLI.
- Install Java before running Firestore emulator-based rules validation.
- Set `GOOGLE_APPLICATION_CREDENTIALS` only on the machine that will commit the one-time Firestore import.

`npm run test:rules` starts the local Firestore emulator and runs authenticated, ownership, Battle transaction, PVP isolation, and Admin authorization checks against the real rules file. Java 21 or newer must be available on `PATH`.

`npm run verify` runs lint, typecheck, tests, production audit, production build, and the distribution scan that blocks legacy GAS / Cloud Functions patterns from the Hosting output.

## 3. Export the legacy Sheet data

1. Add `legacy-gas/ExportForFirestore.js` to the old Apps Script project.
2. Run `exportSheetsForFirestore()` once in Apps Script.
3. Download the generated JSON export from Google Drive.
4. Keep the JSON export out of git. The root `.gitignore` blocks common `sheet-export*.json` and `*-sheet-export*.json` filenames.

## 4. Dry-run the Firestore import

Run this from the repository root:

```bash
npm run migrate -- path/to/sheet-export.json
```

Check the printed document counts before writing anything. If the importer reports a mapping error such as duplicate headers, invalid Firestore document IDs, duplicate normalized document IDs, non-numeric values in numeric columns, invalid values in boolean columns, malformed JSON in JSON columns, JSON values with the wrong Firestore field type, invalid inventory item counts, or malformed matching-pair items, fix the source Sheet data and rerun the dry-run.
The input path must point to an existing valid JSON export object keyed by legacy sheet names, with recognized sheets exported as two-dimensional arrays including their required ID headers such as `UserID`, `LessonID`, or `QuestionID`. The importer refuses to continue if the file is missing, malformed, empty, missing required headers, or not a legacy sheet export.
The migration command accepts exactly one input file plus optional `--commit`; unknown flags and extra input paths are refused so typos cannot accidentally fall back to a dry-run.

Only public runtime settings are imported from the legacy `Settings` sheet: `TimerPerQuestion`, `Classes`, `Rooms`, `CertHeader`, and `CertFooter`. Legacy secrets or unknown settings keys are intentionally skipped.

## 5. Commit the Firestore import

Create a one-time service account key for the migration machine only. Do not commit the key.
The root `.gitignore` blocks common `service-account*.json`, `*-service-account*.json`, and `*firebase-adminsdk*.json` filenames.
`GOOGLE_APPLICATION_CREDENTIALS` must point to an existing local service-account JSON key file for project `nextgen-play-19dd2` before `--commit`; the importer refuses to write if the path is missing, invalid, missing required credential fields, not a service-account key, or belongs to another Firebase project.

PowerShell:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\service-account-key.json"
npm run migrate -- path/to/sheet-export.json --commit
```

After the import, remove the local key if it is no longer needed.

## 6. Deploy Hosting and Firestore rules

Run this from the repository root:

```bash
firebase deploy --only hosting,firestore:rules,firestore:indexes
```

Hosting has a `predeploy` hook that runs `npm run preflight` and `npm run verify` automatically before upload.

## 7. Post-deploy smoke check

- Open the Firebase Hosting URL.
- Confirm the page loads without `google.script.run` or Apps Script errors in the browser console.
- Confirm student login/register works.
- Confirm a lesson/question flow can read Firestore data.
- Confirm PVP creates and joins a match.
- Confirm World Boss static game pages load from `/world-boss/...`.
- Confirm Admin Panel login works with `admin@nextgen-play.local`.

## Rollback notes

- Hosting rollback can be done from Firebase Console > Hosting > Release history.
- Firestore imports use merge writes. If bad data was imported, repair or delete affected documents from Firestore Console or rerun a corrected export.
- Do not reintroduce `doGet`, `doPost`, `google.script.run`, Google Sheets calls, or Cloud Functions as a rollback shortcut.
