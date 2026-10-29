/* =========================================================
   PeerOna — Dr. Lokesh's private page (loki.html)
   ========================================================= */

(function () {
  'use strict';

  var GOOGLE_SHEET_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwOOx11a_BeZd83JR9JENYaDEKLckQ9SxrpncR_6cnUrOcii79jMGjbbfg6Bse1wB9UhA/exec';
  var PASSCODE_STORAGE_KEY = 'lokiPasscode';
  var WINDOW_DAYS = 7; // default visible date-window size, both sections
  var MAX_REPLY_WORDS = 1000;
  var MAX_PRESCRIPTION_WORDS = 1000;

  // Mirrors CANCEL_REASON_VALUES in Code.gs. '' (blank) means no reason was
  // given -- this field is always optional, never required to cancel.
  var CANCEL_REASON_VALUES = ['', 'Doctor Got Busy in an Emergency', 'Doctor not well', 'UnPlanned Work Came', 'Doctor is on vacation', 'Clinic Holiday'];
  var CANCEL_REASON_LABELS = {
    '': '\u2014 No reason specified \u2014',
    'Doctor Got Busy in an Emergency': 'Doctor Got Busy in an Emergency',
    'Doctor not well': 'Doctor not well',
    'UnPlanned Work Came': 'UnPlanned Work Came',
    'Doctor is on vacation': 'Doctor is on vacation',
    'Clinic Holiday': 'Clinic Holiday'
  };
  function populateReasonSelect(selectEl) {
    CANCEL_REASON_VALUES.forEach(function (value) {
      var opt = document.createElement('option');
      opt.value = value;
      opt.textContent = CANCEL_REASON_LABELS[value];
      selectEl.appendChild(opt);
    });
  }
  function buildReasonSelect(initialValue) {
    var select = document.createElement('select');
    populateReasonSelect(select);
    select.value = initialValue || '';
    return select;
  }
  /* ---------- "Saved" toast (shown briefly after any save to the sheet) ---------- */
  var savedToastEl = null;
  var savedToastTimer = null;
  function showSavedToast(message) {
    if (!savedToastEl) {
      savedToastEl = document.createElement('div');
      savedToastEl.className = 'site-toast';
      savedToastEl.setAttribute('role', 'status');
      savedToastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(savedToastEl);
    }
    savedToastEl.textContent = message || 'Saved';
    savedToastEl.classList.remove('is-visible');
    void savedToastEl.offsetWidth; // restart the transition on back-to-back saves
    savedToastEl.classList.add('is-visible');
    if (savedToastTimer) clearTimeout(savedToastTimer);
    savedToastTimer = setTimeout(function () {
      savedToastEl.classList.remove('is-visible');
    }, 2000);
  }

  function countWords(text) {
    var trimmed = (text || '').trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }

  /* ---------- circular progress / loading spinner (reused everywhere data
     is fetched from the sheet, and for each photo while it loads) ---------- */
  function createSpinner(extraClass) {
    var el = document.createElement('span');
    el.className = 'loki-spinner' + (extraClass ? ' ' + extraClass : '');
    el.setAttribute('role', 'status');
    el.setAttribute('aria-label', 'Loading');
    return el;
  }
  // Replaces a status paragraph's content with a small spinner + message,
  // used for every "fetching from the sheet" moment (appointments,
  // messages, Cancel Dates bookings). The caller still sets textContent
  // directly once loading finishes (success, empty, or error), which
  // naturally clears the spinner too.
  function setLoadingStatus(el, text) {
    el.className = 'form-status';
    el.innerHTML = '';
    var wrap = document.createElement('span');
    wrap.className = 'loki-loading';
    wrap.appendChild(createSpinner('loki-spinner-sm'));
    var label = document.createElement('span');
    label.textContent = text;
    wrap.appendChild(label);
    el.appendChild(wrap);
  }

  /* ---------- tiny inline icon set (subset reused from the main site) ---------- */
  var icons = {
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17"/><path d="M8 3v4"/><path d="M16 3v4"/></svg>',
    'message-circle': '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 1 3.2 6.4L4 20l1.3-3.5A8 8 0 0 1 4 12z"/></svg>',
    'arrow-up': '<svg viewBox="0 0 24 24"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>',
    'x-circle': '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6"/><path d="M15 9l-6 6"/></svg>',
    refresh: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>'
  };
  Array.prototype.forEach.call(document.querySelectorAll('i[data-icon]'), function (el) {
    var name = el.getAttribute('data-icon');
    if (icons[name]) el.innerHTML = icons[name];
  });

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function safeSessionGet(key) {
    try { return sessionStorage.getItem(key) || ''; } catch (e) { return ''; }
  }
  function safeSessionSet(key, val) {
    try { sessionStorage.setItem(key, val); } catch (e) { /* ignore */ }
  }
  function safeSessionRemove(key) {
    try { sessionStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  /* ---------- date helpers ---------- */
  function pad2(n) { return String(n).length < 2 ? '0' + n : String(n); }
  function toDateStr(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function parseDateStr(s) {
    var parts = String(s || '').split('-').map(Number);
    return new Date(parts[0] || 1970, (parts[1] || 1) - 1, parts[2] || 1);
  }
  function addDays(d, n) { var r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function startOfToday() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }

  function formatDateHeading(dateStr) {
    var d = parseDateStr(dateStr);
    return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  function formatRangeLabel(start, end) {
    var a = start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    var b = end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    return a + ' – ' + b;
  }
  // Groups a message's UTC timestamp back into its IST calendar date, so
  // "today" in the Messages section matches the clinic's local day.
  function istDateKeyFromIso(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(d);
    var map = {};
    parts.forEach(function (p) { map[p.type] = p.value; });
    return map.year + '-' + map.month + '-' + map.day;
  }
  function formatIstTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
  }

  /* ---------- passcode gate ---------- */
  var gate = document.getElementById('lokiGate');
  var app = document.getElementById('lokiApp');
  var gateForm = document.getElementById('lokiGateForm');
  var gateStatus = document.getElementById('lokiGateStatus');
  var passcodeInput = document.getElementById('lokiPasscodeInput');
  var lockBtn = document.getElementById('lokiLockBtn');

  var currentPasscode = '';

  function unlock(passcode) {
    currentPasscode = passcode;
    gate.hidden = true;
    app.hidden = false;
  }
  function lock() {
    currentPasscode = '';
    safeSessionRemove(PASSCODE_STORAGE_KEY);
    app.hidden = true;
    gate.hidden = false;
    passcodeInput.value = '';
    passcodeInput.focus();
  }

  function buildGetUrl(action, extra) {
    var params = new URLSearchParams(Object.assign({ action: action, passcode: currentPasscode }, extra || {}));
    return GOOGLE_SHEET_WEBAPP_URL + '?' + params.toString();
  }

  function verifyPasscode(passcode) {
    var params = new URLSearchParams({ action: 'lokiVerifyPasscode', passcode: passcode });
    return fetch(GOOGLE_SHEET_WEBAPP_URL + '?' + params.toString())
      .then(function (res) { return res.json(); })
      .then(function (data) { return !!data.valid; });
  }

  gateForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var val = passcodeInput.value.trim();
    if (!val) return;
    var submitBtn = gateForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    gateStatus.textContent = 'Checking…';
    gateStatus.className = 'form-status';

    verifyPasscode(val).then(function (ok) {
      if (ok) {
        safeSessionSet(PASSCODE_STORAGE_KEY, val);
        gateStatus.textContent = '';
        unlock(val);
      } else {
        gateStatus.textContent = 'Incorrect passcode.';
        gateStatus.className = 'form-status error';
      }
    }).catch(function () {
      gateStatus.textContent = 'Could not reach the server. Please try again.';
      gateStatus.className = 'form-status error';
    }).finally(function () {
      submitBtn.disabled = false;
    });
  });

  lockBtn.addEventListener('click', lock);

  (function tryAutoUnlock() {
    var saved = safeSessionGet(PASSCODE_STORAGE_KEY);
    if (!saved) return;
    verifyPasscode(saved).then(function (ok) {
      if (ok) unlock(saved);
      else safeSessionRemove(PASSCODE_STORAGE_KEY);
    }).catch(function () { /* stay on the gate, user can retype */ });
  })();

  /* ---------- Appointment Section ---------- */
  var apptToggle = document.getElementById('apptToggle');
  var apptBody = document.getElementById('apptBody');
  var apptList = document.getElementById('apptList');
  var apptStatus = document.getElementById('apptStatus');
  var apptRangeLabel = document.getElementById('apptRangeLabel');
  var apptPrevBtn = document.getElementById('apptPrevBtn');
  var apptNextBtn = document.getElementById('apptNextBtn');
  var apptTodayBtn = document.getElementById('apptTodayBtn');
  var apptRefreshBtn = document.getElementById('apptRefreshBtn');
  var apptSaveBar = document.getElementById('apptSaveBar');
  var apptSaveCount = document.getElementById('apptSaveCount');
  var apptSaveBtn = document.getElementById('apptSaveBtn');
  var apptSavingOverlay = document.getElementById('apptSavingOverlay');

  var appointmentsCache = null; // array, fetched once per unlock (or forced refresh)
  var apptWindowStart = startOfToday(); // appointments default forward: today .. +6
  var apptChanges = {}; // id -> partial change object, e.g. { status: 'Cancelled', cancelledReason: '...' }
  var APPT_STATUS_VALUES = ['', 'Cancelled', 'ReScheduled', 'Finished', 'Past'];
  var APPT_STATUS_LABELS = { '': 'Upcoming', 'Cancelled': 'Cancelled', 'ReScheduled': 'ReScheduled', 'Finished': 'Finished', 'Past': 'Past' };

  // Always pulls a fresh copy from the sheet and overwrites appointmentsCache
  // -- used by every button that should show current data (Earlier/Today/
  // Later, the Cancel Dates tabs/Show Bookings, and each Refresh button).
  function fetchAppointments(onReady, onError) {
    fetch(buildGetUrl('lokiAppointments'))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.result !== 'success') throw new Error(data.message || 'Failed to load.');
        appointmentsCache = data.appointments;
        onReady();
      })
      .catch(function (err) { onError(err); });
  }

  // Fetches appointmentsCache only if it isn't already loaded -- used for
  // the fast path when a section is first opened, so reopening it doesn't
  // re-fetch unnecessarily. Everything that navigates WITHIN a section
  // (nav buttons, tabs, Refresh) goes through fetchAppointments() instead,
  // so it always shows current data.
  function ensureAppointmentsLoaded(onReady, onError) {
    if (appointmentsCache) { onReady(); return; }
    fetchAppointments(onReady, onError);
  }

  // Disables + spins a Refresh button's icon while its reload is in
  // flight; a no-op when called without a button (nav/tab clicks reuse the
  // same reload functions but don't have their own refresh icon to spin).
  function startRefreshSpin(btn) { if (btn) { btn.disabled = true; btn.classList.add('is-spinning'); } }
  function stopRefreshSpin(btn) { if (btn) { btn.disabled = false; btn.classList.remove('is-spinning'); } }

  // Tracks one field change for one appointment row in apptChanges,
  // dropping the field (and the whole entry) once it matches again.
  function setApptChangeField(id, field, value, originalValue) {
    var entry = apptChanges[id] || {};
    if (value === (originalValue || '')) {
      delete entry[field];
    } else {
      entry[field] = value;
    }
    if (Object.keys(entry).length) {
      apptChanges[id] = entry;
    } else {
      delete apptChanges[id];
    }
  }

  function loadAppointments() {
    setLoadingStatus(apptStatus, 'Loading appointments…');
    ensureAppointmentsLoaded(function () {
      apptStatus.textContent = '';
      renderAppointments();
    }, function (err) {
      apptStatus.textContent = 'Could not load appointments. ' + (err && err.message ? err.message : '');
      apptStatus.className = 'form-status error';
    });
  }

  // Always pulls fresh data and re-renders using whatever date window is
  // currently showing -- used by Earlier/Today/Later and the Refresh
  // button, so neither one resets the view back to "today" or shows
  // stale data. btn (optional) is the Refresh icon button to spin/disable
  // while the reload is in flight.
  function reloadAppointments(btn) {
    setLoadingStatus(apptStatus, 'Loading appointments…');
    fetchAppointments(function () {
      apptStatus.textContent = '';
      renderAppointments();
      stopRefreshSpin(btn);
    }, function (err) {
      apptStatus.textContent = 'Could not load appointments. ' + (err && err.message ? err.message : '');
      apptStatus.className = 'form-status error';
      stopRefreshSpin(btn);
    });
  }

  function renderAppointments() {
    var windowEnd = addDays(apptWindowStart, WINDOW_DAYS - 1);
    apptRangeLabel.textContent = formatRangeLabel(apptWindowStart, windowEnd);

    var byDate = {};
    (appointmentsCache || []).forEach(function (a) {
      var d = parseDateStr(a.date);
      if (d < apptWindowStart || d > windowEnd) return;
      (byDate[a.date] = byDate[a.date] || []).push(a);
    });

    var dateKeys = Object.keys(byDate).sort();
    apptList.innerHTML = '';

    if (!dateKeys.length) {
      var empty = document.createElement('p');
      empty.className = 'loki-empty';
      empty.textContent = 'No appointments in this range.';
      apptList.appendChild(empty);
      return;
    }

    dateKeys.forEach(function (dateKey) {
      var group = document.createElement('div');
      group.className = 'loki-date-group';
      var heading = document.createElement('h4');
      heading.textContent = formatDateHeading(dateKey);
      group.appendChild(heading);

      byDate[dateKey]
        .slice()
        .sort(function (a, b) { return a.startTime.localeCompare(b.startTime); })
        .forEach(function (a) { group.appendChild(buildApptRow(a)); });

      apptList.appendChild(group);
    });
  }

  function apptRowStatusClass(status) {
    if (status === 'Cancelled') return ' is-cancelled';
    if (status === 'ReScheduled') return ' is-rescheduled';
    if (status === 'Finished') return ' is-finished';
    if (status === 'Past') return ' is-past';
    return '';
  }

  function buildApptRow(a) {
    // A refresh/reload can happen while the doctor has unsaved edits
    // pending (apptChanges). Re-rendering with the fresh server values
    // would silently wipe those edits out of view, so any field that has
    // a pending change shows that pending value instead of the fresh one
    // -- the edit itself (apptChanges) is never touched by this, only
    // what's displayed.
    var pending = apptChanges[a.id] || {};
    var displayStatus = Object.prototype.hasOwnProperty.call(pending, 'status') ? pending.status : (a.status || '');
    var displayReason = Object.prototype.hasOwnProperty.call(pending, 'cancelledReason') ? pending.cancelledReason : (a.cancelledReason || '');

    var row = document.createElement('div');
    row.className = 'appt-row' + apptRowStatusClass(displayStatus);

    var info = document.createElement('div');
    info.className = 'appt-row-info';
    var infoHtml = '<strong>' + escapeHtml(a.name || 'Unknown') + '</strong>' +
      '<span>' + escapeHtml(a.phone || '-') + '</span>';
    if (a.email) infoHtml += '<span>' + escapeHtml(a.email) + '</span>';
    if (a.rescheduledId) infoHtml += '<span class="appt-row-rescheduled-note">&rarr; Rescheduled as appointment #' + escapeHtml(String(a.rescheduledId)) + '</span>';
    info.innerHTML = infoHtml;
    row.appendChild(info);

    var time = document.createElement('div');
    time.className = 'appt-row-time';
    time.textContent = a.timeSlotLabel || '';
    row.appendChild(time);

    var controls = document.createElement('div');
    controls.className = 'appt-row-controls';

    var statusWrap = document.createElement('div');
    statusWrap.className = 'appt-row-status';
    var statusSelect = document.createElement('select');
    APPT_STATUS_VALUES.forEach(function (value) {
      var opt = document.createElement('option');
      opt.value = value;
      opt.textContent = APPT_STATUS_LABELS[value];
      statusSelect.appendChild(opt);
    });
    statusSelect.value = displayStatus;
    statusSelect.addEventListener('change', function () {
      row.className = 'appt-row' + apptRowStatusClass(statusSelect.value);
      setApptChangeField(a.id, 'status', statusSelect.value, a.status || '');
      updateApptSaveBar();
    });
    statusWrap.appendChild(statusSelect);
    controls.appendChild(statusWrap);

    var reasonWrap = document.createElement('div');
    reasonWrap.className = 'appt-row-reason';
    var reasonLabel = document.createElement('span');
    reasonLabel.className = 'appt-row-reason-label';
    reasonLabel.textContent = 'Cancelled Reason';
    reasonWrap.appendChild(reasonLabel);
    var reasonSelect = buildReasonSelect(displayReason);
    reasonSelect.addEventListener('change', function () {
      setApptChangeField(a.id, 'cancelledReason', reasonSelect.value, a.cancelledReason || '');
      updateApptSaveBar();
    });
    reasonWrap.appendChild(reasonSelect);
    controls.appendChild(reasonWrap);

    var prescriptionBtn = document.createElement('button');
    prescriptionBtn.type = 'button';
    prescriptionBtn.className = 'appt-row-prescription-btn';
    prescriptionBtn.textContent = a.prescription ? 'Edit Prescription' : 'Add Prescription';
    prescriptionBtn.addEventListener('click', function () { openPrescriptionModal(a); });
    controls.appendChild(prescriptionBtn);

    row.appendChild(controls);

    return row;
  }

  function updateApptSaveBar() {
    var keys = Object.keys(apptChanges);
    apptSaveBar.hidden = keys.length === 0;
    apptSaveCount.textContent = keys.length + (keys.length === 1 ? ' change' : ' changes');
  }

  apptSaveBtn.addEventListener('click', function () {
    var keys = Object.keys(apptChanges);
    if (!keys.length) return;

    apptSaveBtn.disabled = true;
    apptSaveBtn.textContent = 'Saving…';
    apptSavingOverlay.classList.add('is-active');

    var changesPayload = keys.map(function (id) {
      var entry = apptChanges[id];
      var payload = { id: id };
      if (Object.prototype.hasOwnProperty.call(entry, 'status')) payload.status = entry.status;
      if (Object.prototype.hasOwnProperty.call(entry, 'cancelledReason')) payload.cancelledReason = entry.cancelledReason;
      return payload;
    });

    var fd = new FormData();
    fd.append('action', 'lokiSaveApptStatus');
    fd.append('passcode', currentPasscode);
    fd.append('changes', JSON.stringify(changesPayload));

    fetch(GOOGLE_SHEET_WEBAPP_URL, { method: 'POST', body: fd })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.result !== 'success') throw new Error(data.message || 'Save failed.');

        changesPayload.forEach(function (c) {
          var a = appointmentsCache.filter(function (x) { return String(x.id) === String(c.id); })[0];
          if (a) {
            if (Object.prototype.hasOwnProperty.call(c, 'status')) a.status = c.status;
            if (Object.prototype.hasOwnProperty.call(c, 'cancelledReason')) a.cancelledReason = c.cancelledReason;
          }
        });
        apptChanges = {};
        updateApptSaveBar();

        var notifiedCount = (data.notified || []).length;
        apptStatus.textContent = 'Saved.' + (notifiedCount ? ' ' + notifiedCount + ' patient(s) emailed about their cancellation.' : '');
        apptStatus.className = 'form-status success';
        showSavedToast();
        renderAppointments();
      })
      .catch(function (err) {
        apptStatus.textContent = 'Could not save changes. ' + (err && err.message ? err.message : '');
        apptStatus.className = 'form-status error';
      })
      .finally(function () {
        apptSaveBtn.disabled = false;
        apptSaveBtn.textContent = 'Save Changes';
        apptSavingOverlay.classList.remove('is-active');
      });
  });

  apptToggle.addEventListener('click', function () {
    var expanded = apptToggle.getAttribute('aria-expanded') === 'true';
    apptToggle.setAttribute('aria-expanded', String(!expanded));
    apptBody.hidden = expanded;
    if (!expanded) loadAppointments();
  });
  apptPrevBtn.addEventListener('click', function () { apptWindowStart = addDays(apptWindowStart, -WINDOW_DAYS); reloadAppointments(); });
  apptNextBtn.addEventListener('click', function () { apptWindowStart = addDays(apptWindowStart, WINDOW_DAYS); reloadAppointments(); });
  apptTodayBtn.addEventListener('click', function () { apptWindowStart = startOfToday(); reloadAppointments(); });
  apptRefreshBtn.addEventListener('click', function () { startRefreshSpin(apptRefreshBtn); reloadAppointments(apptRefreshBtn); });

  /* ---------- Messages Section ---------- */
  var msgToggle = document.getElementById('msgToggle');
  var msgBody = document.getElementById('msgBody');
  var msgList = document.getElementById('msgList');
  var msgStatus = document.getElementById('msgStatus');
  var msgRangeLabel = document.getElementById('msgRangeLabel');
  var msgPrevBtn = document.getElementById('msgPrevBtn');
  var msgNextBtn = document.getElementById('msgNextBtn');
  var msgTodayBtn = document.getElementById('msgTodayBtn');
  var msgRefreshBtn = document.getElementById('msgRefreshBtn');

  var messagesCache = null;
  // Messages are historical (received in the past), so default to a
  // trailing window ending today, rather than looking forward like
  // appointments do.
  var msgWindowStart = addDays(startOfToday(), -(WINDOW_DAYS - 1));

  // Always pulls fresh data from the sheet and overwrites messagesCache --
  // mirrors fetchAppointments(), used by Earlier/Today/Later and Refresh.
  function fetchMessages(onReady, onError) {
    fetch(buildGetUrl('lokiMessages'))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.result !== 'success') throw new Error(data.message || 'Failed to load.');
        messagesCache = data.messages;
        onReady();
      })
      .catch(function (err) { onError(err); });
  }

  function loadMessages() {
    if (messagesCache) { renderMessages(); return; }
    setLoadingStatus(msgStatus, 'Loading messages…');
    fetchMessages(function () {
      msgStatus.textContent = '';
      renderMessages();
    }, function (err) {
      msgStatus.textContent = 'Could not load messages. ' + (err && err.message ? err.message : '');
      msgStatus.className = 'form-status error';
    });
  }

  // Always pulls fresh data and re-renders using whatever date window is
  // currently showing -- used by Earlier/Today/Later and the Refresh
  // button, same pattern as reloadAppointments().
  function reloadMessages(btn) {
    setLoadingStatus(msgStatus, 'Loading messages…');
    fetchMessages(function () {
      msgStatus.textContent = '';
      renderMessages();
      stopRefreshSpin(btn);
    }, function (err) {
      msgStatus.textContent = 'Could not load messages. ' + (err && err.message ? err.message : '');
      msgStatus.className = 'form-status error';
      stopRefreshSpin(btn);
    });
  }

  function renderMessages() {
    var windowEnd = addDays(msgWindowStart, WINDOW_DAYS - 1);
    msgRangeLabel.textContent = formatRangeLabel(msgWindowStart, windowEnd);

    var byDate = {};
    (messagesCache || []).forEach(function (m) {
      var dateKey = istDateKeyFromIso(m.timestamp);
      if (!dateKey) return;
      var d = parseDateStr(dateKey);
      if (d < msgWindowStart || d > windowEnd) return;
      (byDate[dateKey] = byDate[dateKey] || []).push(m);
    });

    var dateKeys = Object.keys(byDate).sort();
    msgList.innerHTML = '';

    if (!dateKeys.length) {
      var empty = document.createElement('p');
      empty.className = 'loki-empty';
      empty.textContent = 'No messages in this range.';
      msgList.appendChild(empty);
      return;
    }

    dateKeys.forEach(function (dateKey) {
      var group = document.createElement('div');
      group.className = 'loki-date-group';
      var heading = document.createElement('h4');
      heading.textContent = formatDateHeading(dateKey);
      group.appendChild(heading);

      byDate[dateKey]
        .slice()
        .sort(function (a, b) { return a.timestamp.localeCompare(b.timestamp); })
        .forEach(function (m) { group.appendChild(buildMsgCard(m)); });

      msgList.appendChild(group);
    });
  }

  function buildMsgCard(m) {
    var card = document.createElement('div');
    card.className = 'msg-card';

    var head = document.createElement('div');
    head.className = 'msg-card-head';
    head.innerHTML =
      '<strong>' + escapeHtml(m.name || 'Unknown') + ' &middot; ' + escapeHtml(m.phone || '-') + '</strong>' +
      '<span>' + escapeHtml(formatIstTime(m.timestamp)) + '</span>';
    card.appendChild(head);

    var body = document.createElement('div');
    body.className = 'msg-card-body';
    body.textContent = m.message || '';
    card.appendChild(body);

    if (m.inlineReply) {
      var replyBox = document.createElement('div');
      replyBox.className = 'msg-card-reply';
      replyBox.innerHTML = '<strong>Your reply</strong>';
      var replyText = document.createElement('div');
      replyText.textContent = m.inlineReply;
      replyBox.appendChild(replyText);
      card.appendChild(replyBox);
    }

    var actions = document.createElement('div');
    actions.className = 'msg-card-actions';

    if (m.images && m.images.length) {
      var photosBtn = document.createElement('button');
      photosBtn.type = 'button';
      photosBtn.className = 'btn btn-outline';
      photosBtn.textContent = '📷 View Photos (' + m.images.length + ')';
      photosBtn.addEventListener('click', function () { openPhotosModal(m.images); });
      actions.appendChild(photosBtn);
    }

    var replyBtn = document.createElement('button');
    replyBtn.type = 'button';
    replyBtn.className = 'btn btn-primary';
    replyBtn.textContent = m.inlineReply ? 'Edit Reply' : 'Reply';
    replyBtn.addEventListener('click', function () { openReplyModal(m); });
    actions.appendChild(replyBtn);

    card.appendChild(actions);
    return card;
  }

  msgToggle.addEventListener('click', function () {
    var expanded = msgToggle.getAttribute('aria-expanded') === 'true';
    msgToggle.setAttribute('aria-expanded', String(!expanded));
    msgBody.hidden = expanded;
    if (!expanded) loadMessages();
  });
  msgPrevBtn.addEventListener('click', function () { msgWindowStart = addDays(msgWindowStart, -WINDOW_DAYS); reloadMessages(); });
  msgNextBtn.addEventListener('click', function () { msgWindowStart = addDays(msgWindowStart, WINDOW_DAYS); reloadMessages(); });
  msgTodayBtn.addEventListener('click', function () { msgWindowStart = addDays(startOfToday(), -(WINDOW_DAYS - 1)); reloadMessages(); });
  msgRefreshBtn.addEventListener('click', function () { startRefreshSpin(msgRefreshBtn); reloadMessages(msgRefreshBtn); });

  /* ---------- Photos modal ---------- */
  var photosModalOverlay = document.getElementById('photosModalOverlay');
  var closePhotosModalBtn = document.getElementById('closePhotosModal');
  var photosScroll = document.getElementById('photosScroll');

  function openPhotosModal(images) {
    photosScroll.innerHTML = '';
    if (!images || !images.length) {
      var empty = document.createElement('p');
      empty.className = 'loki-photos-empty';
      empty.textContent = 'No photos were uploaded with this message.';
      photosScroll.appendChild(empty);
    } else {
      images.forEach(function (url) {
        // Each photo gets its own spinner, shown until that specific image
        // has actually finished loading (photos can take a moment to fetch
        // from Drive, especially the first time) -- not just a single
        // spinner for the whole modal, so photos that load quickly show up
        // right away instead of waiting for the slowest one.
        var wrap = document.createElement('div');
        wrap.className = 'loki-photo-wrap';
        wrap.appendChild(createSpinner('loki-spinner-lg'));

        // Each photo is wrapped in a link to its original file so the
        // doctor can open it full-size (actual resolution) in a new tab
        // to zoom in, instead of being limited to the modal's display size.
        var link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.title = 'Open full resolution in a new tab';
        link.className = 'loki-photo-link';

        var img = document.createElement('img');
        img.alt = 'Patient photo';
        img.loading = 'lazy';
        img.addEventListener('load', function () { wrap.classList.add('is-loaded'); });
        img.addEventListener('error', function () {
          wrap.classList.add('is-error');
          var errText = document.createElement('span');
          errText.className = 'loki-photo-error';
          errText.textContent = 'Could not load this photo.';
          wrap.appendChild(errText);
        });
        img.src = url; // set last, after the load/error listeners are attached

        link.appendChild(img);
        wrap.appendChild(link);
        photosScroll.appendChild(wrap);
      });
    }
    photosModalOverlay.classList.add('is-open');
  }
  function closePhotosModal() { photosModalOverlay.classList.remove('is-open'); }
  closePhotosModalBtn.addEventListener('click', closePhotosModal);
  photosModalOverlay.addEventListener('click', function (e) {
    if (e.target === photosModalOverlay) closePhotosModal();
  });

  /* ---------- Reply modal ---------- */
  var replyModalOverlay = document.getElementById('replyModalOverlay');
  var closeReplyModalBtn = document.getElementById('closeReplyModal');
  var replyModalSub = document.getElementById('replyModalSub');
  var replyForm = document.getElementById('replyForm');
  var replyTextarea = document.getElementById('replyTextarea');
  var replyWordCount = document.getElementById('replyWordCount');
  var replyFormStatus = document.getElementById('replyFormStatus');
  var replyTargetTimestamp = null;

  function updateWordCount() {
    var n = countWords(replyTextarea.value);
    replyWordCount.textContent = n + ' / ' + MAX_REPLY_WORDS + ' words';
    replyWordCount.classList.toggle('over-limit', n > MAX_REPLY_WORDS);
  }
  replyTextarea.addEventListener('input', updateWordCount);

  function openReplyModal(m) {
    replyTargetTimestamp = m.timestamp;
    replyModalSub.textContent = 'To ' + (m.name || 'Unknown') + ' (' + (m.phone || '-') + ')';
    replyTextarea.value = m.inlineReply || '';
    updateWordCount();
    replyFormStatus.textContent = '';
    replyFormStatus.className = 'form-status';
    replyModalOverlay.classList.add('is-open');
    replyTextarea.focus();
  }
  function closeReplyModal() { replyModalOverlay.classList.remove('is-open'); replyTargetTimestamp = null; }
  closeReplyModalBtn.addEventListener('click', closeReplyModal);
  replyModalOverlay.addEventListener('click', function (e) {
    if (e.target === replyModalOverlay) closeReplyModal();
  });

  replyForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = replyTextarea.value.trim();
    if (!text || !replyTargetTimestamp) return;
    if (countWords(text) > MAX_REPLY_WORDS) {
      replyFormStatus.textContent = 'Please keep the reply under ' + MAX_REPLY_WORDS + ' words.';
      replyFormStatus.className = 'form-status error';
      return;
    }

    var submitBtn = replyForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';
    replyFormStatus.textContent = '';
    replyFormStatus.className = 'form-status';

    var fd = new FormData();
    fd.append('action', 'lokiSendReply');
    fd.append('passcode', currentPasscode);
    fd.append('timestamp', replyTargetTimestamp);
    fd.append('reply', text);

    var targetTimestamp = replyTargetTimestamp;

    fetch(GOOGLE_SHEET_WEBAPP_URL, { method: 'POST', body: fd })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.result !== 'success') throw new Error(data.message || 'Could not send reply.');

        var m = messagesCache.filter(function (x) { return x.timestamp === targetTimestamp; })[0];
        if (m) m.inlineReply = text;

        replyFormStatus.textContent = 'Reply saved.';
        replyFormStatus.className = 'form-status success';
        showSavedToast();
        renderMessages();
        setTimeout(closeReplyModal, 900);
      })
      .catch(function (err) {
        replyFormStatus.textContent = err && err.message ? err.message : 'Something went wrong.';
        replyFormStatus.className = 'form-status error';
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Reply';
      });
  });

  /* ---------- Prescription modal ---------- */
  var prescriptionModalOverlay = document.getElementById('prescriptionModalOverlay');
  var closePrescriptionModalBtn = document.getElementById('closePrescriptionModal');
  var prescriptionModalSub = document.getElementById('prescriptionModalSub');
  var prescriptionForm = document.getElementById('prescriptionForm');
  var prescriptionTextarea = document.getElementById('prescriptionTextarea');
  var prescriptionWordCount = document.getElementById('prescriptionWordCount');
  var prescriptionFormStatus = document.getElementById('prescriptionFormStatus');
  var prescriptionTargetId = null;

  function updatePrescriptionWordCount() {
    var n = countWords(prescriptionTextarea.value);
    prescriptionWordCount.textContent = n + ' / ' + MAX_PRESCRIPTION_WORDS + ' words';
    prescriptionWordCount.classList.toggle('over-limit', n > MAX_PRESCRIPTION_WORDS);
  }
  prescriptionTextarea.addEventListener('input', updatePrescriptionWordCount);

  function openPrescriptionModal(a) {
    prescriptionTargetId = a.id;
    prescriptionModalSub.textContent = (a.name || 'Unknown') + ' (' + (a.phone || '-') + ') · ' + formatDateHeading(a.date) + ' · ' + (a.timeSlotLabel || '');
    prescriptionTextarea.value = a.prescription || '';
    updatePrescriptionWordCount();
    prescriptionFormStatus.textContent = '';
    prescriptionFormStatus.className = 'form-status';
    prescriptionModalOverlay.classList.add('is-open');
    prescriptionTextarea.focus();
  }
  function closePrescriptionModal() { prescriptionModalOverlay.classList.remove('is-open'); prescriptionTargetId = null; }
  closePrescriptionModalBtn.addEventListener('click', closePrescriptionModal);
  prescriptionModalOverlay.addEventListener('click', function (e) {
    if (e.target === prescriptionModalOverlay) closePrescriptionModal();
  });

  prescriptionForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (prescriptionTargetId === null) return;
    var text = prescriptionTextarea.value;
    if (countWords(text) > MAX_PRESCRIPTION_WORDS) {
      prescriptionFormStatus.textContent = 'Please keep the prescription under ' + MAX_PRESCRIPTION_WORDS + ' words.';
      prescriptionFormStatus.className = 'form-status error';
      return;
    }

    var submitBtn = prescriptionForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';
    prescriptionFormStatus.textContent = '';
    prescriptionFormStatus.className = 'form-status';

    var targetId = prescriptionTargetId;
    var fd = new FormData();
    fd.append('action', 'lokiSaveApptStatus');
    fd.append('passcode', currentPasscode);
    fd.append('changes', JSON.stringify([{ id: targetId, prescription: text }]));

    fetch(GOOGLE_SHEET_WEBAPP_URL, { method: 'POST', body: fd })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.result !== 'success') throw new Error(data.message || 'Could not save prescription.');

        var a = appointmentsCache.filter(function (x) { return String(x.id) === String(targetId); })[0];
        if (a) a.prescription = text;

        prescriptionFormStatus.textContent = 'Prescription saved.';
        prescriptionFormStatus.className = 'form-status success';
        showSavedToast();
        renderAppointments();
        setTimeout(closePrescriptionModal, 900);
      })
      .catch(function (err) {
        prescriptionFormStatus.textContent = err && err.message ? err.message : 'Something went wrong.';
        prescriptionFormStatus.className = 'form-status error';
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Prescription';
      });
  });

  /* ---------- Cancel Dates section ---------- */
  var cancelToggle = document.getElementById('cancelToggle');
  var cancelBody = document.getElementById('cancelBody');
  var cancelAllTabBtn = document.getElementById('cancelAllTabBtn');
  var cancelRangeTabBtn = document.getElementById('cancelRangeTabBtn');
  var cancelRefreshBtn = document.getElementById('cancelRefreshBtn');
  var cancelAllPanel = document.getElementById('cancelAllPanel');
  var cancelRangePanel = document.getElementById('cancelRangePanel');

  var cancelAllStatus = document.getElementById('cancelAllStatus');
  var cancelAllSelectAll = document.getElementById('cancelAllSelectAll');
  var cancelAllSelectedCount = document.getElementById('cancelAllSelectedCount');
  var cancelAllList = document.getElementById('cancelAllList');
  var cancelAllSaveBar = document.getElementById('cancelAllSaveBar');
  var cancelAllReasonSelect = document.getElementById('cancelAllReasonSelect');
  var cancelAllSaveBtn = document.getElementById('cancelAllSaveBtn');

  var cancelRangeStart = document.getElementById('cancelRangeStart');
  var cancelRangeEnd = document.getElementById('cancelRangeEnd');
  var cancelRangeLoadBtn = document.getElementById('cancelRangeLoadBtn');
  var cancelRangeStatus = document.getElementById('cancelRangeStatus');
  var cancelRangeSelectbar = document.getElementById('cancelRangeSelectbar');
  var cancelRangeSelectAll = document.getElementById('cancelRangeSelectAll');
  var cancelRangeSelectedCount = document.getElementById('cancelRangeSelectedCount');
  var cancelRangeList = document.getElementById('cancelRangeList');
  var cancelRangeSaveBar = document.getElementById('cancelRangeSaveBar');
  var cancelRangeReasonSelect = document.getElementById('cancelRangeReasonSelect');
  var cancelRangeSaveBtn = document.getElementById('cancelRangeSaveBtn');

  populateReasonSelect(cancelAllReasonSelect);
  populateReasonSelect(cancelRangeReasonSelect);

  var cancelAllSelected = {};     // id -> true
  var cancelRangeSelected = {};   // id -> true
  var cancelRangeCandidates = []; // bookings matched by the last "Show Bookings" load

  // Only blank/Upcoming or auto-promoted Past bookings are eligible for
  // cancellation here -- Cancelled/ReScheduled/Finished rows are excluded.
  function cancelCandidateStatus(status) {
    var s = status || '';
    return s === '' || s === 'Past';
  }

  function buildCancelRow(a, selectedMap, onToggle) {
    var row = document.createElement('div');
    row.className = 'cancel-row';

    var checkLabel = document.createElement('label');
    checkLabel.className = 'loki-checkbox-label cancel-row-check';
    var checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!selectedMap[a.id];
    checkbox.addEventListener('change', function () {
      if (checkbox.checked) selectedMap[a.id] = true; else delete selectedMap[a.id];
      onToggle();
    });
    checkLabel.appendChild(checkbox);
    row.appendChild(checkLabel);

    var info = document.createElement('div');
    info.className = 'appt-row-info';
    var infoHtml = '<strong>' + escapeHtml(a.name || 'Unknown') + '</strong>' +
      '<span>' + escapeHtml(a.phone || '-') + '</span>';
    if (a.email) infoHtml += '<span>' + escapeHtml(a.email) + '</span>';
    info.innerHTML = infoHtml;
    row.appendChild(info);

    var time = document.createElement('div');
    time.className = 'appt-row-time';
    time.textContent = formatDateHeading(a.date) + ' · ' + (a.timeSlotLabel || '');
    row.appendChild(time);

    var badge = document.createElement('span');
    badge.className = 'appt-row-status-badge' + apptRowStatusClass(a.status);
    badge.textContent = APPT_STATUS_LABELS[a.status || ''] || 'Upcoming';
    row.appendChild(badge);

    return row;
  }

  function renderCancelGroupedList(listEl, candidates, selectedMap, onToggle) {
    listEl.innerHTML = '';
    if (!candidates.length) {
      var empty = document.createElement('p');
      empty.className = 'loki-empty';
      empty.textContent = 'No bookings to show.';
      listEl.appendChild(empty);
      return;
    }
    var byDate = {};
    candidates.forEach(function (a) { (byDate[a.date] = byDate[a.date] || []).push(a); });
    Object.keys(byDate).sort().forEach(function (dateKey) {
      var group = document.createElement('div');
      group.className = 'loki-date-group';
      var heading = document.createElement('h4');
      heading.textContent = formatDateHeading(dateKey);
      group.appendChild(heading);
      byDate[dateKey]
        .slice()
        .sort(function (a, b) { return a.startTime.localeCompare(b.startTime); })
        .forEach(function (a) { group.appendChild(buildCancelRow(a, selectedMap, onToggle)); });
      listEl.appendChild(group);
    });
  }

  function saveCancelBatch(ids, reason, btn, statusEl, onDone) {
    if (!ids.length) return;
    btn.disabled = true;
    var originalLabel = btn.textContent;
    btn.textContent = 'Cancelling…';

    var changesPayload = ids.map(function (id) {
      return { id: id, status: 'Cancelled', cancelledReason: reason || '' };
    });

    var fd = new FormData();
    fd.append('action', 'lokiSaveApptStatus');
    fd.append('passcode', currentPasscode);
    fd.append('changes', JSON.stringify(changesPayload));

    fetch(GOOGLE_SHEET_WEBAPP_URL, { method: 'POST', body: fd })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.result !== 'success') throw new Error(data.message || 'Could not cancel.');

        changesPayload.forEach(function (c) {
          var a = appointmentsCache.filter(function (x) { return String(x.id) === String(c.id); })[0];
          if (a) { a.status = c.status; a.cancelledReason = c.cancelledReason; }
        });

        var notifiedCount = (data.notified || []).length;
        statusEl.textContent = ids.length + (ids.length === 1 ? ' booking' : ' bookings') + ' cancelled.' +
          (notifiedCount ? ' ' + notifiedCount + ' patient(s) emailed.' : '');
        statusEl.className = 'form-status success';
        showSavedToast();
        onDone();
      })
      .catch(function (err) {
        statusEl.textContent = err && err.message ? err.message : 'Could not cancel the selected bookings.';
        statusEl.className = 'form-status error';
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = originalLabel;
      });
  }

  /* -- All Bookings sub-tab -- */
  function cancelAllCandidates() {
    return (appointmentsCache || []).filter(function (a) { return cancelCandidateStatus(a.status); });
  }

  function updateCancelAllBar() {
    var keys = Object.keys(cancelAllSelected);
    cancelAllSelectedCount.textContent = keys.length + ' selected';
    cancelAllSaveBar.hidden = keys.length === 0;
    var candidates = cancelAllCandidates();
    cancelAllSelectAll.checked = candidates.length > 0 && keys.length === candidates.length;
  }

  function renderCancelAll() {
    var candidates = cancelAllCandidates();
    renderCancelGroupedList(cancelAllList, candidates, cancelAllSelected, updateCancelAllBar);
    updateCancelAllBar();
  }

  // Always pulls fresh data, drops the current selection (it was made
  // against data that may no longer be current) and re-renders -- used by
  // switching to this tab and by the Refresh button.
  function refreshCancelAll(btn) {
    setLoadingStatus(cancelAllStatus, 'Loading bookings…');
    fetchAppointments(function () {
      cancelAllStatus.textContent = '';
      cancelAllSelected = {};
      renderCancelAll();
      stopRefreshSpin(btn);
    }, function (err) {
      cancelAllStatus.textContent = 'Could not load appointments. ' + (err && err.message ? err.message : '');
      cancelAllStatus.className = 'form-status error';
      stopRefreshSpin(btn);
    });
  }

  cancelAllSelectAll.addEventListener('change', function () {
    var candidates = cancelAllCandidates();
    cancelAllSelected = {};
    if (cancelAllSelectAll.checked) {
      candidates.forEach(function (a) { cancelAllSelected[a.id] = true; });
    }
    renderCancelAll();
  });

  cancelAllSaveBtn.addEventListener('click', function () {
    var ids = Object.keys(cancelAllSelected);
    saveCancelBatch(ids, cancelAllReasonSelect.value, cancelAllSaveBtn, cancelAllStatus, function () {
      cancelAllSelected = {};
      renderCancelAll();
    });
  });

  /* -- Date Range sub-tab -- */
  function updateCancelRangeBar() {
    var keys = Object.keys(cancelRangeSelected);
    cancelRangeSelectedCount.textContent = keys.length + ' selected';
    cancelRangeSaveBar.hidden = keys.length === 0;
    cancelRangeSelectAll.checked = cancelRangeCandidates.length > 0 && keys.length === cancelRangeCandidates.length;
  }

  function renderCancelRange() {
    renderCancelGroupedList(cancelRangeList, cancelRangeCandidates, cancelRangeSelected, updateCancelRangeBar);
    updateCancelRangeBar();
  }

  function loadCancelRange() {
    var startStr = cancelRangeStart.value;
    var endStr = cancelRangeEnd.value;
    if (!startStr || !endStr) {
      cancelRangeStatus.textContent = 'Please choose both a start and an end date.';
      cancelRangeStatus.className = 'form-status error';
      return;
    }
    var start = parseDateStr(startStr);
    var end = parseDateStr(endStr);
    if (end < start) {
      cancelRangeStatus.textContent = 'The end date must be on or after the start date.';
      cancelRangeStatus.className = 'form-status error';
      return;
    }

    cancelRangeSelected = {};
    cancelRangeCandidates = (appointmentsCache || []).filter(function (a) {
      if (!cancelCandidateStatus(a.status)) return false;
      var d = parseDateStr(a.date);
      return d >= start && d <= end;
    });
    cancelRangeSelectbar.hidden = false;
    cancelRangeStatus.textContent = cancelRangeCandidates.length ? '' : 'No bookings found in that date range.';
    cancelRangeStatus.className = 'form-status';
    renderCancelRange();
  }

  // Always pulls fresh data, then re-filters using whatever start/end
  // dates are currently chosen (loadCancelRange() itself validates them
  // and shows the right message if either is missing) -- used by "Show
  // Bookings", switching to this tab, and the Refresh button.
  function loadCancelRangeFresh(btn) {
    setLoadingStatus(cancelRangeStatus, 'Loading bookings…');
    fetchAppointments(function () {
      loadCancelRange();
      stopRefreshSpin(btn);
    }, function (err) {
      cancelRangeStatus.textContent = 'Could not load appointments. ' + (err && err.message ? err.message : '');
      cancelRangeStatus.className = 'form-status error';
      stopRefreshSpin(btn);
    });
  }

  cancelRangeLoadBtn.addEventListener('click', function () { loadCancelRangeFresh(); });

  cancelRangeSelectAll.addEventListener('change', function () {
    cancelRangeSelected = {};
    if (cancelRangeSelectAll.checked) {
      cancelRangeCandidates.forEach(function (a) { cancelRangeSelected[a.id] = true; });
    }
    renderCancelRange();
  });

  cancelRangeSaveBtn.addEventListener('click', function () {
    var ids = Object.keys(cancelRangeSelected);
    saveCancelBatch(ids, cancelRangeReasonSelect.value, cancelRangeSaveBtn, cancelRangeStatus, function () {
      cancelRangeSelected = {};
      renderCancelRange();
    });
  });

  // Date pickers only ever allow today onward; the end date can never be
  // earlier than whatever start date is currently chosen.
  (function initCancelRangeDates() {
    var todayStr = toDateStr(startOfToday());
    cancelRangeStart.min = todayStr;
    cancelRangeEnd.min = todayStr;
    cancelRangeStart.value = todayStr;
    cancelRangeEnd.value = todayStr;
    cancelRangeStart.addEventListener('change', function () {
      if (cancelRangeStart.value && cancelRangeStart.value < todayStr) cancelRangeStart.value = todayStr;
      if (cancelRangeEnd.value && cancelRangeEnd.value < cancelRangeStart.value) cancelRangeEnd.value = cancelRangeStart.value;
      cancelRangeEnd.min = cancelRangeStart.value || todayStr;
    });
  })();

  // Switching tabs always pulls fresh data for whichever tab is now
  // showing, same as the Refresh button -- for Date Range this re-filters
  // using whatever start/end dates are already chosen (they default to
  // today/today, so this is never a no-op).
  function switchCancelSubtab(which) {
    var isAll = which === 'all';
    cancelAllTabBtn.classList.toggle('is-active', isAll);
    cancelRangeTabBtn.classList.toggle('is-active', !isAll);
    cancelAllPanel.hidden = !isAll;
    cancelRangePanel.hidden = isAll;
    if (isAll) {
      refreshCancelAll();
    } else {
      loadCancelRangeFresh();
    }
  }
  cancelAllTabBtn.addEventListener('click', function () { switchCancelSubtab('all'); });
  cancelRangeTabBtn.addEventListener('click', function () { switchCancelSubtab('range'); });

  // One Refresh button covers whichever Cancel Dates tab is currently
  // active.
  cancelRefreshBtn.addEventListener('click', function () {
    startRefreshSpin(cancelRefreshBtn);
    if (cancelAllTabBtn.classList.contains('is-active')) {
      refreshCancelAll(cancelRefreshBtn);
    } else {
      loadCancelRangeFresh(cancelRefreshBtn);
    }
  });

  cancelToggle.addEventListener('click', function () {
    var expanded = cancelToggle.getAttribute('aria-expanded') === 'true';
    cancelToggle.setAttribute('aria-expanded', String(!expanded));
    cancelBody.hidden = expanded;
    if (!expanded) {
      setLoadingStatus(cancelAllStatus, 'Loading bookings…');
      ensureAppointmentsLoaded(function () {
        cancelAllStatus.textContent = '';
        renderCancelAll();
      }, function (err) {
        cancelAllStatus.textContent = 'Could not load appointments. ' + (err && err.message ? err.message : '');
        cancelAllStatus.className = 'form-status error';
      });
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (photosModalOverlay.classList.contains('is-open')) closePhotosModal();
    if (replyModalOverlay.classList.contains('is-open')) closeReplyModal();
    if (prescriptionModalOverlay.classList.contains('is-open')) closePrescriptionModal();
  });

})();
