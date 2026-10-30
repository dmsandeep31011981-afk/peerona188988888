/* =========================================================
   PeerOna — Dr. Lokesh's private page (loki.html)
   ========================================================= */

(function () {
  'use strict';

  var GOOGLE_SHEET_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbw485zzrMSWZ9uCpLTy4YaDfKC6xVHDOpGAVywC6dGi963b8PGRgq5AVEBxdmJ2Khy_fA/exec';
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
  /* ---------- "Saved" / "Welcome" toast (shown briefly after a save, or
     right after unlocking) ---------- */
  var savedToastEl = null;
  var savedToastTimer = null;
  // extraClass (optional) adds a colour variant on top of the base
  // '.site-toast' look -- e.g. 'toast-welcome' for the orange "Welcome
  // <name>" message, kept distinct from the green default used for
  // "Saved" so the two are never confused. Re-set on every call (not just
  // when the element is first created) so the toast never keeps a stale
  // variant class from a previous, differently-coloured message.
  function showSavedToast(message, extraClass) {
    if (!savedToastEl) {
      savedToastEl = document.createElement('div');
      savedToastEl.setAttribute('role', 'status');
      savedToastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(savedToastEl);
    }
    savedToastEl.className = 'site-toast' + (extraClass ? ' ' + extraClass : '');
    savedToastEl.textContent = message || 'Saved';
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
  var gateSavingOverlay = document.getElementById('lokiGateSavingOverlay');
  var passcodeInput = document.getElementById('lokiPasscodeInput');
  var lockBtn = document.getElementById('lokiLockBtn');
  var lockLabel = document.getElementById('lokiLockLabel');

  var currentPasscode = '';
  var currentRole = ''; // 'Dr Lokesh' or 'Receptionist', as resolveLokiUser_ names them in Code.gs

  // Maps the backend's role name to what the page shows for it -- the
  // Receptionist role reads as "Management" everywhere in the UI, while
  // the backend/Users sheet keeps calling it "Receptionist" so the audit
  // log stays unchanged.
  function roleDisplayName(role) {
    if (role === 'Dr Lokesh') return 'Dr.Lokesh';
    if (role === 'Receptionist') return 'Management';
    return role || '';
  }

  function unlock(passcode, role) {
    currentPasscode = passcode;
    currentRole = role || '';
    gate.hidden = true;
    app.hidden = false;
    var displayName = roleDisplayName(currentRole);
    if (lockLabel) lockLabel.textContent = (displayName || 'Dr.Lokesh/Management') + ' Logout';
    if (displayName) showSavedToast('Welcome ' + displayName, 'toast-welcome');
  }
  function lock() {
    currentPasscode = '';
    currentRole = '';
    if (lockLabel) lockLabel.textContent = 'Logout';
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

  // Resolves to { valid, role } -- role is 'Dr Lokesh' or 'Receptionist'
  // (blank when the passcode didn't match either), straight from Code.gs's
  // resolveLokiUser_ so the client never has to know the passcodes themselves.
  function verifyPasscode(passcode) {
    var params = new URLSearchParams({ action: 'lokiVerifyPasscode', passcode: passcode });
    return fetch(GOOGLE_SHEET_WEBAPP_URL + '?' + params.toString())
      .then(function (res) { return res.json(); })
      .then(function (data) { return { valid: !!data.valid, role: data.role || '' }; });
  }

  gateForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var val = passcodeInput.value.trim();
    if (!val) return;
    var submitBtn = gateForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    passcodeInput.disabled = true;
    gateStatus.textContent = '';
    gateStatus.className = 'form-status';
    gateSavingOverlay.classList.add('is-active');

    verifyPasscode(val).then(function (result) {
      if (result.valid) {
        safeSessionSet(PASSCODE_STORAGE_KEY, val);
        gateStatus.textContent = '';
        unlock(val, result.role);
      } else {
        gateStatus.textContent = 'Incorrect passcode.';
        gateStatus.className = 'form-status error';
      }
    }).catch(function () {
      gateStatus.textContent = 'Could not reach the server. Please try again.';
      gateStatus.className = 'form-status error';
    }).finally(function () {
      submitBtn.disabled = false;
      passcodeInput.disabled = false;
      gateSavingOverlay.classList.remove('is-active');
    });
  });

  lockBtn.addEventListener('click', lock);

  (function tryAutoUnlock() {
    var saved = safeSessionGet(PASSCODE_STORAGE_KEY);
    if (!saved) return;
    verifyPasscode(saved).then(function (result) {
      if (result.valid) unlock(saved, result.role);
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
    prescriptionBtn.textContent = (a.prescription || (a.prescriptionImages && a.prescriptionImages.length)) ? 'Edit Prescription' : 'Add Prescription';
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
    // Every time the section is opened, snap back to today's window --
    // don't leave it wherever a previous Earlier/Later click left off.
    if (!expanded) { apptWindowStart = startOfToday(); loadAppointments(); }
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
    // Same as Appointments -- reset to the window that includes today
    // every time this section is (re)opened.
    if (!expanded) { msgWindowStart = addDays(startOfToday(), -(WINDOW_DAYS - 1)); loadMessages(); }
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
  var photosModalMouseDownOnOverlay = false;
  photosModalOverlay.addEventListener('mousedown', function (e) {
    photosModalMouseDownOnOverlay = (e.target === photosModalOverlay);
  });
  photosModalOverlay.addEventListener('click', function (e) {
    // Only treat this as "clicked the backdrop to close" when BOTH the press
    // and the release landed on the backdrop itself -- otherwise selecting
    // text that happens to end with the mouse released over the backdrop
    // would wrongly close the modal.
    if (e.target === photosModalOverlay && photosModalMouseDownOnOverlay) closePhotosModal();
    photosModalMouseDownOnOverlay = false;
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
  var replyModalMouseDownOnOverlay = false;
  replyModalOverlay.addEventListener('mousedown', function (e) {
    replyModalMouseDownOnOverlay = (e.target === replyModalOverlay);
  });
  replyModalOverlay.addEventListener('click', function (e) {
    // Only close when both the press and the release landed on the backdrop
    // itself -- otherwise selecting reply text (e.g. dragging right-to-left)
    // that ends with the mouse released over the backdrop would wrongly
    // close the modal.
    if (e.target === replyModalOverlay && replyModalMouseDownOnOverlay) closeReplyModal();
    replyModalMouseDownOnOverlay = false;
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
  var prescriptionSavingOverlay = document.getElementById('prescriptionSavingOverlay');
  var prescriptionTextarea = document.getElementById('prescriptionTextarea');
  var prescriptionWordCount = document.getElementById('prescriptionWordCount');
  var prescriptionFormStatus = document.getElementById('prescriptionFormStatus');
  var prescriptionTargetId = null;

  var MAX_PRESCRIPTION_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB, same cap as the public site's photo uploads

  function lokiReadFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        // reader.result looks like "data:image/jpeg;base64,AAAA..." -- keep only the base64 part.
        resolve(String(reader.result).split(',')[1] || '');
      };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(file);
    });
  }

  // Replaces the old fixed 2-slot rxImageSlots model -- any number of
  // photos now, each tracked as one entry in this flat list:
  //   existing: { type:'existing', id, url, pendingRemove }   -- id is the
  //     AllImages row's own Id (handleLokiRemovePrescriptionImage_ targets
  //     it directly, independent of any other photo on this booking).
  //   pending:  { type:'pending', file, objectUrl }           -- a just
  //     picked file, not yet uploaded; discarding it needs no server call.
  var rxImageList = document.getElementById('prescriptionImageList');
  var rxImageAddInput = document.getElementById('prescriptionImageAddInput');
  var rxImageAddBtn = document.getElementById('prescriptionImageAddBtn');
  var rxImages = [];

  function rxEntryPreviewSrc(entry) {
    return entry.type === 'existing' ? entry.url : entry.objectUrl;
  }

  function rxImagesReset() {
    rxImages.forEach(function (e) { if (e.objectUrl) URL.revokeObjectURL(e.objectUrl); });
    rxImages = [];
    rxImageAddInput.value = '';
    renderRxImageList();
  }

  function rxImagesShowExisting(images) {
    rxImages.forEach(function (e) { if (e.objectUrl) URL.revokeObjectURL(e.objectUrl); });
    rxImages = (images || []).map(function (img) {
      return { type: 'existing', id: img.id, url: img.url, pendingRemove: false };
    });
    rxImageAddInput.value = '';
    renderRxImageList();
  }

  function renderRxImageList() {
    rxImageList.innerHTML = '';
    var visible = rxImages.filter(function (e) { return e.type === 'pending' || !e.pendingRemove; });
    if (!visible.length) {
      var empty = document.createElement('p');
      empty.className = 'loki-rx-image-empty';
      empty.textContent = 'No photos added yet.';
      rxImageList.appendChild(empty);
      return;
    }
    visible.forEach(function (entry) {
      var row = document.createElement('div');
      row.className = 'loki-rx-image-preview';

      var thumbLink = document.createElement('a');
      thumbLink.href = rxEntryPreviewSrc(entry) || '#';
      thumbLink.target = '_blank';
      thumbLink.rel = 'noopener';
      thumbLink.className = 'loki-rx-image-thumb';
      var img = document.createElement('img');
      img.src = rxEntryPreviewSrc(entry);
      img.alt = 'Prescription photo preview';
      thumbLink.appendChild(img);
      row.appendChild(thumbLink);

      var actions = document.createElement('div');
      actions.className = 'loki-rx-image-actions';

      var viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'loki-rx-image-view';
      viewBtn.textContent = 'View';
      viewBtn.addEventListener('click', function () {
        var src = rxEntryPreviewSrc(entry);
        if (src) openPhotosModal([src]);
      });
      actions.appendChild(viewBtn);

      var removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'loki-rx-image-remove';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', function () {
        if (entry.type === 'pending') {
          // Not yet uploaded -- just drop it, no server call needed.
          if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
          var idx = rxImages.indexOf(entry);
          if (idx !== -1) rxImages.splice(idx, 1);
        } else {
          // Already saved -- mark for removal; the actual delete happens
          // together with the rest of this modal's changes when Save
          // Prescription is clicked, same as everything else in this form.
          entry.pendingRemove = true;
        }
        renderRxImageList();
      });
      actions.appendChild(removeBtn);

      row.appendChild(actions);
      rxImageList.appendChild(row);
    });
  }

  rxImageAddBtn.addEventListener('click', function () { rxImageAddInput.click(); });
  rxImageAddInput.addEventListener('change', function () {
    var file = rxImageAddInput.files && rxImageAddInput.files[0];
    rxImageAddInput.value = ''; // allow picking the same file again later
    if (!file) return;
    if (file.size > MAX_PRESCRIPTION_IMAGE_BYTES) {
      prescriptionFormStatus.textContent = 'That photo is over 4 MB — please choose a smaller image.';
      prescriptionFormStatus.className = 'form-status error';
      return;
    }
    prescriptionFormStatus.textContent = '';
    prescriptionFormStatus.className = 'form-status';
    rxImages.push({ type: 'pending', file: file, objectUrl: URL.createObjectURL(file) });
    renderRxImageList();
  });

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
    rxImagesShowExisting(a.prescriptionImages || []);
    prescriptionFormStatus.textContent = '';
    prescriptionFormStatus.className = 'form-status';
    prescriptionModalOverlay.classList.add('is-open');
    prescriptionTextarea.focus();
  }
  function closePrescriptionModal() {
    prescriptionModalOverlay.classList.remove('is-open');
    prescriptionTargetId = null;
    rxImagesReset();
  }
  closePrescriptionModalBtn.addEventListener('click', closePrescriptionModal);
  var prescriptionModalMouseDownOnOverlay = false;
  prescriptionModalOverlay.addEventListener('mousedown', function (e) {
    prescriptionModalMouseDownOnOverlay = (e.target === prescriptionModalOverlay);
  });
  prescriptionModalOverlay.addEventListener('click', function (e) {
    // Only close when both the press and the release landed on the backdrop
    // itself -- otherwise selecting prescription-notes text (e.g. dragging
    // right-to-left) that ends with the mouse released over the backdrop
    // would wrongly close the modal.
    if (e.target === prescriptionModalOverlay && prescriptionModalMouseDownOnOverlay) closePrescriptionModal();
    prescriptionModalMouseDownOnOverlay = false;
  });

  // Uploads one pending (just-picked, not-yet-saved) photo. Resolves,
  // never rejects, so one failed photo never stops the Prescription text
  // (or any other photo) from saving -- the caller inspects .ok to report
  // it, and a failed entry is left in rxImages exactly as it was so Save
  // can simply be clicked again to retry just that photo.
  function saveRxImageAdd(bookingId, entry) {
    return lokiReadFileAsBase64(entry.file)
      .then(function (base64) {
        var fd = new FormData();
        fd.append('action', 'lokiAddPrescriptionImage');
        fd.append('passcode', currentPasscode);
        fd.append('id', bookingId);
        fd.append('imageBase64', base64);
        fd.append('imageName', entry.file.name);
        fd.append('imageMime', entry.file.type || 'image/jpeg');
        return fetch(GOOGLE_SHEET_WEBAPP_URL, { method: 'POST', body: fd });
      })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.result !== 'success') throw new Error(data.message || 'Could not save that photo.');
        return { ok: true, kind: 'add', entry: entry, id: data.imageId, url: data.url || '' };
      })
      .catch(function (err) {
        return { ok: false, kind: 'add', entry: entry, message: err && err.message ? err.message : 'Could not save that photo.' };
      });
  }

  // Removes one already-saved photo by its AllImages id. Same never-rejects
  // contract as saveRxImageAdd above.
  function saveRxImageRemove(bookingId, entry) {
    var fd = new FormData();
    fd.append('action', 'lokiRemovePrescriptionImage');
    fd.append('passcode', currentPasscode);
    fd.append('id', bookingId);
    fd.append('imageId', String(entry.id));
    return fetch(GOOGLE_SHEET_WEBAPP_URL, { method: 'POST', body: fd })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.result !== 'success') throw new Error(data.message || 'Could not remove that photo.');
        return { ok: true, kind: 'remove', entry: entry };
      })
      .catch(function (err) {
        return { ok: false, kind: 'remove', entry: entry, message: err && err.message ? err.message : 'Could not remove that photo.' };
      });
  }

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
    prescriptionSavingOverlay.classList.add('is-active');

    var targetId = prescriptionTargetId;
    var fd = new FormData();
    fd.append('action', 'lokiSaveApptStatus');
    fd.append('passcode', currentPasscode);
    fd.append('changes', JSON.stringify([{ id: targetId, prescription: text }]));

    var textSave = fetch(GOOGLE_SHEET_WEBAPP_URL, { method: 'POST', body: fd })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.result !== 'success') throw new Error(data.message || 'Could not save prescription.');
        return { ok: true };
      })
      .catch(function (err) {
        return { ok: false, message: err && err.message ? err.message : 'Could not save prescription.' };
      });

    var pendingAdds = rxImages.filter(function (e) { return e.type === 'pending'; });
    var pendingRemoves = rxImages.filter(function (e) { return e.type === 'existing' && e.pendingRemove; });
    var imageOps = pendingAdds.map(function (e) { return saveRxImageAdd(targetId, e); })
      .concat(pendingRemoves.map(function (e) { return saveRxImageRemove(targetId, e); }));

    Promise.all([textSave].concat(imageOps))
      .then(function (results) {
        var textResult = results[0];
        var imageResults = results.slice(1);
        var failures = [];
        if (!textResult.ok) failures.push(textResult.message);

        var a = appointmentsCache.filter(function (x) { return String(x.id) === String(targetId); })[0];
        if (textResult.ok && a) a.prescription = text;

        // A failed add/remove is left exactly as it was in rxImages (still
        // 'pending', or still pendingRemove) so clicking Save again retries
        // just that one photo instead of silently dropping it; a succeeded
        // add is reconciled from a locally-previewed pending entry to a
        // committed 'existing' one (now with its real AllImages id and
        // Drive URL), and a succeeded remove is actually dropped from the
        // list for the first time here (it stayed visible-as-hidden only
        // in the sense of being filtered out of renderRxImageList up to
        // this point, in case the removal needed to be retried).
        imageResults.forEach(function (r) {
          if (!r.ok) { failures.push(r.message); return; }
          if (r.kind === 'add') {
            var addIdx = rxImages.indexOf(r.entry);
            if (addIdx !== -1) {
              if (r.entry.objectUrl) URL.revokeObjectURL(r.entry.objectUrl);
              rxImages[addIdx] = { type: 'existing', id: r.id, url: r.url, pendingRemove: false };
            }
          } else if (r.kind === 'remove') {
            var removeIdx = rxImages.indexOf(r.entry);
            if (removeIdx !== -1) rxImages.splice(removeIdx, 1);
          }
        });
        renderRxImageList();
        if (a) {
          a.prescriptionImages = rxImages
            .filter(function (e) { return e.type === 'existing'; })
            .map(function (e) { return { id: e.id, url: e.url }; });
        }

        if (failures.length) {
          prescriptionFormStatus.textContent = failures.join(' ');
          prescriptionFormStatus.className = 'form-status error';
          renderAppointments();
          return;
        }

        prescriptionFormStatus.textContent = 'Prescription saved.';
        prescriptionFormStatus.className = 'form-status success';
        showSavedToast();
        renderAppointments();
        setTimeout(closePrescriptionModal, 900);
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Prescription';
        prescriptionSavingOverlay.classList.remove('is-active');
      });
  });

  /* ---------- Book/Reschedule Appointment modal ---------- */
  // Shared by both header tabs: "Book Appointment" opens it empty
  // (lokiApptFormOriginalId stays null, submits as a fresh booking);
  // "Reschedule" (from a Cancel/Reschedule search result) opens it
  // pre-filled with that patient's details and sets
  // lokiApptFormOriginalId, which switches the submit handler to the
  // admin-only lokiReschedule action instead of a plain new booking.
  var lokiApptFormModalOverlay = document.getElementById('lokiApptFormModalOverlay');
  var closeLokiApptFormModalBtn = document.getElementById('closeLokiApptFormModal');
  var lokiApptFormTitle = document.getElementById('lokiApptFormTitle');
  var lokiApptFormSub = document.getElementById('lokiApptFormSub');
  var lokiApptForm = document.getElementById('lokiApptForm');
  var lokiApptFormSavingOverlay = document.getElementById('lokiApptFormSavingOverlay');
  var lokiApptFormStatus = document.getElementById('lokiApptFormStatus');
  var lokiApptFormSubmitBtn = document.getElementById('lokiApptFormSubmitBtn');
  var lokiApptNameInput = document.getElementById('lokiApptName');
  var lokiApptPhoneInput = document.getElementById('lokiApptPhone');
  var lokiApptEmailInput = document.getElementById('lokiApptEmail');
  var lokiApptDateInput = document.getElementById('lokiApptDate');
  var lokiApptTimeSelect = document.getElementById('lokiApptTime');
  var lokiApptFormOriginalId = null;

  // Same 10 AM-2 PM / 3 PM-8 PM, 30-minute-slot schedule as the public
  // site's own Book Appointment form and reschedule.html.
  var LOKI_TIME_SLOTS = (function () {
    var pad = function (n) { return String(n).padStart(2, '0'); };
    var label = function (h, m) {
      var period = h < 12 ? 'AM' : 'PM';
      var h12 = h % 12; if (h12 === 0) h12 = 12;
      return h12 + ':' + (m === 0 ? '00' : m) + ' ' + period;
    };
    var slots = [];
    var addSlot = function (h, m) {
      var endH = m === 30 ? h + 1 : h;
      var endM = m === 30 ? 0 : 30;
      slots.push({
        start: pad(h) + ':' + pad(m),
        end: pad(endH) + ':' + pad(endM),
        label: label(h, m) + ' - ' + label(endH, endM)
      });
    };
    for (var h1 = 10; h1 < 14; h1++) { addSlot(h1, 0); addSlot(h1, 30); }
    for (var h2 = 15; h2 < 20; h2++) { addSlot(h2, 0); addSlot(h2, 30); }
    return slots;
  })();

  function lokiApptPopulateTimeSlots() {
    lokiApptTimeSelect.innerHTML = '<option value="">Select a time slot</option>' +
      LOKI_TIME_SLOTS.map(function (s) { return '<option value="' + s.start + '">' + s.label + '</option>'; }).join('');
  }

  function lokiApptRefreshSlotAvailability() {
    if (!lokiApptDateInput.value) return;
    fetch(GOOGLE_SHEET_WEBAPP_URL + '?action=availability&date=' + encodeURIComponent(lokiApptDateInput.value))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var booked = (data && data.bookedSlots) || [];
        var previousValue = lokiApptTimeSelect.value;
        Array.prototype.forEach.call(lokiApptTimeSelect.options, function (opt) {
          if (!opt.value) return;
          var slot = LOKI_TIME_SLOTS.filter(function (s) { return s.start === opt.value; })[0];
          var isBooked = booked.indexOf(opt.value) !== -1;
          opt.disabled = isBooked;
          opt.textContent = isBooked ? (slot.label + ' (Booked)') : slot.label;
        });
        if (previousValue && booked.indexOf(previousValue) !== -1) lokiApptTimeSelect.value = '';
      })
      .catch(function () {
        // Availability check is a nicety -- the server still blocks a real
        // conflict on submit even if this fails.
      });
  }

  // prefill (optional): { id, name, phone, email } from a search result --
  // present means "Reschedule this booking", absent means "Book Appointment".
  function openLokiApptFormModal(prefill) {
    lokiApptFormOriginalId = prefill ? prefill.id : null;
    lokiApptFormTitle.textContent = prefill ? 'Reschedule Appointment' : 'Book an Appointment';
    lokiApptFormSub.textContent = prefill
      ? 'Pick a new date and time for ' + (prefill.name || 'this patient') + '. The old slot is freed up automatically.'
      : 'Pick a date and time for the patient \u2014 we\u2019ll save it right away.';
    lokiApptFormSubmitBtn.textContent = prefill ? 'Confirm Reschedule' : 'Confirm Appointment';
    lokiApptFormStatus.textContent = '';
    lokiApptFormStatus.className = 'form-status';
    lokiApptNameInput.value = prefill ? (prefill.name || '') : '';
    lokiApptPhoneInput.value = prefill ? (prefill.phone || '') : '';
    lokiApptEmailInput.value = prefill ? (prefill.email || '') : '';
    lokiApptPopulateTimeSlots();
    var today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    lokiApptDateInput.min = today;
    lokiApptDateInput.value = today;
    lokiApptRefreshSlotAvailability();
    lokiApptFormModalOverlay.classList.add('is-open');
    lokiApptNameInput.focus();
  }
  function closeLokiApptFormModal() {
    lokiApptFormModalOverlay.classList.remove('is-open');
    lokiApptFormOriginalId = null;
  }
  document.getElementById('lokiBookApptTab').addEventListener('click', function () { openLokiApptFormModal(null); });
  closeLokiApptFormModalBtn.addEventListener('click', closeLokiApptFormModal);
  lokiApptDateInput.addEventListener('change', lokiApptRefreshSlotAvailability);
  var lokiApptFormMouseDownOnOverlay = false;
  lokiApptFormModalOverlay.addEventListener('mousedown', function (e) {
    lokiApptFormMouseDownOnOverlay = (e.target === lokiApptFormModalOverlay);
  });
  lokiApptFormModalOverlay.addEventListener('click', function (e) {
    if (e.target === lokiApptFormModalOverlay && lokiApptFormMouseDownOnOverlay) closeLokiApptFormModal();
    lokiApptFormMouseDownOnOverlay = false;
  });

  var LOKI_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  lokiApptForm.addEventListener('submit', function (e) {
    e.preventDefault();

    var slot = LOKI_TIME_SLOTS.filter(function (s) { return s.start === lokiApptTimeSelect.value; })[0];
    if (!slot) {
      lokiApptFormStatus.textContent = 'Please choose a booking time.';
      lokiApptFormStatus.className = 'form-status error';
      return;
    }
    var emailValue = lokiApptEmailInput.value.trim();
    lokiApptEmailInput.classList.remove('field-invalid');
    if (emailValue && !LOKI_EMAIL_PATTERN.test(emailValue)) {
      lokiApptFormStatus.textContent = 'Please enter a valid email address, or leave it blank.';
      lokiApptFormStatus.className = 'form-status error';
      lokiApptEmailInput.classList.add('field-invalid');
      lokiApptEmailInput.focus();
      return;
    }

    var isReschedule = !!lokiApptFormOriginalId;
    lokiApptFormSubmitBtn.disabled = true;
    lokiApptFormSubmitBtn.textContent = isReschedule ? 'Rescheduling\u2026' : 'Booking\u2026';
    lokiApptFormStatus.textContent = '';
    lokiApptFormStatus.className = 'form-status';
    lokiApptFormSavingOverlay.classList.add('is-active');

    var fd = new FormData();
    if (isReschedule) {
      fd.append('action', 'lokiReschedule');
      fd.append('passcode', currentPasscode);
      fd.append('originalId', lokiApptFormOriginalId);
    } else {
      fd.append('formType', 'appointment');
    }
    fd.append('name', lokiApptNameInput.value);
    fd.append('phone', lokiApptPhoneInput.value);
    fd.append('email', emailValue);
    fd.append('date', lokiApptDateInput.value);
    fd.append('timeSlotStart', slot.start);
    fd.append('timeSlotEnd', slot.end);
    fd.append('timeSlotLabel', slot.label);

    fetch(GOOGLE_SHEET_WEBAPP_URL, { method: 'POST', body: fd })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.result === 'success') {
          lokiApptFormSubmitBtn.textContent = isReschedule ? 'Rescheduled \u2713' : 'Appointment Booked \u2713';
          lokiApptFormStatus.textContent = (isReschedule ? 'Rescheduled to ' : 'Booked for ') + lokiApptDateInput.value + ', ' + slot.label + '.';
          lokiApptFormStatus.className = 'form-status success';
          showSavedToast();
          // The sheet now has a new row (and, for a reschedule, an updated
          // old row too) -- simplest way to guarantee every other view of
          // this data (the main appointment list, a re-opened search) sees
          // it is to drop the cache so the next load re-fetches for real.
          appointmentsCache = null;
          setTimeout(closeLokiApptFormModal, 1200);
        } else if (data.result === 'conflict') {
          lokiApptFormSubmitBtn.disabled = false;
          lokiApptFormSubmitBtn.textContent = isReschedule ? 'Confirm Reschedule' : 'Confirm Appointment';
          lokiApptFormStatus.textContent = data.message || 'That time slot is already booked \u2014 please choose another.';
          lokiApptFormStatus.className = 'form-status error';
          lokiApptRefreshSlotAvailability();
        } else {
          throw new Error((data && data.message) || 'Unknown error');
        }
      })
      .catch(function (err) {
        lokiApptFormSubmitBtn.disabled = false;
        lokiApptFormSubmitBtn.textContent = isReschedule ? 'Confirm Reschedule' : 'Confirm Appointment';
        lokiApptFormStatus.textContent = 'Something went wrong. ' + (err && err.message ? err.message : 'Please try again.');
        lokiApptFormStatus.className = 'form-status error';
      })
      .finally(function () {
        lokiApptFormSavingOverlay.classList.remove('is-active');
      });
  });

  /* ---------- Cancel/Reschedule Appointment search modal ---------- */
  var lokiCancelReschedModalOverlay = document.getElementById('lokiCancelReschedModalOverlay');
  var closeLokiCancelReschedModalBtn = document.getElementById('closeLokiCancelReschedModal');
  var lokiSearchNameInput = document.getElementById('lokiSearchName');
  var lokiSearchDateInput = document.getElementById('lokiSearchDate');
  var lokiSearchRegexToggle = document.getElementById('lokiSearchRegexToggle');
  var lokiSearchClearBtn = document.getElementById('lokiSearchClearBtn');
  var lokiSearchResults = document.getElementById('lokiSearchResults');

  // Same "blank/Past only" rule as the main Cancel Dates section -- an
  // already Cancelled/ReScheduled/Finished booking isn't offered Cancel
  // again here either.
  function lokiSearchCancelCandidateStatus(status) { return cancelCandidateStatus(status); }
  // Reschedule is offered more broadly (matches handleLokiReschedule_'s own
  // server-side check): anything except Finished or already-ReScheduled.
  function lokiSearchRescheduleCandidateStatus(status) {
    return status !== 'Finished' && status !== 'ReScheduled';
  }

  function buildSearchResultRow(a) {
    var row = document.createElement('div');
    row.className = 'loki-search-result' + apptRowStatusClass(a.status || '');

    var top = document.createElement('div');
    top.className = 'loki-search-result-top';

    var info = document.createElement('div');
    info.className = 'loki-search-result-info';
    var infoHtml = '<strong>' + escapeHtml(a.name || 'Unknown') + '</strong>' +
      '<span>' + escapeHtml(a.phone || '-') + '</span>' +
      '<span>' + escapeHtml(formatDateHeading(a.date)) + ' \u00b7 ' + escapeHtml(a.timeSlotLabel || '') + '</span>';
    if (a.rescheduledId) infoHtml += '<span>&rarr; Rescheduled as appointment #' + escapeHtml(String(a.rescheduledId)) + '</span>';
    info.innerHTML = infoHtml;
    top.appendChild(info);

    var statusBadge = document.createElement('span');
    statusBadge.className = 'loki-search-result-status';
    statusBadge.textContent = APPT_STATUS_LABELS[a.status || ''] || (a.status || 'Upcoming');
    top.appendChild(statusBadge);

    row.appendChild(top);

    // Change Status row -- same options/labels and the same
    // lokiSaveApptStatus backend action as the main Appointments section's
    // status dropdown, just scoped to this one row with its own Save
    // button instead of the big list's shared save bar (this modal's other
    // actions, Cancel/Reschedule, already save a single row immediately on
    // click, so a per-row Save here matches how the rest of the modal
    // behaves).
    var statusRow = document.createElement('div');
    statusRow.className = 'loki-search-status-row';

    var statusSelectWrap = document.createElement('div');
    statusSelectWrap.className = 'loki-search-status-field';
    var statusSelectLabel = document.createElement('label');
    statusSelectLabel.textContent = 'Status';
    statusSelectWrap.appendChild(statusSelectLabel);
    var searchStatusSelect = document.createElement('select');
    searchStatusSelect.className = 'loki-search-status-select';
    APPT_STATUS_VALUES.forEach(function (value) {
      var opt = document.createElement('option');
      opt.value = value;
      opt.textContent = APPT_STATUS_LABELS[value];
      searchStatusSelect.appendChild(opt);
    });
    searchStatusSelect.value = a.status || '';
    statusSelectWrap.appendChild(searchStatusSelect);
    statusRow.appendChild(statusSelectWrap);

    var reasonSelectWrap = document.createElement('div');
    reasonSelectWrap.className = 'loki-search-status-field';
    var reasonSelectLabel = document.createElement('label');
    reasonSelectLabel.textContent = 'Cancelled Reason';
    reasonSelectWrap.appendChild(reasonSelectLabel);
    var searchReasonSelect = buildReasonSelect(a.cancelledReason || '');
    reasonSelectWrap.appendChild(searchReasonSelect);
    statusRow.appendChild(reasonSelectWrap);

    var searchStatusSaveBtn = document.createElement('button');
    searchStatusSaveBtn.type = 'button';
    searchStatusSaveBtn.className = 'loki-search-status-save-btn';
    searchStatusSaveBtn.textContent = 'Save Status';
    searchStatusSaveBtn.disabled = true;
    statusRow.appendChild(searchStatusSaveBtn);

    var searchStatusMsg = document.createElement('span');
    searchStatusMsg.className = 'form-status';
    searchStatusMsg.style.width = '100%';
    statusRow.appendChild(searchStatusMsg);

    function refreshSearchStatusDirty() {
      var dirty = searchStatusSelect.value !== (a.status || '') || searchReasonSelect.value !== (a.cancelledReason || '');
      searchStatusSaveBtn.disabled = !dirty;
    }
    searchStatusSelect.addEventListener('change', refreshSearchStatusDirty);
    searchReasonSelect.addEventListener('change', refreshSearchStatusDirty);

    searchStatusSaveBtn.addEventListener('click', function () {
      searchStatusSaveBtn.disabled = true;
      searchStatusSaveBtn.textContent = 'Saving…';
      searchStatusMsg.textContent = '';
      searchStatusMsg.className = 'form-status';
      var fd = new FormData();
      fd.append('action', 'lokiSaveApptStatus');
      fd.append('passcode', currentPasscode);
      fd.append('changes', JSON.stringify([{ id: a.id, status: searchStatusSelect.value, cancelledReason: searchReasonSelect.value }]));
      fetch(GOOGLE_SHEET_WEBAPP_URL, { method: 'POST', body: fd })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data.result !== 'success') throw new Error(data.message || 'Could not save status.');
          a.status = searchStatusSelect.value;
          a.cancelledReason = searchReasonSelect.value;
          showSavedToast();
          renderAppointments();
          renderSearchResults();
        })
        .catch(function (err) {
          searchStatusSaveBtn.textContent = 'Save Status';
          refreshSearchStatusDirty();
          searchStatusMsg.textContent = err && err.message ? err.message : 'Could not save status.';
          searchStatusMsg.className = 'form-status error';
        });
    });

    row.appendChild(statusRow);

    var actions = document.createElement('div');
    actions.className = 'loki-search-result-actions';

    var cancelPanel = document.createElement('div');
    cancelPanel.className = 'loki-search-cancel-panel';
    cancelPanel.hidden = true;
    var cancelReasonSelect = buildReasonSelect('');
    cancelPanel.appendChild(cancelReasonSelect);
    var cancelConfirmBtn = document.createElement('button');
    cancelConfirmBtn.type = 'button';
    cancelConfirmBtn.className = 'loki-search-cancel-confirm-btn';
    cancelConfirmBtn.textContent = 'Confirm Cancel';
    cancelPanel.appendChild(cancelConfirmBtn);
    var cancelBackBtn = document.createElement('button');
    cancelBackBtn.type = 'button';
    cancelBackBtn.className = 'loki-search-cancel-back-btn';
    cancelBackBtn.textContent = 'Never mind';
    cancelBackBtn.addEventListener('click', function () { cancelPanel.hidden = true; });
    cancelPanel.appendChild(cancelBackBtn);
    var cancelPanelStatus = document.createElement('span');
    cancelPanelStatus.className = 'form-status error';
    cancelPanelStatus.style.width = '100%';
    cancelPanel.appendChild(cancelPanelStatus);

    if (lokiSearchCancelCandidateStatus(a.status || '')) {
      var cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'loki-search-cancel-btn';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', function () { cancelPanel.hidden = !cancelPanel.hidden; });
      actions.appendChild(cancelBtn);
    }
    if (lokiSearchRescheduleCandidateStatus(a.status || '')) {
      var reschedBtn = document.createElement('button');
      reschedBtn.type = 'button';
      reschedBtn.className = 'loki-search-reschedule-btn';
      reschedBtn.textContent = 'Reschedule';
      reschedBtn.addEventListener('click', function () {
        closeLokiCancelReschedModal();
        openLokiApptFormModal({ id: a.id, name: a.name, phone: a.phone, email: a.email });
      });
      actions.appendChild(reschedBtn);
    }

    row.appendChild(actions);
    row.appendChild(cancelPanel);

    cancelConfirmBtn.addEventListener('click', function () {
      cancelConfirmBtn.disabled = true;
      cancelConfirmBtn.textContent = 'Cancelling\u2026';
      var fd = new FormData();
      fd.append('action', 'lokiSaveApptStatus');
      fd.append('passcode', currentPasscode);
      fd.append('changes', JSON.stringify([{ id: a.id, status: 'Cancelled', cancelledReason: cancelReasonSelect.value }]));
      fetch(GOOGLE_SHEET_WEBAPP_URL, { method: 'POST', body: fd })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data.result !== 'success') throw new Error(data.message || 'Could not cancel.');
          a.status = 'Cancelled';
          a.cancelledReason = cancelReasonSelect.value;
          showSavedToast();
          renderAppointments();
          renderSearchResults();
        })
        .catch(function (err) {
          cancelConfirmBtn.disabled = false;
          cancelConfirmBtn.textContent = 'Confirm Cancel';
          cancelPanelStatus.textContent = err && err.message ? err.message : 'Could not cancel that appointment.';
        });
    });

    return row;
  }

  function renderSearchResults() {
    var nameQueryRaw = lokiSearchNameInput.value.trim();
    var nameQuery = nameQueryRaw.toLowerCase();
    var dateQuery = lokiSearchDateInput.value;
    var useRegex = !!(lokiSearchRegexToggle && lokiSearchRegexToggle.checked);
    lokiSearchResults.innerHTML = '';

    if (!nameQueryRaw && !dateQuery) {
      var prompt = document.createElement('p');
      prompt.className = 'loki-empty';
      prompt.textContent = 'Type a name or pick a date to search.';
      lokiSearchResults.appendChild(prompt);
      return;
    }

    // "Use regular expression" lets Dr Lokesh/Management search by a
    // pattern (e.g. "^sh" or "sharma|verma") instead of a plain substring.
    // An invalid pattern (unbalanced brackets, etc.) must not crash the
    // whole modal -- it's reported in place of results instead.
    var nameRegex = null;
    if (useRegex && nameQueryRaw) {
      try {
        nameRegex = new RegExp(nameQueryRaw, 'i');
      } catch (regexErr) {
        var regexErrP = document.createElement('p');
        regexErrP.className = 'form-status error';
        regexErrP.textContent = 'Invalid regular expression: ' + (regexErr && regexErr.message ? regexErr.message : regexErr);
        lokiSearchResults.appendChild(regexErrP);
        return;
      }
    }

    var matches = (appointmentsCache || []).filter(function (a) {
      if (nameQueryRaw) {
        var nm = a.name || '';
        if (nameRegex) {
          if (!nameRegex.test(nm)) return false;
        } else if (nm.toLowerCase().indexOf(nameQuery) === -1) {
          return false;
        }
      }
      if (dateQuery && a.date !== dateQuery) return false;
      return true;
    }).sort(function (x, y) {
      if (x.date !== y.date) return x.date < y.date ? -1 : 1;
      return (x.startTime || '').localeCompare(y.startTime || '');
    });

    if (!matches.length) {
      var empty = document.createElement('p');
      empty.className = 'loki-empty';
      empty.textContent = 'No matching appointments found.';
      lokiSearchResults.appendChild(empty);
      return;
    }

    matches.forEach(function (a) { lokiSearchResults.appendChild(buildSearchResultRow(a)); });
  }

  function openLokiCancelReschedModal() {
    lokiSearchNameInput.value = '';
    lokiSearchDateInput.value = '';
    if (lokiSearchRegexToggle) lokiSearchRegexToggle.checked = false;
    lokiCancelReschedModalOverlay.classList.add('is-open');
    // Plain loading message, not setLoadingStatus() -- that helper
    // overwrites el.className (it's built for a one-line <p class="form-status">
    // status area), which would clobber lokiSearchResults' own
    // .loki-search-results layout class.
    lokiSearchResults.innerHTML = '';
    var loadingP = document.createElement('p');
    loadingP.className = 'loki-empty';
    loadingP.textContent = 'Loading appointments\u2026';
    lokiSearchResults.appendChild(loadingP);
    ensureAppointmentsLoaded(function () {
      renderSearchResults();
    }, function (err) {
      lokiSearchResults.innerHTML = '';
      var errP = document.createElement('p');
      errP.className = 'form-status error';
      errP.textContent = 'Could not load appointments. ' + (err && err.message ? err.message : '');
      lokiSearchResults.appendChild(errP);
    });
  }
  function closeLokiCancelReschedModal() {
    lokiCancelReschedModalOverlay.classList.remove('is-open');
  }
  document.getElementById('lokiCancelReschedTab').addEventListener('click', openLokiCancelReschedModal);
  closeLokiCancelReschedModalBtn.addEventListener('click', closeLokiCancelReschedModal);
  lokiSearchNameInput.addEventListener('input', renderSearchResults);
  lokiSearchDateInput.addEventListener('change', renderSearchResults);
  if (lokiSearchRegexToggle) lokiSearchRegexToggle.addEventListener('change', renderSearchResults);
  lokiSearchClearBtn.addEventListener('click', function () {
    lokiSearchNameInput.value = '';
    lokiSearchDateInput.value = '';
    if (lokiSearchRegexToggle) lokiSearchRegexToggle.checked = false;
    renderSearchResults();
  });
  var lokiCancelReschedMouseDownOnOverlay = false;
  lokiCancelReschedModalOverlay.addEventListener('mousedown', function (e) {
    lokiCancelReschedMouseDownOnOverlay = (e.target === lokiCancelReschedModalOverlay);
  });
  lokiCancelReschedModalOverlay.addEventListener('click', function (e) {
    if (e.target === lokiCancelReschedModalOverlay && lokiCancelReschedMouseDownOnOverlay) closeLokiCancelReschedModal();
    lokiCancelReschedMouseDownOnOverlay = false;
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
