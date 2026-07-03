/**
 * One-time migration helper. Run exportSheetsForFirestore() in Apps Script,
 * then download the generated JSON file from Google Drive.
 */
function exportSheetsForFirestore() {
  const spreadsheet = getSpreadsheet();
  const output = {};

  spreadsheet.getSheets().forEach(function (sheet) {
    output[sheet.getName()] = sheet.getDataRange().getValues();
  });

  const fileName = 'nextgen-play-sheet-export-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  const file = DriveApp.createFile(fileName, JSON.stringify(output), MimeType.PLAIN_TEXT);
  Logger.log('Export created: ' + file.getUrl());
  return file.getUrl();
}
