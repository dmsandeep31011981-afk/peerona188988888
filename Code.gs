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
 * holds Dr. Lokesh's reply typed on loki.html.
 *
 * "Booked Appointments" tab — created automatically on first booking, with
 * columns: Id | Timestamp | Name | Phone | Date | Start Time | End Time |
 * Time Slot | Email | Status | ReScheduled Id | Prescription | Cancelled
 * Reason. Email is optional (patients can leave it blank). Id is a running
 * number assigned automatically when a booking is made — it's what Dr.
 * Lokesh's Status dropdown and the reschedule link both key off. Status is
 * a dropdown Dr. Lokesh's page (loki.html) sets directly on each row: blank
 * (upcoming), "Cancelled", "ReScheduled", "Finished" or "Past".
 *   - Prescription is a free-text field (up to ~1000 words) Dr. Lokesh can
 *     fill in from a modal on loki.html, saved independently of Status.
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

// Up to 4 optional photos per submission: '', '2', '3', '4' match the
// website's field names (image, image2, image3, image4).
const IMAGE_FIELD_SUFFIXES = ['', '2', '3', '4'];

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

// Reads every present imageNBase64/imageNName/imageNMime trio from the
// POST, saves each to Drive, and returns one entry per photo slot (1-4)
// with everything the sheet row and the email need. A photo that failed
// to save still gets an entry so the sheet cell can show the error instead
// of silently losing the rest of the submission.
function collectImages_(params) {
  return IMAGE_FIELD_SUFFIXES.map((suffix) => {
    const base64 = params['image' + suffix + 'Base64'];
    if (!base64) return { cell: '', url: '', blob: null };

    try {
      const blob = buildImageBlob_(base64, params['image' + suffix + 'Mime'], params['image' + suffix + 'Name']);
      const url = saveImageAndGetUrl_(blob);
      return { cell: '=HYPERLINK("' + url + '", "View Image")', url: url, blob: blob };
    } catch (imgErr) {
      return { cell: 'Upload failed: ' + imgErr.message, url: '', blob: null };
    }
  });
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
    const images = collectImages_(params);
    const newId = getNextId_(sheet);

    const row = [
      newId,
      new Date(),                  // Timestamp
      params.name || '',           // Name
      params.phone || '',          // Phone
      params.message || '',        // Message
    ].concat(images.map((img) => img.cell)); // Image, Image 2, Image 3, Image 4
    row.push(''); // InLineReply, filled in later from loki.html

    sheet.appendRow(row);
    logTransactionSafe_('Messages', newId, ACTION_ID_CREATE, USER_ID_PATIENT,
      'Name:' + (params.name || '') + ' | Phone:' + (params.phone || ''));

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
    sheet.appendRow(['Id', 'Timestamp', 'Name', 'Phone', 'Date', 'Start Time', 'End Time', 'Time Slot', 'Email', 'Status', 'ReScheduled Id', 'Prescription', 'Cancelled Reason']);
    sheet.getRange(1, 1, 1, 13).setFontWeight('bold');
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
    // Prescription/Cancelled Reason stay plain text; Cancelled Reason also
    // gets the same kind of dropdown validation as Status.
    sheet.getRange(2, 12, 999, 2).setNumberFormat('@');
    sheet.getRange(2, 13, 999, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(CANCEL_REASON_VALUES, true).setAllowInvalid(false).build()
    );
  }
  // Lazily promote any blank ("Upcoming") row whose booking slot has
  // already ended to "Past" — runs on every access to this sheet (every
  // caller goes through this function), so no scheduled trigger is
  // needed. Cancelled/ReScheduled/Finished rows are never touched here.
  upgradePastAppointments_(sheet);
  return sheet;
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
  const range = sheet.getRange(2, 1, lastRow - 1, 13);
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

function getAppointmentsForLoki_() {
  const sheet = getOrCreateAppointmentsSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const data = sheet.getRange(2, 1, lastRow - 1, 13).getValues();
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
    cancelledReason: String(row[12] || '')
  }));
}

function getMessagesForLoki_() {
  const sheet = getOrCreateMessagesSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const numCols = Math.max(sheet.getLastColumn(), 10);
  const values = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
  const formulas = sheet.getRange(2, 1, lastRow - 1, numCols).getFormulas();

  return values.map((row, i) => {
    const images = [5, 6, 7, 8] // 0-based indices of Image, Image 2, Image 3, Image 4
      .map((colIdx) => extractHyperlinkUrl_(formulas[i][colIdx]))
      .filter(Boolean);
    return {
      id: row[0],
      timestamp: formatTimestampIso_(row[1]),
      name: String(row[2] || ''),
      phone: String(row[3] || ''),
      message: String(row[4] || ''),
      images: images,
      inlineReply: String(row[9] || '')
    };
  });
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
  if (params.action === 'lokiSendReply') {
    return handleLokiSendReply_(params);
  }
  if (params.formType === 'appointment') {
    return handleAppointment_(params);
  }
  return handleMessage_(params);
}
