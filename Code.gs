/**
 * PeerOna — "Message Us" + "Book Appointment" form receiver
 * Paste this into the Apps Script editor of the Google Sheet that should
 * collect submissions (Extensions > Apps Script), replacing everything
 * that's there now, then deploy it as a Web App.
 *
 * IMPORTANT ONE-TIME STEP before this will work:
 * In the Apps Script editor toolbar, use the function dropdown (next to
 * the Run/Debug buttons) to select "authorizeAccess", then click Run.
 * This triggers Google's permission screen — approve EVERYTHING it lists
 * (Sheets, Drive, Calendar, and sending email as you). This version adds
 * Calendar access on top of what earlier versions used, so re-run
 * authorizeAccess even if you ran an older version of it before. If you've
 * run an older version of this before and it's still only partially
 * authorized, go to myaccount.google.com/connections, open "Untitled
 * project" (or whatever your script is named), click "Delete all" to
 * remove the old partial access, THEN run authorizeAccess again so it
 * re-prompts for the full, correct set of permissions.
 *
 * "Messages" tab column layout (header row):
 * Id | Timestamp | Name | Phone | Message | Image | Image 2 | Image 3 |
 * Image 4 | InLineReply
 * Id is a running number, assigned automatically when a message is saved
 * — not used anywhere yet, kept for future use. InLineReply (column J)
 * holds Dr. Lokesh's reply typed on loki.html. Image / Image 2 / Image 3 /
 * Image 4 are left blank for every message saved after the AllImages tab
 * (below) was introduced — a patient can now attach any number of photos,
 * not just up to 4, and every photo (old and new) is read from AllImages
 * instead. These four columns are untouched history from before that
 * change; nothing deletes them.
 *
 * "Booked Appointments" tab — created automatically on first booking, with
 * columns: Id | Timestamp | Name | Phone | Date | Start Time | End Time |
 * Time Slot | Email | Status | ReScheduled Id | Prescription | Cancelled
 * Reason | Prescription Image | Prescription Image 2. Email is optional
 * (patients can leave it blank). Id is a running number assigned
 * automatically when a booking is made — it's what Dr. Lokesh's Status
 * dropdown and the reschedule link both key off. Status is a dropdown Dr.
 * Lokesh's page (loki.html) sets directly on each row: blank (upcoming),
 * "Cancelled", "ReScheduled", "Finished" or "Past".
 *   - Prescription is a free-text field (up to ~1000 words) Dr. Lokesh or
 *     the Receptionist can fill in from a modal on loki.html, saved
 *     independently of Status. Entirely optional.
 *   - Prescription Image / Prescription Image 2 are two old, now-unused
 *     photo slots from before the AllImages tab (below) existed — kept
 *     exactly as they were, never written to again. Dr. Lokesh or the
 *     Receptionist can now attach any number of photos of the paper
 *     prescription (taken with a phone camera or picked from the gallery)
 *     from that same modal; each is saved to Drive (same shared folder
 *     pattern as the "Message Us" photos) and recorded as its own row in
 *     AllImages instead of one of these two columns. Independent of the
 *     Prescription text field — any number of photos, or none, alongside
 *     any amount of notes text, for a given booking.
 *   - Cancelled Reason is an optional dropdown, selectable per booking (or
 *     applied to a whole batch from the Cancel Dates section) whenever
 *     Status is set to Cancelled: "Doctor Got Busy in an Emergency",
 *     "Doctor not well", "UnPlanned Work Came", "Doctor is on vacation", or
 *     "Clinic Holiday". It's never required to cancel a booking, and is
 *     included in the patient's cancellation email when set.
 *   - A blank ("upcoming") row whose booking End Time has already gone by
 *     (compared in IST) is automatically promoted to "Past" the next time
 *     anything reads or writes this sheet — no scheduled trigger needed,
 *     and Cancelled/ReScheduled/Finished rows are never touched by this.
 *   - Setting Status to "Cancelled" frees that time slot for new bookings
 *     and, if the patient gave an email, sends them a cancellation email
 *     with a link to pick a new slot themselves (reschedule.html).
 *   - When a patient uses that link and successfully books a new slot,
 *     this script automatically sets the ORIGINAL row's Status to
 *     "ReScheduled" and fills in its ReScheduled Id with the new booking's
 *     Id — Dr. Lokesh never has to do this by hand. (Status can still be
 *     set to "ReScheduled" manually from the dropdown too, if needed —
 *     that alone doesn't create a ReScheduled Id.)
 *   - "Finished" is just a plain marker Dr. Lokesh sets once an
 *     appointment is done; it doesn't trigger anything automatically.
 * Rows are kept sorted by Date then Start Time, so appointments are
 * always grouped together by date. You don't need to create this tab
 * yourself.
 *
 * "AllImages" tab — created automatically the first time any photo is
 * uploaded (Message Us or Prescription) or the sheet is otherwise touched.
 * Columns: Id | TimeStamp | SheetName | RowId | Image | AdditionalData.
 * One row per photo, for any number of photos per booking or message — no
 * more fixed-slot cap. SheetName + RowId point back at the booking/message
 * this photo belongs to ('BookedAppointments'/'Messages', same short
 * labels the TransactionLog tab below uses, + that row's own Id). Image is
 * the Drive thumbnail URL; a blank Image means that photo was removed
 * (soft-deleted, so Ids and everything below it never shift). The first
 * time this tab is created, it also backfills every link already sitting
 * in the old Prescription Image/Image 2 and Messages Image/2/3/4 columns,
 * so View Photos shows full history right away — those old columns are
 * only read from during that one-time backfill, never modified. You don't
 * need to create this tab yourself.
 *
 * "Settings" tab — created automatically (seeded with "Address", "Maps
 * Link", "Dr Lokesh Passcode" and "Receptionist Passcode" rows) the first
 * time anyone loads the site or runs this script. Columns: Key | Value.
 * Edit the Value column directly in the sheet to change what shows up on
 * the site — the clinic address text (shown on "Visit Us" and in the Book
 * Appointment form), the Google Maps link that both of those open when
 * clicked (paste any Google Maps share link there to point it somewhere
 * else), and the two passcodes that guard loki.html, one per admin role
 * (change either any time, no redeploy needed) — no code change or
 * redeploy needed. Add more rows with any Key name to make more settings
 * available the same way.
 *
 * loki.html — the private admin page (not linked from the site; reached by
 * going straight to .../loki.html), shared by Dr. Lokesh and the
 * Receptionist. Gated by either the "Dr Lokesh Passcode" or "Receptionist
 * Passcode" Settings value — which one was typed in is also how the audit
 * log (below) knows which of them performed a given save. Lets its user
 * browse appointments and "Message Us" messages by date, set each
 * appointment's Status (saved back here, patients emailed automatically
 * when newly Cancelled if they gave an email), fill in a Prescription,
 * view uploaded photos, and send a reply that's saved into the
 * InLineReply column on the "Messages" tab.
 *
 * reschedule.html — the page the cancellation email links to. A patient
 * opens it, picks a new date/time, and books it — same slot-booking logic
 * as the main site's Book Appointment form, just trimmed down to only
 * that. SITE_BASE_URL below must match wherever this site is actually
 * hosted, so that link works.
 *
 * "Users" / "Actions" / "TransactionLog" tabs — created automatically, the
 * audit trail for every create/modify made to "Booked Appointments" or
 * "Messages" (delete is reserved for later, not used yet). "Users" and
 * "Actions" are small fixed lookup tables (Id | Name, Id | ActionName);
 * "TransactionLog" (Id | TimeStamp | SheetName | RowId | Action | UserId |
 * AdditionalData) has one row per change — RowId is the affected row's own
 * Id within SheetName (the booking or message id), Action and UserId are
 * ids into those two lookup tables, and AdditionalData is a short
 * plain-text detail of what changed (old -> new values, etc).
 * Public-site submissions are always logged as "Patient"; loki.html saves
 * are logged as "Dr Lokesh" or "Receptionist" depending on which passcode
 * was used to log in.
 */

const SHEET_NAME = 'Messages';                      // must match the tab name in your sheet
const APPOINTMENTS_SHEET_NAME = 'Booked Appointments'; // auto-created if missing
const SETTINGS_SHEET_NAME = 'Settings';              // auto-created if missing — global site settings (e.g. clinic address)
const USERS_SHEET_NAME = 'Users';                    // auto-created if missing — audit log lookup table (who)
const ACTIONS_SHEET_NAME = 'Actions';                // auto-created if missing — audit log lookup table (what kind)
const TRANSACTION_LOG_SHEET_NAME = 'TransactionLog'; // auto-created if missing — the audit trail itself
const IMAGE_FOLDER_NAME = 'PeerOna Message Photos';  // Drive folder the photos are saved into
const NOTIFICATION_EMAIL = 'dmsandeep31011981@gmail.com'; // where new submissions/bookings get emailed — change this later
const TIMEZONE = 'Asia/Kolkata'; // all appointment dates/times are India Standard Time

// Users.Id values. Fixed and hard-coded (not looked up by name) because
// nothing ever names a user from outside this script — Code.gs infers the
// actor itself: "Patient" for every public-site write, and "Dr Lokesh" or
// "Receptionist" from which of the two loki.html passcodes was used (see
// resolveLokiUser_ below). Must match the seed rows in getOrCreateUsersSheet_.
const USER_ID_DR_LOKESH = 1;
const USER_ID_RECEPTIONIST = 2;
const USER_ID_PATIENT = 3;

// Actions.Id values. Must match the seed rows in getOrCreateActionsSheet_.
const ACTION_ID_CREATE = 1;
const ACTION_ID_MODIFY = 2;
const ACTION_ID_DELETE = 3; // reserved for future use — nothing deletes data yet

// Base URL the live site is actually served from — used to build the
// "pick a new time" link in the cancellation email. Update this if the
// site ever moves to a different domain.
const SITE_BASE_URL = 'https://peerona.com/';

// Allowed values for the Booked Appointments "Status" column. '' (blank)
// means a normal, upcoming booking — nothing has happened to it yet.
const STATUS_CANCELLED = 'Cancelled';
const STATUS_RESCHEDULED = 'ReScheduled';
const STATUS_FINISHED = 'Finished';
const STATUS_PAST = 'Past';
const STATUS_VALUES = ['', STATUS_CANCELLED, STATUS_RESCHEDULED, STATUS_FINISHED, STATUS_PAST];

// Allowed values for the Booked Appointments "Cancelled Reason" column.
// '' (blank) means no reason was given -- this field is always optional,
// never required to cancel a booking.
const CANCEL_REASON_VALUES = [
  '',
  'Doctor Got Busy in an Emergency',
  'Doctor not well',
  'UnPlanned Work Came',
  'Doctor is on vacation',
  'Clinic Holiday'
];

// Seed rows for the "Settings" sheet the first time it's created. Edit the
// VALUES directly in the sheet afterwards — no code change needed; this
// list is only used once, to create the tab with a sensible starting point.
// loki.html now has one passcode PER ROLE (instead of one shared passcode)
// so the audit log can tell Dr Lokesh's actions apart from the
// Receptionist's — see resolveLokiUser_. An already-existing Settings
// sheet (with the old single "Loki Passcode" row) is upgraded to this
// automatically the first time it's touched — see ensureRolePasscodes_.
const DEFAULT_SETTINGS = [
  ['Address', '221,Rajajinagar,bangalore'],
  ['Maps Link', 'https://www.google.com/maps/search/?api=1&query=12.9865278%2C77.5501667'],
  ['Dr Lokesh Passcode', 'Lokesh@Peerona2026'],
  ['Receptionist Passcode', 'Receptionist@Peerona2026']
];

// No longer read by any code (collectImagesUnlimited_ replaced the old
// fixed 4-slot collectImages_ that used this) -- kept only as a record of
// what the Messages sheet's Image/Image2/Image3/Image4 columns held for
// messages saved before AllImages existed.
const IMAGE_FIELD_SUFFIXES = ['', '2', '3', '4'];

// Column numbers (1-based) of the two optional Prescription Image slots
// on "Booked Appointments" (added after Cancelled Reason). These are kept
// only as HISTORY now -- new prescription photos (and new Message Us
// photos) are no longer written here or into Messages' Image/Image2/3/4
// columns. Both sets of columns stay in their sheets, untouched, holding
// whatever was already in them; every current and future photo instead
// gets one row in the "AllImages" sheet below, which is what View Photos
// / the Prescription gallery actually reads from. See
// getOrCreateAllImagesSheet_, addImageRecord_, getImagesForRow_, and
// migrateExistingImagesToAllImages_ (which copies these old links into
// AllImages once, the first time AllImages is touched).
const PRESCRIPTION_IMAGE_COLUMNS = [14, 15];

// "AllImages" tab — created automatically the first time any code touches
// it, with columns: Id | TimeStamp | SheetName | RowId | Image |
// AdditionalData. One row per photo, for any number of photos per booking
// or message (no more fixed 2-slot / 4-slot cap). SheetName is the same
// short label TransactionLog uses ('BookedAppointments' or 'Messages'),
// RowId is that row's own Id within that sheet, Image is the Drive
// thumbnail URL (blank means removed -- see handleLokiRemovePrescriptionImage_,
// a soft delete that keeps the row instead of shifting everything below
// it), and AdditionalData is a short free-text label ("Prescription Photo",
// "Message Photo 2", etc., with " (migrated)" appended for rows backfilled
// from the old fixed columns).
const ALL_IMAGES_SHEET_NAME = 'AllImages';

// Safety cap on how many photos one Message Us submission can attach in a
// single request -- "any number" for a real patient's phone photos, but
// still a finite bound so one request can't blow up Drive storage or the
// request size. Comfortably above anything the UI's own practical limits
// (file size, how many a person will actually attach) would reach.
const MAX_PHOTOS_PER_MESSAGE = 20;

/**
 * Run this once manually from the Apps Script editor (select it in the
 * function dropdown, click Run) to trigger the permission prompt for
 * everything this script needs: Sheets, Drive, Calendar, and sending email.
 * Also creates every tab this script manages (Messages, Booked
 * Appointments, Settings, Users, Actions, TransactionLog) right away if
 * they don't already exist, seeded with their starting rows -- so you can
 * confirm the new Users/Actions/TransactionLog tabs appeared immediately,
 * instead of waiting for a real booking/message/save to trigger them.
 */
function authorizeAccess() {
  DriveApp.getRootFolder();
  SpreadsheetApp.getActiveSpreadsheet();
  MailApp.getRemainingDailyQuota();
  CalendarApp.getDefaultCalendar();

  getOrCreateMessagesSheet_();
  getOrCreateAppointmentsSheet_();
  getOrCreateSettingsSheet_();
  getOrCreateUsersSheet_();
  getOrCreateActionsSheet_();
  getOrCreateTransactionLogSheet_();
  getOrCreateAllImagesSheet_();
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Scans column A (Id) of the given sheet and returns the next integer to
// use (current max + 1, or 1 if the sheet has no data rows yet). Always
// call this from inside a LockService lock so two near-simultaneous
// submissions never get handed the same Id.
function getNextId_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  let max = 0;
  ids.forEach((row) => {
    const n = Number(row[0]);
    if (!isNaN(n) && n > max) max = n;
  });
  return max + 1;
}

/* ============================================================
 * Audit log — "Users" / "Actions" / "TransactionLog" sheets
 *
 * Every write this script makes to "Booked Appointments" or "Messages"
 * (create or modify — delete is reserved for later) records one row in
 * "TransactionLog" saying when, which sheet, what kind of change, who did
 * it, and a short human-readable detail. "Users" and "Actions" are just
 * lookup tables TransactionLog.UserId / TransactionLog.Action point into,
 * so the log itself stays compact (numbers, not repeated text).
 * ============================================================ */

function getOrCreateUsersSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(USERS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(USERS_SHEET_NAME);
    sheet.appendRow(['Id', 'Name']);
    sheet.getRange(1, 1, 1, 2).setFontWeight('bold');
    sheet.setFrozenRows(1);
    // Must line up with USER_ID_DR_LOKESH / USER_ID_RECEPTIONIST / USER_ID_PATIENT above.
    sheet.appendRow([USER_ID_DR_LOKESH, 'Dr Lokesh']);
    sheet.appendRow([USER_ID_RECEPTIONIST, 'Receptionist']);
    sheet.appendRow([USER_ID_PATIENT, 'Patient']);
  }
  return sheet;
}

function getOrCreateActionsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(ACTIONS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(ACTIONS_SHEET_NAME);
    sheet.appendRow(['Id', 'ActionName']);
    sheet.getRange(1, 1, 1, 2).setFontWeight('bold');
    sheet.setFrozenRows(1);
    // Must line up with ACTION_ID_CREATE / ACTION_ID_MODIFY / ACTION_ID_DELETE above.
    sheet.appendRow([ACTION_ID_CREATE, 'Create']);
    sheet.appendRow([ACTION_ID_MODIFY, 'Modify']);
    sheet.appendRow([ACTION_ID_DELETE, 'Delete']);
  }
  return sheet;
}

function getOrCreateTransactionLogSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(TRANSACTION_LOG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(TRANSACTION_LOG_SHEET_NAME);
    sheet.appendRow(['Id', 'TimeStamp', 'SheetName', 'RowId', 'Action', 'UserId', 'AdditionalData']);
    sheet.getRange(1, 1, 1, 7).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Appends one row to TransactionLog. sheetName is a short label ('BookedAppointments'
// or 'Messages'); rowId is that row's own Id within that sheet (the booking or
// message id the change applies to) -- blank for rare cases where no single row
// is identifiable. actionId/userId are Actions.Id / Users.Id, additionalData is a
// short free-text detail of what changed (see each call site for its format).
function logTransaction_(sheetName, rowId, actionId, userId, additionalData) {
  // Nothing actually needs to READ Users/Actions to append a log row (they're
  // only id lookups the sheet reader joins against), but creating+seeding all
  // three together the first time anything is logged means a brand-new site
  // never ends up with a TransactionLog row pointing at ids no sheet explains.
  getOrCreateUsersSheet_();
  getOrCreateActionsSheet_();
  const sheet = getOrCreateTransactionLogSheet_();
  const newId = getNextId_(sheet);
  sheet.appendRow([newId, new Date(), sheetName, rowId, actionId, userId, additionalData || '']);
}

// Same as logTransaction_, but never throws. Call sites are deep inside an
// already-locked save (Appointments/Messages) — a problem writing the
// *audit* row must never cause the real save to be reported as failed, so
// every call site uses this instead of calling logTransaction_ directly.
function logTransactionSafe_(sheetName, rowId, actionId, userId, additionalData) {
  try {
    logTransaction_(sheetName, rowId, actionId, userId, additionalData);
  } catch (err) {
    // Swallow — the real save already succeeded, which is what matters.
  }
}

/* ============================================================
 * "AllImages" — one row per photo, for any number of photos per
 * BookedAppointments/Messages row. See the ALL_IMAGES_SHEET_NAME comment
 * above for the column layout and why this replaced the old fixed-slot
 * columns.
 * ============================================================ */

function getOrCreateAllImagesSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(ALL_IMAGES_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(ALL_IMAGES_SHEET_NAME);
    sheet.appendRow(['Id', 'TimeStamp', 'SheetName', 'RowId', 'Image', 'AdditionalData']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  migrateExistingImagesToAllImagesSafe_(sheet);
  return sheet;
}

// Appends one row to AllImages and returns its new Id (used by the
// Prescription gallery to delete this exact photo later, independent of
// whatever else has since been added for the same booking).
function addImageRecord_(sheetName, rowId, imageUrl, additionalData) {
  const sheet = getOrCreateAllImagesSheet_();
  const newId = getNextId_(sheet);
  sheet.appendRow([newId, new Date(), sheetName, rowId, imageUrl, additionalData || '']);
  return newId;
}

// Same as addImageRecord_, but never throws — used wherever recording the
// photo must not be allowed to undo an otherwise-successful save (a new
// Message Us submission already wrote its row; a slow/failed AllImages
// write shouldn't turn that into a reported failure).
function addImageRecordSafe_(sheetName, rowId, imageUrl, additionalData) {
  try {
    return addImageRecord_(sheetName, rowId, imageUrl, additionalData);
  } catch (err) {
    return null;
  }
}

// Reads the whole AllImages sheet ONCE and groups it by "sheetName|rowId"
// so getAppointmentsForLoki_/getMessagesForLoki_ can look up each row's
// photos in memory instead of re-reading AllImages once per booking/message
// (which would be an N+1 read pattern on every page load as the sheet
// grows). A blank Image cell (a removed photo — see
// handleLokiRemovePrescriptionImage_) is skipped here, not just filtered
// later, so callers never have to think about soft-deleted rows.
function getAllImagesIndexed_() {
  const sheet = getOrCreateAllImagesSheet_();
  const lastRow = sheet.getLastRow();
  const index = {};
  if (lastRow < 2) return index;

  const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  data.forEach((row) => {
    const url = String(row[4] || '');
    if (!url) return;
    const key = String(row[2] || '') + '|' + String(row[3]);
    if (!index[key]) index[key] = [];
    index[key].push({ id: row[0], url: url, additionalData: String(row[5] || '') });
  });
  return index;
}

// Looks up one row's photos from an index built by getAllImagesIndexed_.
// Always returns an array (possibly empty), never null/undefined, so
// callers can .map()/.length it without a guard.
function getImagesForRow_(index, sheetName, rowId) {
  return index[sheetName + '|' + String(rowId)] || [];
}

// One-time backfill: copies every link already sitting in the old fixed
// columns (Booked Appointments' Prescription Image / Prescription Image 2,
// Messages' Image / Image 2 / Image 3 / Image 4) into AllImages, so
// View Photos / the Prescription gallery show the complete history right
// away instead of only photos uploaded after this feature shipped. Those
// old columns are left exactly as they were — this only ADDS AllImages
// rows, it never touches Booked Appointments or Messages. Guarded by a
// script property so it only runs once per spreadsheet, however many
// times getOrCreateAllImagesSheet_ is called afterward.
function migrateExistingImagesToAllImages_(allImagesSheet) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('ALL_IMAGES_MIGRATED') === 'true') return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rowsToAdd = [];
  let nextId = getNextId_(allImagesSheet);

  const apptSheet = ss.getSheetByName(APPOINTMENTS_SHEET_NAME);
  if (apptSheet) {
    const lastRow = apptSheet.getLastRow();
    if (lastRow >= 2) {
      const ids = apptSheet.getRange(2, 1, lastRow - 1, 1).getValues();
      const timestamps = apptSheet.getRange(2, 2, lastRow - 1, 1).getValues();
      const formulas = apptSheet.getRange(2, PRESCRIPTION_IMAGE_COLUMNS[0], lastRow - 1,
        PRESCRIPTION_IMAGE_COLUMNS[1] - PRESCRIPTION_IMAGE_COLUMNS[0] + 1).getFormulas();
      for (let i = 0; i < ids.length; i++) {
        const apptId = ids[i][0];
        const ts = timestamps[i][0] instanceof Date ? timestamps[i][0] : new Date();
        formulas[i].forEach((formula, slotIdx) => {
          const url = extractHyperlinkUrl_(formula);
          if (url) rowsToAdd.push([nextId++, ts, 'BookedAppointments', apptId, url, 'Prescription Photo (migrated)']);
        });
      }
    }
  }

  const msgSheet = ss.getSheetByName(SHEET_NAME);
  if (msgSheet) {
    const lastRow = msgSheet.getLastRow();
    if (lastRow >= 2) {
      const ids = msgSheet.getRange(2, 1, lastRow - 1, 1).getValues();
      const timestamps = msgSheet.getRange(2, 2, lastRow - 1, 1).getValues();
      const formulas = msgSheet.getRange(2, 6, lastRow - 1, 4).getFormulas();
      for (let i = 0; i < ids.length; i++) {
        const msgId = ids[i][0];
        const ts = timestamps[i][0] instanceof Date ? timestamps[i][0] : new Date();
        formulas[i].forEach((formula, slotIdx) => {
          const url = extractHyperlinkUrl_(formula);
          if (url) rowsToAdd.push([nextId++, ts, 'Messages', msgId, url, 'Message Photo (migrated)']);
        });
      }
    }
  }

  if (rowsToAdd.length) {
    allImagesSheet.getRange(allImagesSheet.getLastRow() + 1, 1, rowsToAdd.length, 6).setValues(rowsToAdd);
  }
  props.setProperty('ALL_IMAGES_MIGRATED', 'true');
}

// migrateExistingImagesToAllImages_ runs inside getOrCreateAllImagesSheet_,
// which many request paths call — a migration hiccup (a malformed old
// cell, a transient Sheets error) must never break whatever the caller was
// actually trying to do, so this wraps it the same way logTransactionSafe_
// wraps logTransaction_. The script property guard is left unset on
// failure, so the next request simply tries the backfill again.
function migrateExistingImagesToAllImagesSafe_(allImagesSheet) {
  try {
    migrateExistingImagesToAllImages_(allImagesSheet);
  } catch (err) {
    // Swallow — AllImages (and whatever the caller needed it for) already works.
  }
}

/* ============================================================
 * "Message Us" form (images optional)
 * ============================================================ */

function buildImageBlob_(base64, mimeType, fileName) {
  const bytes = Utilities.base64Decode(base64);
  return Utilities.newBlob(bytes, mimeType || 'image/jpeg', fileName || 'photo.jpg');
}

function getOrCreateImageFolder_() {
  const folders = DriveApp.getFoldersByName(IMAGE_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(IMAGE_FOLDER_NAME);
}

function saveImageAndGetUrl_(blob) {
  const folder = getOrCreateImageFolder_();
  const file = folder.createFile(blob);

  // Anyone with the link can view — needed so the sheet's link, and the
  // link in the notification email, actually open for whoever reads them.
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // file.getUrl() returns Drive's HTML viewer page, which can't be used as
  // an <img src> (the browser gets an HTML document, not image bytes), so
  // photos never rendered in the Dr. Lokesh admin page's Messages section.
  // The thumbnail endpoint serves the actual image bytes directly while
  // still honoring the "anyone with the link" sharing set above, and it
  // still opens fine as a normal link (in the sheet or the email).
  // w4096 gives plenty of headroom above typical phone-camera resolutions —
  // Drive never upscales past the original, so smaller photos are
  // unaffected and simply served at their true size.
  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w4096';
}

// Like saveImageAndGetUrl_ above, but for Prescription attachments, which
// can now be any of a small set of supported file types, not just photos
// (see handleLokiAddPrescriptionImage_). An actual image still gets the
// thumbnail endpoint -- it serves real image bytes, so it works as an
// <img src>. Anything else (PDF, Word, Excel, PowerPoint) can't be shown
// in an <img> tag, so it gets Drive's own in-browser preview URL instead,
// which still opens the real file directly (no separate download step)
// and still honors the "anyone with the link" sharing set above.
function saveRxFileAndGetUrl_(blob, mimeType) {
  const folder = getOrCreateImageFolder_();
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const isImage = String(mimeType || '').indexOf('image/') === 0;
  if (isImage) {
    return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w4096';
  }
  return 'https://drive.google.com/file/d/' + file.getId() + '/preview';
}

// Reads however many photo0Base64, photo1Base64, ... trios the POST
// actually sent (any number, up to MAX_PHOTOS_PER_MESSAGE) and saves each
// to Drive. Replaces the old fixed image/image2/image3/image4 reader —
// those four field names and the IMAGE_FIELD_SUFFIXES list above are no
// longer sent by script.js's "Add Photo" picker, kept only as a comment on
// what the Messages sheet's Image/Image2/Image3/Image4 columns used to
// hold. A photo that fails to upload still gets an entry (url: '') so the
// caller can report it without losing the rest of the submission.
function collectImagesUnlimited_(params) {
  const results = [];
  for (let i = 0; i < MAX_PHOTOS_PER_MESSAGE; i++) {
    const base64 = params['photo' + i + 'Base64'];
    if (!base64) continue;
    try {
      const blob = buildImageBlob_(base64, params['photo' + i + 'Mime'], params['photo' + i + 'Name']);
      const url = saveImageAndGetUrl_(blob);
      results.push({ url: url, blob: blob });
    } catch (imgErr) {
      results.push({ url: '', blob: null, error: imgErr.message });
    }
  }
  return results;
}

function sendNotificationEmail_(name, phone, message, images) {
  if (!NOTIFICATION_EMAIL) return;

  const subject = 'New message from PeerOna website — ' + (name || 'Unknown');
  let body =
    'You have a new message from the PeerOna website:\n\n' +
    'Name: ' + (name || '-') + '\n' +
    'Phone: ' + (phone || '-') + '\n' +
    'Message: ' + (message || '-') + '\n';

  const attachments = [];
  images.forEach((img, i) => {
    const label = 'Photo' + (i === 0 ? '' : ' ' + (i + 1));
    body += img.url
      ? (label + ' (also attached): ' + img.url + '\n')
      : (label + ': none attached\n');
    if (img.blob) attachments.push(img.blob);
  });

  const options = {};
  if (attachments.length) {
    options.attachments = attachments;
  }

  MailApp.sendEmail(NOTIFICATION_EMAIL, subject, body, options);
}

function getOrCreateMessagesSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['Id', 'Timestamp', 'Name', 'Phone', 'Message', 'Image', 'Image 2', 'Image 3', 'Image 4', 'InLineReply']);
    sheet.getRange(1, 1, 1, 10).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function handleMessage_(params) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    const sheet = getOrCreateMessagesSheet_();

    // Each photo upload is handled separately from the row write on purpose:
    // if Drive saving fails for one or more of them, we still want the
    // name/phone/message to land in the sheet instead of losing the whole
    // submission.
    const images = collectImagesUnlimited_(params);
    const newId = getNextId_(sheet);

    // Image / Image 2 / Image 3 / Image 4 are left blank for every new
    // row now -- any number of photos (not just up to 4) gets recorded in
    // AllImages instead (below), which is what getMessagesForLoki_'s View
    // Photos reads from. The four columns stay in this sheet for rows
    // saved before this change; see migrateExistingImagesToAllImages_.
    const row = [
      newId,
      new Date(),                  // Timestamp
      params.name || '',           // Name
      params.phone || '',          // Phone
      params.message || '',        // Message
      '', '', '', '',              // Image, Image 2, Image 3, Image 4 (unused for new rows)
      ''                            // InLineReply, filled in later from loki.html
    ];

    sheet.appendRow(row);

    images.forEach((img, i) => {
      if (!img.url) return;
      addImageRecordSafe_('Messages', newId, img.url, 'Message Photo ' + (i + 1));
    });

    const photoCount = images.filter((img) => img.url).length;
    logTransactionSafe_('Messages', newId, ACTION_ID_CREATE, USER_ID_PATIENT,
      'Name:' + (params.name || '') + ' | Phone:' + (params.phone || '') +
      (photoCount ? (' | Photos:' + photoCount) : ''));

    // Same resilience approach as the photo upload: a failed email should
    // never cause the submission itself to be lost or reported as failed.
    try {
      sendNotificationEmail_(params.name, params.phone, params.message, images);
    } catch (mailErr) {
      // Swallow — the row is already saved, which is what matters most.
    }

    return jsonResponse_({ result: 'success' });

  } catch (err) {
    return jsonResponse_({ result: 'error', error: err.message });

  } finally {
    lock.releaseLock();
  }
}

/* ============================================================
 * "Book Appointment" form
 * ============================================================ */

function getOrCreateAppointmentsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(APPOINTMENTS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(APPOINTMENTS_SHEET_NAME);
    sheet.appendRow(['Id', 'Timestamp', 'Name', 'Phone', 'Date', 'Start Time', 'End Time', 'Time Slot', 'Email', 'Status', 'ReScheduled Id', 'Prescription', 'Cancelled Reason', 'Prescription Image', 'Prescription Image 2']);
    sheet.getRange(1, 1, 1, 15).setFontWeight('bold');
    sheet.setFrozenRows(1);
    // Keep Date/Start Time/End Time as plain text (not auto-converted to
    // date/time serials) so string comparisons stay simple and reliable.
    sheet.getRange(2, 5, 999, 3).setNumberFormat('@');
    // Status shows as a dropdown in the sheet (and is what loki.html
    // reads/writes as plain text) rather than a free-typed cell, so it can
    // never drift from the five values this script understands.
    sheet.getRange(2, 10, 999, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(STATUS_VALUES, true).setAllowInvalid(false).build()
    );
    // Prescription/Cancelled Reason/Prescription Image/Prescription Image 2
    // all stay plain text (the two image columns hold HYPERLINK formulas,
    // which plain-text number formatting doesn't interfere with — it only
    // affects how a literal value displays). Cancelled Reason also gets the
    // same kind of dropdown validation as Status.
    sheet.getRange(2, 12, 999, 4).setNumberFormat('@');
    sheet.getRange(2, 13, 999, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(CANCEL_REASON_VALUES, true).setAllowInvalid(false).build()
    );
  }
  // Self-healing upgrade for a sheet created before the Prescription Image
  // columns existed — see ensurePrescriptionImageColumns_.
  ensurePrescriptionImageColumns_(sheet);
  // Lazily promote any blank ("Upcoming") row whose booking slot has
  // already ended to "Past" — runs on every access to this sheet (every
  // caller goes through this function), so no scheduled trigger is
  // needed. Cancelled/ReScheduled/Finished rows are never touched here.
  upgradePastAppointments_(sheet);
  return sheet;
}

// One-time, self-healing upgrade: an "Booked Appointments" sheet created
// before this feature existed only has 13 columns (through Cancelled
// Reason). The first time this runs against one of those, it appends the
// two "Prescription Image" / "Prescription Image 2" headers so the sheet
// matches what a brand-new one gets above. Safe to call every time: it
// only touches the header row, and only when those columns aren't already
// there, so it's a no-op on every call after the first.
function ensurePrescriptionImageColumns_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map((h) => String(h || '').trim());
  if (headers.indexOf('Prescription Image') !== -1) return; // already upgraded

  sheet.getRange(1, 14, 1, 2).setValues([['Prescription Image', 'Prescription Image 2']]);
  sheet.getRange(1, 14, 1, 2).setFontWeight('bold');
  sheet.getRange(2, 14, 999, 2).setNumberFormat('@');
}

// Blank-status rows whose End Time has already passed (compared against
// the current moment in IST) are no longer "Upcoming" — they're "Past".
// This runs every time the sheet is fetched, so it self-corrects on
// access instead of needing a time-based trigger.
function upgradePastAppointments_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const numRows = lastRow - 1;
  // Columns 5-10: Date, Start Time, End Time, Time Slot, Email, Status
  const range = sheet.getRange(2, 5, numRows, 6);
  const values = range.getValues();
  const now = Date.now();
  let changed = false;
  for (let i = 0; i < values.length; i++) {
    const status = String(values[i][5] || '').trim();
    if (status !== '') continue; // only blank ("Upcoming") rows are eligible
    const dateStr = formatDateForCompare_(values[i][0]);
    const endTimeStr = formatTimeForCompare_(values[i][2]);
    if (!dateStr || !endTimeStr) continue;
    const endMoment = new Date(dateStr + 'T' + endTimeStr + ':00+05:30');
    if (isNaN(endMoment.getTime()) || endMoment.getTime() >= now) continue;
    values[i][5] = STATUS_PAST;
    changed = true;
  }
  if (changed) {
    range.setValues(values);
  }
}

// Sheets can still auto-detect a date- or time-looking string and store it
// as a real Date value depending on locale/settings; these normalize either
// form (plain text, or an auto-converted Date) back to a comparable string.
function formatDateForCompare_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, TIMEZONE, 'yyyy-MM-dd');
  }
  return String(value || '').trim();
}
function formatTimeForCompare_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, TIMEZONE, 'HH:mm');
  }
  return String(value || '').trim();
}

// A row whose Status is Cancelled or ReScheduled no longer occupies its
// slot — Cancelled because the clinic called it off, ReScheduled because
// the patient already moved to a different slot. Blank (upcoming) and
// Finished (already happened) both still count as occupying their slot.
function statusFreesSlot_(status) {
  return status === STATUS_CANCELLED || status === STATUS_RESCHEDULED;
}

// Returns every already-booked Start Time ("HH:mm") on the given date
// ("yyyy-MM-dd"), so the site can grey those slots out and the server can
// reject a conflicting booking. A slot that's been Cancelled or
// ReScheduled is left out here, so it becomes bookable again.
function getBookedSlotsForDate_(dateStr) {
  const sheet = getOrCreateAppointmentsSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const data = sheet.getRange(2, 5, lastRow - 1, 6).getValues(); // Date, Start Time, End Time, Time Slot, Email, Status
  const result = [];
  data.forEach((row) => {
    const status = String(row[5] || '').trim();
    if (!statusFreesSlot_(status) && formatDateForCompare_(row[0]) === dateStr) {
      result.push(formatTimeForCompare_(row[1]));
    }
  });
  return result;
}

function isSlotBooked_(dateStr, startTime) {
  return getBookedSlotsForDate_(dateStr).indexOf(startTime) !== -1;
}

// Keeps the sheet grouped by date (then by time within each date) after
// every new booking, so appointments always read top-to-bottom by date.
function sortAppointmentsSheet_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 2) return; // 0 or 1 data rows — nothing to sort
  // 15 columns (through Prescription Image 2), not 13 -- sorting fewer
  // columns than the sheet actually has would move Name/Date/etc. to their
  // new sorted position while leaving the two Prescription Image columns
  // behind in their old row, silently detaching an uploaded photo from the
  // booking it belongs to the next time anything re-sorts the sheet.
  const range = sheet.getRange(2, 1, lastRow - 1, 15);
  range.sort([{ column: 5, ascending: true }, { column: 6, ascending: true }]);
}

function sendAppointmentEmail_(name, phone, dateStr, label, email, isReschedule) {
  if (!NOTIFICATION_EMAIL) return;

  const subject = (isReschedule ? 'Appointment rescheduled — ' : 'New appointment booked — ') + (name || 'Unknown') + ' (' + dateStr + ')';
  const body =
    (isReschedule ? 'A patient has rescheduled their appointment on the PeerOna website:' : 'A new appointment has been booked on the PeerOna website:') + '\n\n' +
    'Name: ' + (name || '-') + '\n' +
    'Phone: ' + (phone || '-') + '\n' +
    'Email: ' + (email || '-') + '\n' +
    'Date: ' + dateStr + '\n' +
    'Time: ' + (label || '-') + '\n';

  MailApp.sendEmail(NOTIFICATION_EMAIL, subject, body);
}

// Sent to the patient when Dr. Lokesh cancels their booking from loki.html —
// only called when the patient gave an email address. Includes a link to
// reschedule.html, pre-filled with this patient's own details and the
// original booking's Id, so picking a new slot there can be linked back to
// this cancelled row automatically.
function sendCancellationEmail_(apptId, name, phone, email, dateStr, label, reason) {
  const link = SITE_BASE_URL + 'reschedule.html'
    + '?id=' + encodeURIComponent(apptId)
    + '&name=' + encodeURIComponent(name || '')
    + '&phone=' + encodeURIComponent(phone || '')
    + '&email=' + encodeURIComponent(email || '');

  const subject = 'Your PeerOna appointment has been cancelled';
  const body =
    'Hi ' + (name || 'there') + ',\n\n' +
    'Your appointment on ' + dateStr + ' (' + (label || '-') + ') has been cancelled by the clinic.' + (reason ? ' Reason: ' + reason + '.' : '') + '\n\n' +
    'If you would like to pick a new time, you can book it yourself here:\n' + link + '\n\n' +
    'Or just get in touch with us directly if you would rather reschedule by phone.\n\n' +
    '— PeerOna';
  MailApp.sendEmail(email, subject, body);
}

// Adds a Calendar event on the configured notification email's calendar
// (falling back to the script owner's own default calendar if that
// calendar isn't reachable). Failures here never block the booking itself.
function addAppointmentCalendarEvent_(name, phone, dateStr, startTime, endTime) {
  const start = new Date(dateStr + 'T' + startTime + ':00+05:30');
  const end = new Date(dateStr + 'T' + endTime + ':00+05:30');

  let cal = null;
  try {
    cal = NOTIFICATION_EMAIL ? CalendarApp.getCalendarById(NOTIFICATION_EMAIL) : null;
  } catch (e) {
    cal = null;
  }
  if (!cal) cal = CalendarApp.getDefaultCalendar();

  cal.createEvent('Appointment: ' + (name || 'Unknown'), start, end, {
    description: 'Phone: ' + (phone || '-') + '\nBooked via the PeerOna website.',
    location: 'PeerOna'
  });
}

// Scans column A (Id) for a row matching the given numeric id. Returns the
// 1-based sheet row number, or -1 if not found.
function findRowById_(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const target = Number(id);
  if (isNaN(target)) return -1;
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (Number(values[i][0]) === target) return i + 2;
  }
  return -1;
}

// Called after a reschedule.html booking succeeds. If the original row
// (by Id) is currently Cancelled and hasn't already been linked to a
// ReScheduled Id, marks it ReScheduled and records the new booking's Id.
// A link that's reused (already linked, or the row isn't Cancelled
// anymore) is left alone — the new booking itself still goes through fine
// either way, it just won't double-link.
function linkRescheduledAppointment_(originalId, newId) {
  const sheet = getOrCreateAppointmentsSheet_();
  const row = findRowById_(sheet, originalId);
  if (row === -1) return;

  const status = String(sheet.getRange(row, 10).getValue() || '').trim();
  const existingLink = String(sheet.getRange(row, 11).getValue() || '').trim();
  if (status === STATUS_CANCELLED && !existingLink) {
    sheet.getRange(row, 10).setValue(STATUS_RESCHEDULED);
    sheet.getRange(row, 11).setValue(newId);
    // The patient triggered this by rebooking from the cancellation email's
    // reschedule link, so it's logged as their action, same as the new
    // booking it's paired with.
    logTransactionSafe_('BookedAppointments', originalId, ACTION_ID_MODIFY, USER_ID_PATIENT,
      'Status: Cancelled -> ReScheduled | ReScheduledId:' + newId);
  }
}

function handleAppointment_(params) {
  const name = (params.name || '').trim();
  const phone = (params.phone || '').trim();
  const date = (params.date || '').trim();               // yyyy-MM-dd, IST
  const startTime = (params.timeSlotStart || '').trim(); // HH:mm, 24-hour
  const endTime = (params.timeSlotEnd || '').trim();     // HH:mm, 24-hour
  const label = (params.timeSlotLabel || '').trim();     // e.g. "12:00 PM - 12:30 PM"
  const email = (params.email || '').trim();              // optional
  const originalId = (params.originalId || '').trim();    // set only by reschedule.html

  if (!name || !phone || !date || !startTime || !endTime) {
    return jsonResponse_({ result: 'error', message: 'Missing required appointment details.' });
  }

  // Email is optional, but if something was sent, re-check the basic format
  // server-side too (not just trusting the client-side JS check).
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse_({ result: 'error', message: 'Please enter a valid email address, or leave it blank.' });
  }

  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    // Re-checked here (not just client-side) so two people booking the
    // same slot at nearly the same time can't both succeed.
    if (isSlotBooked_(date, startTime)) {
      return jsonResponse_({
        result: 'conflict',
        message: 'That time slot is already booked for ' + date + '. Please choose another time.'
      });
    }

    const sheet = getOrCreateAppointmentsSheet_();
    const newId = getNextId_(sheet);
    sheet.appendRow([newId, new Date(), name, phone, date, startTime, endTime, label, email, '', '', '', '']);
    sortAppointmentsSheet_(sheet);
    logTransactionSafe_('BookedAppointments', newId, ACTION_ID_CREATE, USER_ID_PATIENT,
      'Name:' + name + ' | Phone:' + phone + ' | Email:' + (email || '-') +
      (originalId ? ' | RescheduledFrom:' + originalId : ''));

    if (originalId) {
      try {
        linkRescheduledAppointment_(originalId, newId);
      } catch (linkErr) {
        // Swallow — the new booking itself is already saved either way.
      }
    }

    try {
      sendAppointmentEmail_(name, phone, date, label, email, !!originalId);
    } catch (mailErr) {
      // Swallow — the booking itself is already saved.
    }

    try {
      addAppointmentCalendarEvent_(name, phone, date, startTime, endTime);
    } catch (calErr) {
      // Swallow — the booking itself is already saved.
    }

    return jsonResponse_({ result: 'success', id: newId });

  } catch (err) {
    return jsonResponse_({ result: 'error', message: err.message });

  } finally {
    lock.releaseLock();
  }
}

// Admin-initiated reschedule, used by loki.html's "Cancel/Reschedule
// Appointment" tab -- Dr Lokesh or the Receptionist picks an existing
// booking (any status except Finished/already-ReScheduled) and moves it to
// a new date/time in one step.
//
// This is deliberately a separate action from handleAppointment_'s own
// originalId handling (used by reschedule.html, reached from a
// cancellation email): that path only links back to the original row when
// it's already Cancelled (see linkRescheduledAppointment_) -- by design,
// since a patient only gets that link after their booking was cancelled.
// An admin rescheduling a still-Upcoming booking over the phone has no
// such precondition, so this action marks the original row ReScheduled
// unconditionally (short of the two statuses above), instead of silently
// leaving it dangling as a duplicate active booking.
function handleLokiReschedule_(params) {
  const actingUser = resolveLokiUser_(params.passcode);
  if (!actingUser) {
    return jsonResponse_({ result: 'error', message: 'Invalid passcode.' });
  }

  const originalId = (params.originalId || '').trim();
  const name = (params.name || '').trim();
  const phone = (params.phone || '').trim();
  const email = (params.email || '').trim();
  const date = (params.date || '').trim();
  const startTime = (params.timeSlotStart || '').trim();
  const endTime = (params.timeSlotEnd || '').trim();
  const label = (params.timeSlotLabel || '').trim();

  if (!originalId || !name || !phone || !date || !startTime || !endTime) {
    return jsonResponse_({ result: 'error', message: 'Missing required appointment details.' });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse_({ result: 'error', message: 'Please enter a valid email address, or leave it blank.' });
  }

  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    const sheet = getOrCreateAppointmentsSheet_();
    const originalRow = findRowById_(sheet, originalId);
    if (originalRow === -1) {
      return jsonResponse_({ result: 'error', message: 'Could not find that booking.' });
    }
    const originalStatus = String(sheet.getRange(originalRow, 10).getValue() || '').trim();
    if (originalStatus === STATUS_FINISHED) {
      return jsonResponse_({ result: 'error', message: 'A finished appointment can\'t be rescheduled.' });
    }
    if (originalStatus === STATUS_RESCHEDULED) {
      return jsonResponse_({ result: 'error', message: 'This appointment has already been rescheduled.' });
    }

    // Re-checked here (not just client-side) so two overlapping actions
    // can't both succeed -- same guard as a normal booking.
    if (isSlotBooked_(date, startTime)) {
      return jsonResponse_({
        result: 'conflict',
        message: 'That time slot is already booked for ' + date + '. Please choose another time.'
      });
    }

    const newId = getNextId_(sheet);
    sheet.appendRow([newId, new Date(), name, phone, date, startTime, endTime, label, email, '', '', '', '']);
    sortAppointmentsSheet_(sheet);

    // sortAppointmentsSheet_ just re-sorted the whole sheet, so the
    // original row's position may have moved -- look it up again by Id
    // rather than reusing originalRow.
    const freshOriginalRow = findRowById_(sheet, originalId);
    if (freshOriginalRow !== -1) {
      sheet.getRange(freshOriginalRow, 10).setValue(STATUS_RESCHEDULED);
      sheet.getRange(freshOriginalRow, 11).setValue(newId);
    }

    logTransactionSafe_('BookedAppointments', newId, ACTION_ID_CREATE, actingUser.id,
      'Name:' + name + ' | Phone:' + phone + ' | Email:' + (email || '-') + ' | RescheduledFrom:' + originalId);
    logTransactionSafe_('BookedAppointments', originalId, ACTION_ID_MODIFY, actingUser.id,
      'Status: ' + (originalStatus || '-') + ' -> ReScheduled | ReScheduledId:' + newId);

    try {
      sendAppointmentEmail_(name, phone, date, label, email, true);
    } catch (mailErr) {
      // Swallow — the reschedule itself is already saved.
    }

    try {
      addAppointmentCalendarEvent_(name, phone, date, startTime, endTime);
    } catch (calErr) {
      // Swallow — the reschedule itself is already saved.
    }

    return jsonResponse_({ result: 'success', id: newId });

  } catch (err) {
    return jsonResponse_({ result: 'error', message: err.message });

  } finally {
    lock.releaseLock();
  }
}

/* ============================================================
 * Global settings (editable directly in the "Settings" sheet)
 * ============================================================ */

function getOrCreateSettingsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SETTINGS_SHEET_NAME);
    sheet.appendRow(['Key', 'Value']);
    sheet.getRange(1, 1, 1, 2).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange(2, 1, 999, 2).setNumberFormat('@'); // keep values as plain text
    DEFAULT_SETTINGS.forEach((row) => sheet.appendRow(row));
    sheet.autoResizeColumns(1, 2);
  }
  ensureRolePasscodes_(sheet);
  return sheet;
}

// One-time, self-healing upgrade: older Settings sheets only have a single
// shared "Loki Passcode" row (one passcode for every admin, no way to tell
// who used it). The first time this runs against one of those, it adds
// "Dr Lokesh Passcode" (seeded with that same old shared value, so Dr.
// Lokesh's existing passcode keeps working unchanged) and "Receptionist
// Passcode" (seeded with a new placeholder — change it in the sheet and
// give it to the receptionist). Safe to call every time: it only appends
// rows that are still missing, so it's a no-op once both exist. The old
// "Loki Passcode" row, if present, is left in the sheet but no longer
// checked by anything (resolveLokiUser_ only looks at the two role rows).
function ensureRolePasscodes_(sheet) {
  const lastRow = sheet.getLastRow();
  const data = lastRow < 2 ? [] : sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  const keys = data.map((row) => normalizeSettingKey_(row[0]));
  const rowsToAdd = [];

  if (keys.indexOf('drlokeshpasscode') === -1) {
    const oldShared = data.filter((row) => normalizeSettingKey_(row[0]) === 'lokipasscode')[0];
    const seed = oldShared ? String(oldShared[1] || '').trim() : '';
    rowsToAdd.push(['Dr Lokesh Passcode', seed || 'Lokesh@Peerona2026']);
  }
  if (keys.indexOf('receptionistpasscode') === -1) {
    rowsToAdd.push(['Receptionist Passcode', 'Receptionist@Peerona2026']);
  }
  rowsToAdd.forEach((row) => sheet.appendRow(row));
}

// "Clinic Address" -> "clinicaddress", so the sheet's Key column can be
// typed in any casing/spacing and still be found from code or the client.
function normalizeSettingKey_(key) {
  return String(key || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Reads every Key/Value row from the Settings sheet into a plain object,
// e.g. { address: '221,Rajajinagar,bangalore', mapslink: 'https://...' }.
// Add more rows to the sheet (any key name) and they show up here
// automatically.
function getSettings_() {
  const sheet = getOrCreateSettingsSheet_();
  const lastRow = sheet.getLastRow();
  const settings = {};
  if (lastRow < 2) return settings;

  const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  data.forEach((row) => {
    const key = normalizeSettingKey_(row[0]);
    if (!key) return;
    settings[key] = String(row[1] || '').trim();
  });
  return settings;
}

/* ============================================================
 * Dr. Lokesh's page (loki.html) — appointments + messages admin
 * ============================================================ */

// Checks a passcode the client sent against either role's Settings value
// (Dr Lokesh Passcode / Receptionist Passcode). No passcode configured in
// Settings => refuse everything (fail closed, never fail open).
function checkLokiPasscode_(provided) {
  return !!resolveLokiUser_(provided);
}

// Same check as checkLokiPasscode_, but also says WHICH of the two admin
// roles the passcode belongs to — { id, name } matching a Users sheet row,
// or null if it matches neither. This is how the audit log knows whether
// to credit a loki.html save to Dr Lokesh or the Receptionist, without the
// frontend having to say who's using it — it's determined purely from
// which passcode they typed in.
function resolveLokiUser_(provided) {
  const given = String(provided || '').trim();
  if (!given) return null;
  const settings = getSettings_();
  if (settings.drlokeshpasscode && given === settings.drlokeshpasscode) {
    return { id: USER_ID_DR_LOKESH, name: 'Dr Lokesh' };
  }
  if (settings.receptionistpasscode && given === settings.receptionistpasscode) {
    return { id: USER_ID_RECEPTIONIST, name: 'Receptionist' };
  }
  return null;
}

// A Timestamp cell is a real Date (or sometimes a date-looking string) —
// this turns either into a stable ISO string that round-trips through the
// client and back, used as a Messages row's id for find/update.
function formatTimestampIso_(value) {
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return isNaN(d.getTime()) ? String(value || '') : d.toISOString();
}

// Pulls the URL out of a `=HYPERLINK("https://...", "View Image")` cell
// formula. Returns '' for an empty/failed-upload cell (which holds plain
// text or nothing, not a HYPERLINK formula).
function extractHyperlinkUrl_(formula) {
  if (!formula) return '';
  const match = String(formula).match(/HYPERLINK\(\s*"([^"]+)"/i);
  return match ? match[1] : '';
}

// Prescription attachments store their original filename + mime type as a
// JSON string in AllImages' AdditionalData column (see
// handleLokiAddPrescriptionImage_ below). An entry saved before file
// support shipped just has the plain string "Prescription Photo" there --
// not valid JSON -- so that (and anything else unparsable) falls back to
// isImage:true with no stored name: every one of those really was a photo.
function parseRxAttachmentMeta_(raw) {
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') {
      const mime = String(obj.mime || '');
      return { name: String(obj.name || ''), isImage: mime.indexOf('image/') === 0 || !mime };
    }
  } catch (err) { /* pre-existing plain-string entry -- fall through */ }
  return { name: '', isImage: true };
}

function getAppointmentsForLoki_() {
  const sheet = getOrCreateAppointmentsSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // Prescription photos used to live in two fixed HYPERLINK-formula
  // columns (14-15) read right here; now they come from AllImages instead
  // (any number of them), looked up once via getAllImagesIndexed_ rather
  // than re-reading AllImages per row.
  const data = sheet.getRange(2, 1, lastRow - 1, 15).getValues();
  const imagesIndex = getAllImagesIndexed_();
  return data.map((row) => ({
    id: row[0],
    timestamp: formatTimestampIso_(row[1]),
    name: String(row[2] || ''),
    phone: String(row[3] || ''),
    date: formatDateForCompare_(row[4]),
    startTime: formatTimeForCompare_(row[5]),
    endTime: formatTimeForCompare_(row[6]),
    timeSlotLabel: String(row[7] || ''),
    email: String(row[8] || ''),
    status: String(row[9] || ''),
    rescheduledId: row[10] === '' || row[10] === null ? '' : row[10],
    prescription: String(row[11] || ''),
    cancelledReason: String(row[12] || ''),
    // [{ id, url, name, isImage }, ...] -- id is the AllImages row's own
    // Id, needed so the Prescription modal's per-photo Remove can target
    // exactly one photo via handleLokiRemovePrescriptionImage_. name/
    // isImage (from parseRxAttachmentMeta_) let the Prescription modal and
    // the View Photos gallery tell a PDF/Word/Excel/PowerPoint attachment
    // apart from an actual photo and render each one appropriately.
    prescriptionImages: getImagesForRow_(imagesIndex, 'BookedAppointments', row[0])
      .map((img) => {
        const meta = parseRxAttachmentMeta_(img.additionalData);
        return { id: img.id, url: img.url, name: meta.name, isImage: meta.isImage };
      })
  }));
}

function getMessagesForLoki_() {
  const sheet = getOrCreateMessagesSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const numCols = Math.max(sheet.getLastColumn(), 10);
  const values = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
  // Photos used to be read from the four fixed Image/Image2/3/4 HYPERLINK
  // columns right here; now they come from AllImages (any number of them),
  // looked up once via getAllImagesIndexed_ instead of a per-row formula read.
  const imagesIndex = getAllImagesIndexed_();

  return values.map((row) => ({
    id: row[0],
    timestamp: formatTimestampIso_(row[1]),
    name: String(row[2] || ''),
    phone: String(row[3] || ''),
    message: String(row[4] || ''),
    images: getImagesForRow_(imagesIndex, 'Messages', row[0]).map((img) => img.url),
    inlineReply: String(row[9] || '')
  }));
}

// Scans column B (Timestamp) for a row matching the given ISO timestamp.
// Returns the 1-based sheet row number, or -1 if not found.
function findMessageRowByTimestamp_(sheet, isoString) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const values = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (formatTimestampIso_(values[i][0]) === isoString) return i + 2;
  }
  return -1;
}

// Applies a batch of partial { id, status?, prescription?, cancelledReason? }
// changes from loki.html to the "Booked Appointments" sheet. Each change
// object only touches the fields actually present on it (checked via
// hasOwnProperty), so the same endpoint safely serves the Appointments
// section's batched Status+Cancelled Reason save, a single-field
// Prescription save from its modal, and the Cancel Dates sections' bulk
// { status: 'Cancelled', cancelledReason } saves, without any of them
// accidentally blanking a field they didn't intend to touch. A row newly
// set to Cancelled (wasn't Cancelled before) gets an automatic
// cancellation + reschedule-link email, but only if the patient gave an
// email address when booking; the email includes the Cancelled Reason
// when one was set.
function handleLokiSaveApptStatus_(params) {
  const actingUser = resolveLokiUser_(params.passcode);
  if (!actingUser) {
    return jsonResponse_({ result: 'error', message: 'Invalid passcode.' });
  }

  let changes;
  try {
    changes = JSON.parse(params.changes || '[]');
  } catch (parseErr) {
    return jsonResponse_({ result: 'error', message: 'Malformed request.' });
  }
  if (!Array.isArray(changes) || !changes.length) {
    return jsonResponse_({ result: 'error', message: 'No changes received.' });
  }

  const lock = LockService.getScriptLock();
  lock.tryLock(10000);
  const notifiedEmails = [];

  try {
    const sheet = getOrCreateAppointmentsSheet_();

    changes.forEach((change) => {
      const row = findRowById_(sheet, change.id);
      if (row === -1) return;

      const wasStatus = String(sheet.getRange(row, 10).getValue() || '').trim();
      let newStatus = wasStatus;
      const statusGiven = Object.prototype.hasOwnProperty.call(change, 'status');
      const changeDetails = [];
      if (statusGiven) {
        newStatus = STATUS_VALUES.indexOf(change.status) !== -1 ? change.status : '';
        sheet.getRange(row, 10).setValue(newStatus);
        changeDetails.push('Status: ' + (wasStatus || '-') + ' -> ' + (newStatus || '-'));
      }

      if (Object.prototype.hasOwnProperty.call(change, 'prescription')) {
        sheet.getRange(row, 12).setValue(String(change.prescription || ''));
        changeDetails.push('Prescription updated');
      }

      let reasonToUse = String(sheet.getRange(row, 13).getValue() || '').trim();
      if (Object.prototype.hasOwnProperty.call(change, 'cancelledReason')) {
        reasonToUse = CANCEL_REASON_VALUES.indexOf(change.cancelledReason) !== -1 ? change.cancelledReason : '';
        sheet.getRange(row, 13).setValue(reasonToUse);
        changeDetails.push('CancelledReason: ' + (reasonToUse || '-'));
      }

      // One TransactionLog row per booking touched by this save (even when
      // the save button saved several bookings at once), so each row can be
      // traced back to exactly which booking it changed and how.
      logTransactionSafe_('BookedAppointments', change.id, ACTION_ID_MODIFY, actingUser.id,
        changeDetails.length ? changeDetails.join(' | ') : '');

      if (statusGiven && newStatus === STATUS_CANCELLED && wasStatus !== STATUS_CANCELLED) {
        const email = String(sheet.getRange(row, 9).getValue() || '').trim();
        if (email) {
          try {
            const apptId = sheet.getRange(row, 1).getValue();
            const name = sheet.getRange(row, 3).getValue();
            const phone = sheet.getRange(row, 4).getValue();
            const date = formatDateForCompare_(sheet.getRange(row, 5).getValue());
            const label = sheet.getRange(row, 8).getValue();
            sendCancellationEmail_(apptId, name, phone, email, date, label, reasonToUse);
            notifiedEmails.push(email);
          } catch (mailErr) {
            // Swallow — the status change itself is already saved.
          }
        }
      }
    });

  } finally {
    lock.releaseLock();
  }

  return jsonResponse_({ result: 'success', notified: notifiedEmails });
}

// Receives one Prescription Image upload (or a removal) for a single
// booking, from the Prescription modal on loki.html. params.slot is '1' or
// '2' (which of the two optional Prescription Image columns), params.id is
// the booking's Id. Uploading replaces whatever link was in that slot
// before — the Drive file behind any earlier upload in that slot is
// intentionally left alone (only the sheet's link is replaced), so a link
// already handed out elsewhere doesn't suddenly break. Same Drive folder
// and sharing settings as the "Message Us" photos (buildImageBlob_ /
// saveImageAndGetUrl_), and the same 1-request-per-photo shape, so a
// failed upload never risks the Prescription text save that normally
// accompanies it from the same modal.
// Uploads one new prescription photo for a booking, any number of times
// -- replaces the old fixed 2-slot handleLokiSavePrescriptionImage_. Each
// call adds exactly one AllImages row and returns its id, which the
// Prescription modal keeps so a later "Remove" on that specific photo can
// target it (see handleLokiRemovePrescriptionImage_ below) without
// disturbing any other photo added before or after it.
function handleLokiAddPrescriptionImage_(params) {
  const actingUser = resolveLokiUser_(params.passcode);
  if (!actingUser) {
    return jsonResponse_({ result: 'error', message: 'Invalid passcode.' });
  }

  const apptSheet = getOrCreateAppointmentsSheet_();
  const row = findRowById_(apptSheet, params.id);
  if (row === -1) {
    return jsonResponse_({ result: 'error', message: 'Booking not found.' });
  }

  const base64 = params.imageBase64;
  if (!base64) {
    return jsonResponse_({ result: 'error', message: 'No file received.' });
  }

  // Photos are always allowed; a fixed allowlist of document types covers
  // "any other files too like pdf" without opening this up to arbitrary
  // (and potentially unsafe) uploads.
  const mimeType = String(params.imageMime || 'image/jpeg');
  const isImage = mimeType.indexOf('image/') === 0;
  const ALLOWED_RX_DOC_MIMES_ = {
    'application/pdf': true,
    'application/msword': true,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
    'application/vnd.ms-excel': true,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': true,
    'application/vnd.ms-powerpoint': true,
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': true
  };
  if (!isImage && !ALLOWED_RX_DOC_MIMES_[mimeType]) {
    return jsonResponse_({ result: 'error', message: "That file type isn't supported. Please upload a photo, PDF, or Word/Excel/PowerPoint document." });
  }

  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    const blob = buildImageBlob_(base64, mimeType, params.imageName);
    const url = saveRxFileAndGetUrl_(blob, mimeType);
    const fileName = String(params.imageName || (isImage ? 'photo.jpg' : 'file'));
    const additionalData = JSON.stringify({ name: fileName, mime: mimeType });
    const imageId = addImageRecord_('BookedAppointments', params.id, url, additionalData);
    logTransactionSafe_('BookedAppointments', params.id, ACTION_ID_MODIFY, actingUser.id,
      isImage ? 'Prescription photo added' : 'Prescription file added (' + fileName + ')');
    return jsonResponse_({ result: 'success', imageId: imageId, url: url, name: fileName, isImage: isImage });

  } catch (err) {
    return jsonResponse_({ result: 'error', message: err.message });

  } finally {
    lock.releaseLock();
  }
}

// Removes one prescription photo by its own AllImages Id (not by booking
// id + slot, since there's no slot anymore). Soft-delete: blanks the
// Image cell instead of deleting the row, so AllImages Ids stay stable and
// nothing below it shifts up mid-request. getAllImagesIndexed_ skips blank
// Image cells, so a removed photo simply stops showing up anywhere.
function handleLokiRemovePrescriptionImage_(params) {
  const actingUser = resolveLokiUser_(params.passcode);
  if (!actingUser) {
    return jsonResponse_({ result: 'error', message: 'Invalid passcode.' });
  }

  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    const allImagesSheet = getOrCreateAllImagesSheet_();
    const row = findRowById_(allImagesSheet, params.imageId);
    if (row === -1) {
      return jsonResponse_({ result: 'error', message: 'Photo not found.' });
    }
    allImagesSheet.getRange(row, 5).setValue('');
    logTransactionSafe_('BookedAppointments', params.id || '', ACTION_ID_MODIFY, actingUser.id,
      'Prescription photo removed');
    return jsonResponse_({ result: 'success' });

  } catch (err) {
    return jsonResponse_({ result: 'error', message: err.message });

  } finally {
    lock.releaseLock();
  }
}

// Saves Dr. Lokesh's reply (from loki.html) into the InLineReply column of
// the matching "Messages" row.
function handleLokiSendReply_(params) {
  const actingUser = resolveLokiUser_(params.passcode);
  if (!actingUser) {
    return jsonResponse_({ result: 'error', message: 'Invalid passcode.' });
  }

  const timestamp = (params.timestamp || '').trim();
  const reply = (params.reply || '').trim();
  if (!timestamp || !reply) {
    return jsonResponse_({ result: 'error', message: 'Missing reply text.' });
  }
  if (reply.length > 8000) {
    return jsonResponse_({ result: 'error', message: 'That reply is too long — please shorten it.' });
  }

  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    const sheet = getOrCreateMessagesSheet_();

    const row = findMessageRowByTimestamp_(sheet, timestamp);
    if (row === -1) {
      return jsonResponse_({ result: 'error', message: 'Message not found — it may have been edited or removed.' });
    }

    sheet.getRange(row, 10).setValue(reply);
    const messageId = sheet.getRange(row, 1).getValue();
    logTransactionSafe_('Messages', messageId, ACTION_ID_MODIFY, actingUser.id, 'Reply added');
    return jsonResponse_({ result: 'success' });

  } catch (err) {
    return jsonResponse_({ result: 'error', message: err.message });

  } finally {
    lock.releaseLock();
  }
}

/* ============================================================
 * Web app entry points
 * ============================================================ */

function doGet(e) {
  const params = (e && e.parameter) || {};
  if (params.action === 'availability' && params.date) {
    return jsonResponse_({ bookedSlots: getBookedSlotsForDate_(params.date) });
  }
  if (params.action === 'config') {
    // Public, unauthenticated endpoint (the main site reads the clinic
    // address/maps link from it before anyone logs in) — so passcodes must
    // never be included here, or anyone could read both of them and
    // impersonate Dr Lokesh or the Receptionist, defeating the audit log
    // this whole file is built around. Filtered by substring (not an exact
    // key list) so any future "...Passcode" setting is caught automatically.
    const settings = getSettings_();
    const publicSettings = {};
    Object.keys(settings).forEach((key) => {
      if (key.indexOf('passcode') === -1) publicSettings[key] = settings[key];
    });
    return jsonResponse_(publicSettings);
  }
  if (params.action === 'lokiVerifyPasscode') {
    // Also tells the client WHICH role the passcode belongs to ('Dr Lokesh'
    // or 'Receptionist', matching the Users sheet names), so loki.html can
    // show a "Welcome <name>" message and label its Logout button -- this
    // never exposes the passcodes themselves, only the already-resolved
    // role name for the one the caller just typed in correctly.
    var lokiUser = resolveLokiUser_(params.passcode);
    return jsonResponse_({ valid: !!lokiUser, role: lokiUser ? lokiUser.name : '' });
  }
  if (params.action === 'lokiAppointments') {
    if (!checkLokiPasscode_(params.passcode)) {
      return jsonResponse_({ result: 'error', message: 'Invalid passcode.' });
    }
    return jsonResponse_({ result: 'success', appointments: getAppointmentsForLoki_() });
  }
  if (params.action === 'lokiMessages') {
    if (!checkLokiPasscode_(params.passcode)) {
      return jsonResponse_({ result: 'error', message: 'Invalid passcode.' });
    }
    return jsonResponse_({ result: 'success', messages: getMessagesForLoki_() });
  }
  return jsonResponse_({ result: 'error', message: 'Unknown request.' });
}

function doPost(e) {
  const params = e.parameter;
  if (params.action === 'lokiSaveApptStatus') {
    return handleLokiSaveApptStatus_(params);
  }
  if (params.action === 'lokiAddPrescriptionImage') {
    return handleLokiAddPrescriptionImage_(params);
  }
  if (params.action === 'lokiRemovePrescriptionImage') {
    return handleLokiRemovePrescriptionImage_(params);
  }
  if (params.action === 'lokiReschedule') {
    return handleLokiReschedule_(params);
  }
  if (params.action === 'lokiSendReply') {
    return handleLokiSendReply_(params);
  }
  if (params.formType === 'appointment') {
    return handleAppointment_(params);
  }
  return handleMessage_(params);
}
