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
 * Time Slot | Email | Status | ReScheduled Id. Email is optional (patients
 * can leave it blank). Id is a running number assigned automatically when
 * a booking is made — it's what Dr. Lokesh's Status dropdown and the
 * reschedule link both key off. Status is a dropdown Dr. Lokesh's page
 * (loki.html) sets directly on each row: blank (upcoming), "Cancelled",
 * "ReScheduled", "Finished" or "Past".
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
 * Link" and "Loki Passcode" rows) the first time anyone loads the site or
 * runs this script. Columns: Key | Value. Edit the Value column directly
 * in the sheet to change what shows up on the site — the clinic address
 * text (shown on "Visit Us" and in the Book Appointment form), the Google
 * Maps link that both of those open when clicked (paste any Google Maps
 * share link there to point it somewhere else), and the passcode that
 * guards loki.html (change it any time, no redeploy needed) — no code
 * change or redeploy needed. Add more rows with any Key name to make more
 * settings available the same way.
 *
 * loki.html — Dr. Lokesh's private page (not linked from the site; reached
 * by going straight to .../loki.html). Gated by the "Loki Passcode"
 * Settings value. Lets him browse appointments and "Message Us" messages
 * by date, set each appointment's Status (saved back here, patients
 * emailed automatically when newly Cancelled if they gave an email), view
 * uploaded photos, and send a reply that's saved into the InLineReply
 * column on the "Messages" tab.
 *
 * reschedule.html — the page the cancellation email links to. A patient
 * opens it, picks a new date/time, and books it — same slot-booking logic
 * as the main site's Book Appointment form, just trimmed down to only
 * that. SITE_BASE_URL below must match wherever this site is actually
 * hosted, so that link works.
 */

const SHEET_NAME = 'Messages';                      // must match the tab name in your sheet
const APPOINTMENTS_SHEET_NAME = 'Booked Appointments'; // auto-created if missing
const SETTINGS_SHEET_NAME = 'Settings';              // auto-created if missing — global site settings (e.g. clinic address)
const IMAGE_FOLDER_NAME = 'PeerOna Message Photos';  // Drive folder the photos are saved into
const NOTIFICATION_EMAIL = 'dmsandeep31011981@gmail.com'; // where new submissions/bookings get emailed — change this later
const TIMEZONE = 'Asia/Kolkata'; // all appointment dates/times are India Standard Time

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

// Seed rows for the "Settings" sheet the first time it's created. Edit the
// VALUES directly in the sheet afterwards — no code change needed; this
// list is only used once, to create the tab with a sensible starting point.
const DEFAULT_SETTINGS = [
  ['Address', '221,Rajajinagar,bangalore'],
  ['Maps Link', 'https://www.google.com/maps/search/?api=1&query=12.9865278%2C77.5501667'],
  ['Loki Passcode', 'Lokesh@Peerona2026']
];

// Up to 4 optional photos per submission: '', '2', '3', '4' match the
// website's field names (image, image2, image3, image4).
const IMAGE_FIELD_SUFFIXES = ['', '2', '3', '4'];

/**
 * Run this once manually from the Apps Script editor (select it in the
 * function dropdown, click Run) to trigger the permission prompt for
 * everything this script needs: Sheets, Drive, Calendar, and sending email.
 */
function authorizeAccess() {
  DriveApp.getRootFolder();
  SpreadsheetApp.getActiveSpreadsheet();
  MailApp.getRemainingDailyQuota();
  CalendarApp.getDefaultCalendar();
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
    sheet.appendRow(['Id', 'Timestamp', 'Name', 'Phone', 'Date', 'Start Time', 'End Time', 'Time Slot', 'Email', 'Status', 'ReScheduled Id']);
    sheet.getRange(1, 1, 1, 11).setFontWeight('bold');
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
  const range = sheet.getRange(2, 1, lastRow - 1, 11);
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
function sendCancellationEmail_(apptId, name, phone, email, dateStr, label) {
  const link = SITE_BASE_URL + 'reschedule.html'
    + '?id=' + encodeURIComponent(apptId)
    + '&name=' + encodeURIComponent(name || '')
    + '&phone=' + encodeURIComponent(phone || '')
    + '&email=' + encodeURIComponent(email || '');

  const subject = 'Your PeerOna appointment has been cancelled';
  const body =
    'Hi ' + (name || 'there') + ',\n\n' +
    'Your appointment on ' + dateStr + ' (' + (label || '-') + ') has been cancelled by the clinic.\n\n' +
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
    sheet.appendRow([newId, new Date(), name, phone, date, startTime, endTime, label, email, '', '']);
    sortAppointmentsSheet_(sheet);

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
  return sheet;
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

// Checks a passcode the client sent against the "Loki Passcode" Settings
// value. No passcode configured in Settings => refuse everything (fail
// closed, never fail open).
function checkLokiPasscode_(provided) {
  const expected = (getSettings_().lokipasscode || '').trim();
  if (!expected) return false;
  return String(provided || '').trim() === expected;
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

  const data = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
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
    rescheduledId: row[10] === '' || row[10] === null ? '' : row[10]
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

// Applies a batch of { id, status } Status-dropdown changes from
// loki.html to the "Booked Appointments" sheet. A row newly set to
// Cancelled (wasn't Cancelled before) gets an automatic cancellation +
// reschedule-link email, but only if the patient gave an email address
// when booking.
function handleLokiSaveApptStatus_(params) {
  if (!checkLokiPasscode_(params.passcode)) {
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

      const newStatus = STATUS_VALUES.indexOf(change.status) !== -1 ? change.status : '';
      const wasStatus = String(sheet.getRange(row, 10).getValue() || '').trim();
      sheet.getRange(row, 10).setValue(newStatus);

      if (newStatus === STATUS_CANCELLED && wasStatus !== STATUS_CANCELLED) {
        const email = String(sheet.getRange(row, 9).getValue() || '').trim();
        if (email) {
          try {
            const apptId = sheet.getRange(row, 1).getValue();
            const name = sheet.getRange(row, 3).getValue();
            const phone = sheet.getRange(row, 4).getValue();
            const date = formatDateForCompare_(sheet.getRange(row, 5).getValue());
            const label = sheet.getRange(row, 8).getValue();
            sendCancellationEmail_(apptId, name, phone, email, date, label);
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
  if (!checkLokiPasscode_(params.passcode)) {
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
    return jsonResponse_(getSettings_());
  }
  if (params.action === 'lokiVerifyPasscode') {
    return jsonResponse_({ valid: checkLokiPasscode_(params.passcode) });
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
