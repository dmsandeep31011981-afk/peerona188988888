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

  // Phone/tablet check used to decide whether to show the "Take Photo"
  // camera-capture button on the Prescription form -- desktop browsers
  // ignore the capture attribute anyway, so showing it there would just be
  // a second, confusing copy of the regular file picker.
  function isMobileOrTabletDevice() {
    var ua = (navigator.userAgent || navigator.vendor || '') + '';
    if (/Mobi|Android|iPhone|iPad|iPod|Tablet|Silk|Kindle|PlayBook/i.test(ua)) return true;
    // iPadOS 13+ reports its UA as a plain desktop Mac, so fall back to a
    // touch-capability check for that case.
    if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true;
    try {
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0) return true;
    } catch (e) { /* matchMedia not available -- ignore */ }
    return false;
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
    refresh: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
    'move-vertical': '<svg viewBox="0 0 24 24"><path d="M12 3v18"/><path d="M8 7l4-4 4 4"/><path d="M8 17l4 4 4-4"/></svg>',
    history: '<svg viewBox="0 0 24 24"><path d="M12 8v4l3 2"/><circle cx="12" cy="12" r="9"/><path d="M3 7v4h4"/><path d="M3.5 11A8.5 8.5 0 1 1 5 16"/></svg>'
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
  var apptSortSelect = document.getElementById('apptSortSelect');
  var apptSortOrderSelect = document.getElementById('apptSortOrderSelect');
  var apptSaveBar = document.getElementById('apptSaveBar');
  var apptSaveCount = document.getElementById('apptSaveCount');
  var apptSaveBtn = document.getElementById('apptSaveBtn');
  var apptSavingOverlay = document.getElementById('apptSavingOverlay');

  var appointmentsCache = null; // array, fetched once per unlock (or forced refresh)
  var apptWindowStart = startOfToday(); // appointments default forward: today .. +6
  var apptSortBy = 'date'; // 'date' (grouped, default) | 'name' | 'status' -- see renderAppointments
  var apptSortOrder = 'asc'; // 'asc' (default) | 'desc' -- see renderAppointments
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

    // ReScheduled rows are left out of this list entirely -- each one is
    // just the old half of a booking that's already been moved to a new
    // row elsewhere (via the usual Reschedule action, or a Push Up/Push
    // Down in the Insert/Delete/Push up/Push down tab), so it only ever
    // cluttered this view with a dead entry pointing at the real, active
    // booking. It's still fully in the sheet and the audit log, and still
    // shows up in the Cancel/Reschedule search modal's results if someone
    // specifically searches for it.
    var inWindow = (appointmentsCache || []).filter(function (a) {
      if ((a.status || '') === 'ReScheduled') return false;
      var d = parseDateStr(a.date);
      return d >= apptWindowStart && d <= windowEnd;
    });

    apptList.innerHTML = '';

    if (!inWindow.length) {
      var empty = document.createElement('p');
      empty.className = 'loki-empty';
      empty.textContent = 'No appointments in this range.';
      apptList.appendChild(empty);
      return;
    }

    var orderSign = apptSortOrder === 'desc' ? -1 : 1;

    if (apptSortBy === 'name' || apptSortBy === 'status') {
      // Flat list (no date-group headers to lean on), so each row shows
      // its own date alongside the time -- see buildApptRow's showDate.
      var sorted = inWindow.slice().sort(function (a, b) {
        if (apptSortBy === 'name') {
          return orderSign * (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
        }
        var sa = APPT_STATUS_LABELS[a.status || ''] || (a.status || '');
        var sb = APPT_STATUS_LABELS[b.status || ''] || (b.status || '');
        if (sa !== sb) return orderSign * sa.localeCompare(sb);
        // Same status -- keep it readable with date/time as the tiebreaker
        // (always chronological, regardless of the Ascending/Descending
        // choice, which applies to the primary sort field only).
        return (a.date + a.startTime).localeCompare(b.date + b.startTime);
      });
      sorted.forEach(function (a) { apptList.appendChild(buildApptRow(a, { showDate: true })); });
      return;
    }

    // Default: group by date (as before), sorted by time within each day.
    // Ascending/Descending flips which day comes first; times within a day
    // always run in natural (earliest-first) order.
    var byDate = {};
    inWindow.forEach(function (a) { (byDate[a.date] = byDate[a.date] || []).push(a); });
    var dateKeys = Object.keys(byDate).sort();
    if (apptSortOrder === 'desc') dateKeys.reverse();

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

  // Shared by buildApptRow (main Appointment Section) and
  // buildSearchResultRow (Cancel/Reschedule search modal) -- a ReScheduled
  // booking used to just show "Rescheduled as appointment #N" as plain
  // text; this turns it into a button that jumps straight to that other
  // booking's own row (opening/using the Cancel/Reschedule search modal,
  // the one place a single booking's full details -- time, status,
  // prescription photos, Cancel/Reschedule actions -- are all shown
  // together) instead of leaving the doctor to go search for it by hand.
  function buildRescheduledLink(targetId) {
    var link = document.createElement('button');
    link.type = 'button';
    link.className = 'appt-row-rescheduled-link';
    link.textContent = '\u2192 View Rescheduled Booking';
    link.addEventListener('click', function (e) {
      e.stopPropagation();
      openLokiCancelReschedModalForId(targetId);
    });
    return link;
  }

  function buildApptRow(a, opts) {
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
    info.innerHTML = infoHtml;
    if (a.rescheduledId) info.appendChild(buildRescheduledLink(a.rescheduledId));
    row.appendChild(info);

    var time = document.createElement('div');
    time.className = 'appt-row-time';
    // When this row is shown in a flat, non-date-grouped list (sorted by
    // Name or Status), there's no date-group heading to lean on, so fold
    // the date into this row too -- same "<date> · <time>" shape already
    // used for a row's date/time in the Cancel/Reschedule search results.
    time.textContent = (opts && opts.showDate)
      ? formatDateHeading(a.date) + ' · ' + (a.timeSlotLabel || '')
      : (a.timeSlotLabel || '');
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
    // Small per-row Save button -- only shown once this row actually has a
    // pending edit, so the doctor can save right from the row they just
    // changed instead of having to find the Save Changes bar. It triggers
    // the exact same save as that bar (every pending change, not just this
    // row's), via the shared triggerApptSave() below.
    var rowSaveBtn = document.createElement('button');
    rowSaveBtn.type = 'button';
    rowSaveBtn.className = 'appt-row-save-btn';
    rowSaveBtn.textContent = 'Save';
    rowSaveBtn.hidden = !Object.prototype.hasOwnProperty.call(apptChanges, a.id);
    rowSaveBtn.addEventListener('click', function () { triggerApptSave(); });

    statusSelect.value = displayStatus;
    statusSelect.addEventListener('change', function () {
      row.className = 'appt-row' + apptRowStatusClass(statusSelect.value);
      setApptChangeField(a.id, 'status', statusSelect.value, a.status || '');
      updateApptSaveBar();
      rowSaveBtn.hidden = !Object.prototype.hasOwnProperty.call(apptChanges, a.id);
      // The Finished -> offer-the-prescription prompt fires from the Save
      // Changes button instead of here -- see apptSaveBtn's click handler
      // below -- so it only appears once the change is actually about to
      // be persisted, not on every dropdown selection.
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
      rowSaveBtn.hidden = !Object.prototype.hasOwnProperty.call(apptChanges, a.id);
    });
    reasonWrap.appendChild(reasonSelect);
    controls.appendChild(reasonWrap);

    controls.appendChild(rowSaveBtn);

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
    // Belt-and-braces alongside the hide-when-empty above: with no pending
    // changes the button itself is disabled too, not just out of view.
    apptSaveBtn.disabled = keys.length === 0;
  }

  // Disables/re-enables the bottom Save Changes button together with every
  // currently-visible per-row Save button (there can be several, one per
  // edited row), so a click on any one of them can't be double-fired while
  // a save triggered from any other one is already in flight.
  function setApptSaveButtonsBusy(busy) {
    apptSaveBtn.disabled = busy;
    apptSaveBtn.textContent = busy ? 'Saving…' : 'Save Changes';
    Array.prototype.forEach.call(document.querySelectorAll('.appt-row-save-btn'), function (btn) {
      btn.disabled = busy;
    });
  }

  // The actual network save -- pulled out of the click handler so the
  // Finished -> prescription prompt can run first and only call this once
  // the doctor is done with the prescription modal (or call it straight
  // away, unchanged, when nothing in this batch needs that prompt).
  function performApptSave(changesPayload) {
    setApptSaveButtonsBusy(true);
    apptSavingOverlay.classList.add('is-active');

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
        setApptSaveButtonsBusy(false);
        // Re-sync the bottom button's disabled state with however many
        // changes are actually still pending -- none left after a success
        // (already zeroed above), whatever was left as-is after an error.
        updateApptSaveBar();
        apptSavingOverlay.classList.remove('is-active');
      });
  }

  // Shared by the bottom Save Changes button and every row's own small Save
  // button -- either one saves the full set of pending changes, not just
  // the row that was clicked from.
  function triggerApptSave() {
    var keys = Object.keys(apptChanges);
    if (!keys.length) return;

    var changesPayload = keys.map(function (id) {
      var entry = apptChanges[id];
      var payload = { id: id };
      if (Object.prototype.hasOwnProperty.call(entry, 'status')) payload.status = entry.status;
      if (Object.prototype.hasOwnProperty.call(entry, 'cancelledReason')) payload.cancelledReason = entry.cancelledReason;
      return payload;
    });

    // Anything in this batch newly being set to Finished (not already
    // Finished before this edit) gets offered the prescription modal
    // first, on top of whatever's currently open -- the actual save only
    // goes to the server once every such prompt has been closed, so
    // "Finished" isn't persisted until the doctor's had the chance to add
    // the prescription that goes with it.
    var newlyFinishedIds = changesPayload
      .filter(function (c) {
        if (!Object.prototype.hasOwnProperty.call(c, 'status') || c.status !== 'Finished') return false;
        var a = appointmentsCache.filter(function (x) { return String(x.id) === String(c.id); })[0];
        return a && (a.status || '') !== 'Finished';
      })
      .map(function (c) { return c.id; });

    setApptSaveButtonsBusy(true); // guard against a double-click (from either button) while a prescription prompt is up

    if (newlyFinishedIds.length) {
      promptPrescriptionsForIdsThen(newlyFinishedIds, function () { performApptSave(changesPayload); });
    } else {
      performApptSave(changesPayload);
    }
  }

  apptSaveBtn.addEventListener('click', triggerApptSave);

  apptToggle.addEventListener('click', function () {
    var expanded = apptToggle.getAttribute('aria-expanded') === 'true';
    apptToggle.setAttribute('aria-expanded', String(!expanded));
    apptBody.hidden = expanded;
    // Every time the section is opened, snap back to today's window --
    // don't leave it wherever a previous Earlier/Later click left off.
    if (!expanded) { apptWindowStart = startOfToday(); loadAppointments(); }
  });
  // Earlier/Today/Later/Refresh all load a different (or refreshed) set of
  // appointments, so any Sort by/Order the doctor had picked for the old
  // list is reset back to the default (grouped by Date, Ascending) rather
  // than silently carrying over to data it was never chosen for.
  function resetApptSort() {
    apptSortBy = 'date';
    apptSortOrder = 'asc';
    apptSortSelect.value = 'date';
    apptSortOrderSelect.value = 'asc';
  }
  apptPrevBtn.addEventListener('click', function () { apptWindowStart = addDays(apptWindowStart, -WINDOW_DAYS); resetApptSort(); reloadAppointments(); });
  apptNextBtn.addEventListener('click', function () { apptWindowStart = addDays(apptWindowStart, WINDOW_DAYS); resetApptSort(); reloadAppointments(); });
  apptTodayBtn.addEventListener('click', function () { apptWindowStart = startOfToday(); resetApptSort(); reloadAppointments(); });
  apptRefreshBtn.addEventListener('click', function () { resetApptSort(); startRefreshSpin(apptRefreshBtn); reloadAppointments(apptRefreshBtn); });
  // Just re-orders what's already loaded for the current date window --
  // no need to go back to the server for this.
  apptSortSelect.addEventListener('change', function () {
    apptSortBy = apptSortSelect.value;
    renderAppointments();
  });
  apptSortOrderSelect.addEventListener('change', function () {
    apptSortOrder = apptSortOrderSelect.value;
    renderAppointments();
  });

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
  var msgSortSelect = document.getElementById('msgSortSelect');
  var msgSortOrderSelect = document.getElementById('msgSortOrderSelect');

  var messagesCache = null;
  // Messages are historical (received in the past), so default to a
  // trailing window ending today, rather than looking forward like
  // appointments do.
  var msgWindowStart = addDays(startOfToday(), -(WINDOW_DAYS - 1));
  var msgSortBy = 'date'; // 'date' (grouped, default) | 'name' | 'status' -- see renderMessages
  var msgSortOrder = 'asc'; // 'asc' (default) | 'desc' -- see renderMessages

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

    var inWindow = [];
    (messagesCache || []).forEach(function (m) {
      var dateKey = istDateKeyFromIso(m.timestamp);
      if (!dateKey) return;
      var d = parseDateStr(dateKey);
      if (d < msgWindowStart || d > windowEnd) return;
      inWindow.push({ m: m, dateKey: dateKey });
    });

    msgList.innerHTML = '';

    if (!inWindow.length) {
      var empty = document.createElement('p');
      empty.className = 'loki-empty';
      empty.textContent = 'No messages in this range.';
      msgList.appendChild(empty);
      return;
    }

    var orderSign = msgSortOrder === 'desc' ? -1 : 1;

    if (msgSortBy === 'name' || msgSortBy === 'status') {
      // Flat list -- no date-group headers here, so each card shows its
      // own date alongside the time (see buildMsgCard's showDate).
      var sorted = inWindow.slice().sort(function (x, y) {
        if (msgSortBy === 'name') {
          return orderSign * (x.m.name || '').localeCompare(y.m.name || '', undefined, { sensitivity: 'base' });
        }
        // "Status" for a message = whether it's been replied to yet.
        var sx = x.m.inlineReply ? 'Replied' : 'Not Replied';
        var sy = y.m.inlineReply ? 'Replied' : 'Not Replied';
        if (sx !== sy) return orderSign * sx.localeCompare(sy);
        // Same status -- keep it readable with date/time as the tiebreaker
        // (always chronological, regardless of the Ascending/Descending
        // choice, which applies to the primary sort field only).
        return (x.dateKey + x.m.timestamp).localeCompare(y.dateKey + y.m.timestamp);
      });
      sorted.forEach(function (x) { msgList.appendChild(buildMsgCard(x.m, { showDate: true, dateKey: x.dateKey })); });
      return;
    }

    // Default: group by date (as before), sorted by time within each day.
    // Ascending/Descending flips which day comes first; times within a day
    // always run in natural (earliest-first) order.
    var byDate = {};
    inWindow.forEach(function (x) { (byDate[x.dateKey] = byDate[x.dateKey] || []).push(x.m); });
    var dateKeys = Object.keys(byDate).sort();
    if (msgSortOrder === 'desc') dateKeys.reverse();

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

  function buildMsgCard(m, opts) {
    var card = document.createElement('div');
    card.className = 'msg-card';

    var head = document.createElement('div');
    head.className = 'msg-card-head';
    var whenLabel = (opts && opts.showDate)
      ? formatDateHeading(opts.dateKey) + ' · ' + formatIstTime(m.timestamp)
      : formatIstTime(m.timestamp);
    head.innerHTML =
      '<strong>' + escapeHtml(m.name || 'Unknown') + ' &middot; ' + escapeHtml(m.phone || '-') + '</strong>' +
      '<span>' + escapeHtml(whenLabel) + '</span>';
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
      photosBtn.textContent = '📷 View All Photos (' + m.images.length + ')';
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
  // Same reasoning as resetApptSort() -- a new/refreshed window of messages
  // shouldn't silently keep whatever Sort by/Order was picked before.
  function resetMsgSort() {
    msgSortBy = 'date';
    msgSortOrder = 'asc';
    msgSortSelect.value = 'date';
    msgSortOrderSelect.value = 'asc';
  }
  msgPrevBtn.addEventListener('click', function () { msgWindowStart = addDays(msgWindowStart, -WINDOW_DAYS); resetMsgSort(); reloadMessages(); });
  msgNextBtn.addEventListener('click', function () { msgWindowStart = addDays(msgWindowStart, WINDOW_DAYS); resetMsgSort(); reloadMessages(); });
  msgTodayBtn.addEventListener('click', function () { msgWindowStart = addDays(startOfToday(), -(WINDOW_DAYS - 1)); resetMsgSort(); reloadMessages(); });
  msgRefreshBtn.addEventListener('click', function () { resetMsgSort(); startRefreshSpin(msgRefreshBtn); reloadMessages(msgRefreshBtn); });
  msgSortOrderSelect.addEventListener('change', function () {
    msgSortOrder = msgSortOrderSelect.value;
    renderMessages();
  });
  msgSortSelect.addEventListener('change', function () {
    msgSortBy = msgSortSelect.value;
    renderMessages();
  });

  /* ---------- Photos modal ---------- */
  var photosModalOverlay = document.getElementById('photosModalOverlay');
  var closePhotosModalBtn = document.getElementById('closePhotosModal');
  var photosScroll = document.getElementById('photosScroll');
  var photosModalSub = document.getElementById('photosModalSub');

  // images: array of plain URL strings (Messages: m.images) or
  // {id, url} objects (Appointments: a.prescriptionImages) -- either
  // shape works. subtitle/emptyText let callers other than Messages
  // (e.g. a Finished appointment's prescription photos) show their own
  // wording instead of the Messages-specific defaults.
  function openPhotosModal(images, subtitle, emptyText) {
    if (photosModalSub) photosModalSub.textContent = subtitle || 'Uploaded with this message.';
    photosScroll.innerHTML = '';
    if (!images || !images.length) {
      var empty = document.createElement('p');
      empty.className = 'loki-photos-empty';
      empty.textContent = emptyText || 'No photos were uploaded with this message.';
      photosScroll.appendChild(empty);
    } else {
      images.forEach(function (entry) {
        var url = typeof entry === 'string' ? entry : (entry && entry.url);
        if (!url) return;
        // Plain strings (Messages' m.images) and any object without an
        // explicit isImage are treated as photos, same as always -- only
        // Prescription attachments carry isImage:false, for a PDF/Word/
        // Excel/PowerPoint file that can't be shown as an <img>.
        var isImage = typeof entry === 'string' ? true : (entry && entry.isImage !== false);
        var name = typeof entry === 'string' ? '' : (entry && entry.name) || '';

        if (!isImage) {
          var fileWrap = document.createElement('div');
          fileWrap.className = 'loki-photo-wrap loki-file-wrap';
          var fileLink = document.createElement('a');
          fileLink.href = url;
          fileLink.target = '_blank';
          fileLink.rel = 'noopener';
          fileLink.className = 'loki-file-card';
          var fileIcon = document.createElement('span');
          fileIcon.className = 'loki-file-icon';
          fileIcon.textContent = '📄';
          var fileName = document.createElement('span');
          fileName.className = 'loki-file-name';
          fileName.textContent = name || 'Open file';
          var fileHint = document.createElement('span');
          fileHint.className = 'loki-file-open-hint';
          fileHint.textContent = 'Click to open';
          fileLink.appendChild(fileIcon);
          fileLink.appendChild(fileName);
          fileLink.appendChild(fileHint);
          fileWrap.appendChild(fileLink);
          photosScroll.appendChild(fileWrap);
          return;
        }

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
  // When the "mark Finished -> offer the prescription" flow opens this
  // modal on someone's behalf (see apptSaveBtn / searchStatusSaveBtn), it
  // registers the actual deferred save here so closePrescriptionModal can
  // fire it once the doctor is done -- covers every way the modal can
  // close (Save Prescription's own auto-close, the X button, or clicking
  // the backdrop) without duplicating that logic in each place.
  var prescriptionModalCloseCallback = null;

  var MAX_PRESCRIPTION_FILE_BYTES = 8 * 1024 * 1024; // 8 MB -- admin-only upload, so a bit more headroom than the public site's 4 MB photo cap (scanned PDF reports run larger than phone photos)

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
  var prescriptionViewAllBtn = document.getElementById('prescriptionViewAllBtn');
  var rxImages = [];

  function rxEntryPreviewSrc(entry) {
    return entry.type === 'existing' ? entry.url : entry.objectUrl;
  }
  // Whether this entry is an image (gets a real thumbnail + the photo
  // lightbox) or some other file type like a PDF/Word/Excel/PowerPoint
  // doc (gets a file-icon row + opens via a plain link instead). A
  // pending (just-picked, not yet uploaded) entry reads this straight off
  // the File object; an existing (already-saved) entry carries it back
  // from the server (see handleLokiAddPrescriptionImage_ / getAppointmentsForLoki_
  // in Code.gs) since the File object no longer exists by then.
  function rxEntryIsImage(entry) {
    if (entry.type === 'pending') return (entry.file.type || '').indexOf('image/') === 0;
    return entry.isImage !== false;
  }
  function rxEntryName(entry) {
    if (entry.type === 'pending') return entry.file.name || 'File';
    return entry.name || 'File';
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
      return { type: 'existing', id: img.id, url: img.url, name: img.name || '', isImage: img.isImage !== false, pendingRemove: false };
    });
    rxImageAddInput.value = '';
    renderRxImageList();
  }

  function renderRxImageList() {
    rxImageList.innerHTML = '';
    var visible = rxImages.filter(function (e) { return e.type === 'pending' || !e.pendingRemove; });

    // "View All" only makes sense once something's actually been added --
    // hide it the rest of the time rather than opening an empty gallery.
    if (prescriptionViewAllBtn) {
      prescriptionViewAllBtn.hidden = !visible.length;
      prescriptionViewAllBtn.textContent = '👁 View All (' + visible.length + ')';
    }

    if (!visible.length) {
      var empty = document.createElement('p');
      empty.className = 'loki-rx-image-empty';
      empty.textContent = 'No photos or files added yet.';
      rxImageList.appendChild(empty);
      return;
    }
    visible.forEach(function (entry) {
      var row = document.createElement('div');
      row.className = 'loki-rx-image-preview';
      var isImage = rxEntryIsImage(entry);

      var thumbLink = document.createElement('a');
      thumbLink.href = rxEntryPreviewSrc(entry) || '#';
      thumbLink.target = '_blank';
      thumbLink.rel = 'noopener';
      thumbLink.className = 'loki-rx-image-thumb';
      if (isImage) {
        var img = document.createElement('img');
        img.src = rxEntryPreviewSrc(entry);
        img.alt = 'Prescription photo preview';
        thumbLink.appendChild(img);
      } else {
        // Not a photo -- a PDF/Word/Excel/PowerPoint file. Nothing to
        // thumbnail, so show a plain file icon with its extension instead
        // of a broken <img>.
        thumbLink.classList.add('loki-rx-file-thumb');
        var ext = (rxEntryName(entry).split('.').pop() || 'FILE').slice(0, 4).toUpperCase();
        var icon = document.createElement('span');
        icon.className = 'loki-rx-file-icon';
        icon.innerHTML = '📄<small>' + ext + '</small>';
        thumbLink.appendChild(icon);
      }
      row.appendChild(thumbLink);

      if (!isImage) {
        var nameEl = document.createElement('span');
        nameEl.className = 'loki-rx-image-name';
        nameEl.textContent = rxEntryName(entry);
        row.appendChild(nameEl);
      }

      var actions = document.createElement('div');
      actions.className = 'loki-rx-image-actions';

      var viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'loki-rx-image-view';
      viewBtn.textContent = 'View';
      viewBtn.addEventListener('click', function () {
        var src = rxEntryPreviewSrc(entry);
        if (src) openPhotosModal([{ url: src, name: rxEntryName(entry), isImage: isImage }]);
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

  // Shared by the regular file picker and the camera-capture input below --
  // same size check and same push into the pending-files list either way.
  function handleRxFilePicked(file) {
    if (!file) return;
    if (file.size > MAX_PRESCRIPTION_FILE_BYTES) {
      prescriptionFormStatus.textContent = 'That file is over 8 MB — please choose a smaller file.';
      prescriptionFormStatus.className = 'form-status error';
      return;
    }
    prescriptionFormStatus.textContent = '';
    prescriptionFormStatus.className = 'form-status';
    rxImages.push({ type: 'pending', file: file, objectUrl: URL.createObjectURL(file) });
    renderRxImageList();
  }

  rxImageAddBtn.addEventListener('click', function () { rxImageAddInput.click(); });
  rxImageAddInput.addEventListener('change', function () {
    var file = rxImageAddInput.files && rxImageAddInput.files[0];
    rxImageAddInput.value = ''; // allow picking the same file again later
    handleRxFilePicked(file);
  });

  // "Take Photo" -- a second input with capture="environment" so mobile
  // and tablet browsers open the camera directly instead of the regular
  // file/gallery picker. Desktop browsers ignore the capture attribute
  // (it would just behave like a second, redundant file picker there), so
  // the button itself is only shown on touch devices -- see
  // isMobileOrTabletDevice() near the top of this file.
  var rxCameraBtn = document.getElementById('prescriptionCameraBtn');
  var rxCameraInput = document.getElementById('prescriptionCameraInput');
  if (rxCameraBtn && rxCameraInput) {
    rxCameraBtn.hidden = !isMobileOrTabletDevice();
    rxCameraBtn.addEventListener('click', function () { rxCameraInput.click(); });
    rxCameraInput.addEventListener('change', function () {
      var file = rxCameraInput.files && rxCameraInput.files[0];
      rxCameraInput.value = '';
      handleRxFilePicked(file);
    });
  }

  // Opens every current photo/file (saved + just-picked, minus anything
  // marked for removal) together in the same scrollable gallery used
  // elsewhere in this page, instead of having to View them one at a time.
  prescriptionViewAllBtn.addEventListener('click', function () {
    var visible = rxImages.filter(function (e) { return e.type === 'pending' || !e.pendingRemove; });
    var items = visible.map(function (entry) {
      return { url: rxEntryPreviewSrc(entry), name: rxEntryName(entry), isImage: rxEntryIsImage(entry) };
    });
    openPhotosModal(items, 'Prescription photos & files', 'No photos or files added yet.');
  });

  function updatePrescriptionWordCount() {
    var n = countWords(prescriptionTextarea.value);
    prescriptionWordCount.textContent = n + ' / ' + MAX_PRESCRIPTION_WORDS + ' words';
    prescriptionWordCount.classList.toggle('over-limit', n > MAX_PRESCRIPTION_WORDS);
  }
  prescriptionTextarea.addEventListener('input', updatePrescriptionWordCount);

  // Shared by the main Appointments list and the Cancel/Reschedule search
  // modal: shows the Prescription modal, in turn, for each appointment id
  // that's about to become Finished, then calls afterAll() once the last
  // one has been closed. Almost always a queue of one -- the "several at
  // once" case only comes up if the main list's shared Save Changes bar
  // has more than one row staged to Finished at the same time.
  function promptPrescriptionsForIdsThen(ids, afterAll) {
    var queue = ids.slice();
    function next() {
      if (!queue.length) { afterAll(); return; }
      var id = queue.shift();
      var a = appointmentsCache && appointmentsCache.filter(function (x) { return String(x.id) === String(id); })[0];
      if (!a) { next(); return; }
      prescriptionModalCloseCallback = next;
      openPrescriptionModal(a);
    }
    next();
  }

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
    if (prescriptionModalCloseCallback) {
      var runAfterClose = prescriptionModalCloseCallback;
      prescriptionModalCloseCallback = null;
      runAfterClose();
    }
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
        if (data.result !== 'success') throw new Error(data.message || 'Could not save that file.');
        return { ok: true, kind: 'add', entry: entry, id: data.imageId, url: data.url || '', name: data.name || '', isImage: data.isImage !== false };
      })
      .catch(function (err) {
        return { ok: false, kind: 'add', entry: entry, message: err && err.message ? err.message : 'Could not save that file.' };
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
              rxImages[addIdx] = { type: 'existing', id: r.id, url: r.url, name: r.name, isImage: r.isImage, pendingRemove: false };
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
            .map(function (e) { return { id: e.id, url: e.url, name: e.name || '', isImage: e.isImage !== false }; });
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
  // Set from prefill.fromReorder by openLokiApptFormModal itself (never by
  // the caller directly) -- true only while this modal is open because the
  // Insert/Delete/Push up/Push down tab's "Insert Booking Below" button
  // opened it. Read by this form's own submit handler below to know
  // whether a successful NEW booking should also refresh the reorder
  // tool's list and get folded into its "dates touched this session" set
  // (see lokiApptForm's submit listener, and reorderTouchedDates further
  // down). Re-set on every open, so it can never leak true into an
  // unrelated booking made from the main "Book Appointment" tab or the
  // search modal's Reschedule button.
  var lokiApptFormOpenedFromReorder = false;

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
    // Baseline reset point, run on every open -- see lokiApptFormTimeLocked's
    // own comment for who sets this back to true.
    lokiApptTimeSelect.disabled = false;
  }

  // True only while the time slot select is deliberately locked to a
  // single, auto-picked value -- set by openLokiApptFormModal when
  // prefill.timeSlotStart names a real slot (currently only the
  // Insert/Delete/Push up/Push down tab's "Insert Booking Below" does
  // this), cleared the moment that slot turns out to be unavailable after
  // all (see lokiApptRefreshSlotAvailability below) so the admin is never
  // left stuck on a disabled, blank select with no way to pick anything.
  var lokiApptFormTimeLocked = false;

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
        if (previousValue && booked.indexOf(previousValue) !== -1) {
          lokiApptTimeSelect.value = '';
          if (lokiApptFormTimeLocked) {
            // The auto-picked "right after this booking" slot (see
            // insertBtn's own comment in the reorder tool) is already
            // taken -- almost certainly by the very next booking, exactly
            // the "shift of time of bookings after this booking" case Dr.
            // Lokesh described when asking for this. Hand control back
            // instead of leaving the admin stuck.
            lokiApptTimeSelect.disabled = false;
            lokiApptFormTimeLocked = false;
            lokiApptFormStatus.textContent = 'That slot is already taken by the next booking — please pick another time, or push the later bookings down first (Push Down, in the Insert/Delete/Push up/Push down tab) and insert again.';
            lokiApptFormStatus.className = 'form-status error';
          }
        }
      })
      .catch(function () {
        // Availability check is a nicety -- the server still blocks a real
        // conflict on submit even if this fails.
      });
  }

  // prefill (optional): { id, name, phone, email } from a search result --
  // an id present means "Reschedule this booking" (the original row gets
  // marked ReScheduled on submit). prefill without an id -- { date } alone,
  // or { date, timeSlotStart } -- so far, from the Insert/Delete/Push up/
  // Push down tab's Insert button -- is a plain NEW booking that only has
  // its Date field defaulted to something other than today; it must NOT
  // flip into reschedule mode just because a (id-less) prefill object was
  // passed, which is why every check below keys off prefill.id
  // specifically, not prefill's own truthiness. timeSlotStart, when it
  // names a real slot, locks the time select to that one value instead of
  // leaving it for the admin to choose -- see lokiApptFormTimeLocked's own
  // comment above for why, and how that lock can still release itself.
  function openLokiApptFormModal(prefill) {
    var isReschedule = !!(prefill && prefill.id);
    var lockedSlot = (prefill && prefill.timeSlotStart)
      ? LOKI_TIME_SLOTS.filter(function (s) { return s.start === prefill.timeSlotStart; })[0]
      : null;
    lokiApptFormOriginalId = isReschedule ? prefill.id : null;
    lokiApptFormOpenedFromReorder = !!(prefill && prefill.fromReorder);
    lokiApptFormTitle.textContent = isReschedule ? 'Reschedule Appointment' : 'Book an Appointment';
    lokiApptFormSub.textContent = isReschedule
      ? 'Pick a new date and time for ' + (prefill.name || 'this patient') + '. The old slot is freed up automatically.'
      : lockedSlot
        ? 'Booked for the half-hour slot right after the one you selected \u2014 we\u2019ll save it right away. Need to make room? Push the later bookings down first, in the Insert/Delete/Push up/Push down tab.'
        : 'Pick a date and time for the patient \u2014 we\u2019ll save it right away.';
    // A previous successful booking leaves this disabled (it's only
    // re-enabled on the conflict/error paths -- a success just closes the
    // modal instead) -- always clear it back out here so the button isn't
    // stuck disabled/greyed-out the next time this modal is opened.
    lokiApptFormSubmitBtn.disabled = false;
    lokiApptFormSubmitBtn.textContent = isReschedule ? 'Confirm Reschedule' : 'Confirm Appointment';
    lokiApptFormStatus.textContent = '';
    lokiApptFormStatus.className = 'form-status';
    lokiApptNameInput.value = prefill ? (prefill.name || '') : '';
    lokiApptPhoneInput.value = prefill ? (prefill.phone || '') : '';
    lokiApptEmailInput.value = prefill ? (prefill.email || '') : '';
    lokiApptPopulateTimeSlots(); // also resets the select back to enabled -- see its own comment
    var today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    lokiApptDateInput.min = today;
    lokiApptDateInput.value = (prefill && prefill.date) ? prefill.date : today;
    lokiApptFormTimeLocked = false;
    if (lockedSlot) {
      lokiApptTimeSelect.value = lockedSlot.start;
      lokiApptTimeSelect.disabled = true;
      lokiApptFormTimeLocked = true;
    }
    lokiApptRefreshSlotAvailability(); // may immediately release the lock above if that slot's actually taken
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
          // Came from the Insert/Delete/Push up/Push down tab's "Insert
          // Booking Below" button (never true for a reschedule, since that
          // always comes from the search modal instead) -- fold the new
          // booking's date into this session's reorderTouchedDates (see the
          // reorder block further down) so closing that tab later knows to
          // refresh the main Appointment list if it's currently looking at
          // this date, and refresh the reorder tool's own still-open list
          // right away so the new booking shows up in it without having to
          // close and reopen the tab.
          if (lokiApptFormOpenedFromReorder && !isReschedule) {
            reorderTouchedDates[lokiApptDateInput.value] = true;
            if (lokiReorderModalOverlay.classList.contains('is-open')) {
              fetchAppointments(function () {
                buildReorderItems();
                renderLokiReorderList();
              }, function () {
                // Best-effort -- the reorder tab's own fetchAppointments
                // will simply retry the next time it's opened.
              });
            }
          }
          // Stays open for 20 seconds after a successful booking/reschedule
          // (not the old 1.2s) so Dr. Lokesh/Management has time to read
          // the confirmation before it closes on its own -- closing it
          // manually (the X button) still works immediately, same as ever.
          setTimeout(closeLokiApptFormModal, 20000);
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
  var lokiSearchModeToggle = document.getElementById('lokiSearchModeToggle');
  var lokiSearchClearBtn = document.getElementById('lokiSearchClearBtn');
  var lokiSearchBackBtn = document.getElementById('lokiSearchBackBtn');
  var lokiSearchResults = document.getElementById('lokiSearchResults');

  // Lets "View Rescheduled Booking" drill down multiple levels (a booking
  // rescheduled to another booking that was itself rescheduled again, and
  // so on) and come back out the same way it went in. Each jump pushes the
  // search (name/date/regex) the doctor was looking at *before* that jump;
  // Back pops the most recent one and re-shows it -- ordinary stack
  // push/pop, not a separate "window" per level.
  var lokiSearchNavStack = [];
  function updateLokiSearchBackBtnVisibility() {
    lokiSearchBackBtn.hidden = !lokiSearchNavStack.length;
  }

  // 'or' (the default) matches name OR date independently -- useful when
  // the two fields aren't meant to narrow each other down. 'and' is the
  // original behavior: both fields must match, i.e. "search by name on a
  // particular chosen date". Only matters when BOTH fields have a value;
  // a single field behaves identically either way -- see renderSearchResults.
  var lokiSearchMode = 'or';
  function renderLokiSearchModeToggle() {
    if (!lokiSearchModeToggle) return;
    var isAnd = lokiSearchMode === 'and';
    lokiSearchModeToggle.textContent = isAnd ? 'And' : 'Or';
    lokiSearchModeToggle.classList.toggle('is-and', isAnd);
    lokiSearchModeToggle.setAttribute('aria-pressed', isAnd ? 'true' : 'false');
  }

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
    info.innerHTML = infoHtml;
    if (a.rescheduledId) info.appendChild(buildRescheduledLink(a.rescheduledId));
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

    var statusSavingOverlay = document.createElement('div');
    statusSavingOverlay.className = 'form-saving-overlay';
    var statusSavingSpinner = document.createElement('span');
    statusSavingSpinner.className = 'loki-spinner';
    statusSavingOverlay.appendChild(statusSavingSpinner);
    statusRow.appendChild(statusSavingOverlay);

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

    // Doubles as "View More" (opens the full booking-detail modal) when
    // nothing's been edited yet, and "Save Status" (saves the pending
    // Status/Cancelled Reason change) the moment one of those two fields
    // actually differs from the saved value -- see refreshSearchStatusDirty.
    var searchStatusSaveBtn = document.createElement('button');
    searchStatusSaveBtn.type = 'button';
    searchStatusSaveBtn.className = 'loki-search-status-save-btn';
    searchStatusSaveBtn.textContent = 'View More';
    statusRow.appendChild(searchStatusSaveBtn);

    var searchStatusMsg = document.createElement('span');
    searchStatusMsg.className = 'form-status';
    searchStatusMsg.style.width = '100%';
    statusRow.appendChild(searchStatusMsg);

    function refreshSearchStatusDirty() {
      var dirty = searchStatusSelect.value !== (a.status || '') || searchReasonSelect.value !== (a.cancelledReason || '');
      searchStatusSaveBtn.textContent = dirty ? 'Save Status' : 'View More';
      searchStatusSaveBtn.disabled = false;
    }
    searchStatusSelect.addEventListener('change', refreshSearchStatusDirty);
    searchReasonSelect.addEventListener('change', refreshSearchStatusDirty);

    // The actual network save -- pulled out of the click handler so the
    // Finished -> prescription prompt can run first (see below) and only
    // call this once that modal is closed.
    function performSearchStatusSave() {
      searchStatusSaveBtn.disabled = true;
      searchStatusSaveBtn.textContent = 'Saving…';
      searchStatusMsg.textContent = '';
      searchStatusMsg.className = 'form-status';
      statusSavingOverlay.classList.add('is-active');
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
          refreshSearchStatusDirty();
          searchStatusMsg.textContent = err && err.message ? err.message : 'Could not save status.';
          searchStatusMsg.className = 'form-status error';
        })
        .finally(function () {
          statusSavingOverlay.classList.remove('is-active');
        });
    }

    searchStatusSaveBtn.addEventListener('click', function () {
      var dirty = searchStatusSelect.value !== (a.status || '') || searchReasonSelect.value !== (a.cancelledReason || '');
      if (!dirty) {
        openLokiViewMoreModal(a);
        return;
      }
      // Being set to Finished here -- offer the prescription modal first,
      // on top of this search modal (see the #prescriptionModalOverlay
      // z-index bump in loki.css), and only actually persist the Finished
      // status once that prescription window is closed, instead of saving
      // the status first and prompting afterwards.
      if (searchStatusSelect.value === 'Finished' && (a.status || '') !== 'Finished') {
        searchStatusSaveBtn.disabled = true;
        prescriptionModalCloseCallback = performSearchStatusSave;
        openPrescriptionModal(a);
        return;
      }
      performSearchStatusSave();
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
    // Finished appointments only -- lets Dr Lokesh/Management pull up the
    // prescription photos for a completed visit straight from search,
    // without having to open the Edit Prescription editor just to look.
    if (a.status === 'Finished' && a.prescriptionImages && a.prescriptionImages.length) {
      var viewPhotosBtn = document.createElement('button');
      viewPhotosBtn.type = 'button';
      viewPhotosBtn.className = 'loki-search-view-photos-btn';
      viewPhotosBtn.textContent = '📷 View All Photos (' + a.prescriptionImages.length + ')';
      viewPhotosBtn.addEventListener('click', function () {
        openPhotosModal(
          a.prescriptionImages,
          'Prescription photos · ' + (a.name || 'Unknown') + ' · ' + formatDateHeading(a.date),
          'No prescription photos for this appointment.'
        );
      });
      actions.appendChild(viewPhotosBtn);
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
      var nameMatches = true;
      if (nameQueryRaw) {
        var nm = a.name || '';
        nameMatches = nameRegex ? nameRegex.test(nm) : (nm.toLowerCase().indexOf(nameQuery) !== -1);
      }
      var dateMatches = !dateQuery || a.date === dateQuery;

      // With both fields filled in, "Or" (default) shows the union --
      // name matches OR date matches -- while "And" narrows to their
      // intersection (a name search scoped to the chosen date). With only
      // one field filled in there's no difference, so this only branches
      // when both are actually in play.
      if (nameQueryRaw && dateQuery && lokiSearchMode !== 'and') {
        return nameMatches || dateMatches;
      }
      return nameMatches && dateMatches;
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
    lokiSearchNavStack = [];
    updateLokiSearchBackBtnVisibility();
    lokiSearchNameInput.value = '';
    lokiSearchDateInput.value = '';
    if (lokiSearchRegexToggle) lokiSearchRegexToggle.checked = false;
    lokiSearchMode = 'or';
    renderLokiSearchModeToggle();
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
    lokiSearchNavStack = [];
    updateLokiSearchBackBtnVisibility();
  }

  // Opens the Cancel/Reschedule search modal already filtered down to one
  // specific booking (by id) -- used by the "View Rescheduled Booking"
  // link instead of leaving the doctor to retype the patient's name/date
  // themselves. Prefills the same name/date search fields the modal
  // already offers (rather than a separate one-off detail view), so the
  // result row that comes back is the exact same row -- with its own
  // Status row, Cancel/Reschedule actions and View All Photos button --
  // the modal always shows.
  function openLokiCancelReschedModalForId(targetId) {
    // A jump that OPENS the modal (clicked from the main Appointment
    // Section, modal not up yet) starts a fresh stack -- there's no
    // meaningful "previous search" beyond the blank state. A jump made
    // from a result row ALREADY inside the modal keeps whatever stack
    // built up so far and just adds one more level, so two and three
    // levels of rescheduling chain Back through correctly.
    var wasOpen = lokiCancelReschedModalOverlay.classList.contains('is-open');
    if (!wasOpen) lokiSearchNavStack = [];
    lokiSearchNavStack.push({
      name: lokiSearchNameInput.value,
      date: lokiSearchDateInput.value,
      useRegex: !!(lokiSearchRegexToggle && lokiSearchRegexToggle.checked),
      mode: lokiSearchMode
    });
    updateLokiSearchBackBtnVisibility();

    lokiCancelReschedModalOverlay.classList.add('is-open');
    lokiSearchResults.innerHTML = '';
    var loadingP = document.createElement('p');
    loadingP.className = 'loki-empty';
    loadingP.textContent = 'Loading appointment…';
    lokiSearchResults.appendChild(loadingP);
    ensureAppointmentsLoaded(function () {
      var target = (appointmentsCache || []).filter(function (x) { return String(x.id) === String(targetId); })[0];
      lokiSearchResults.innerHTML = '';
      if (target) {
        lokiSearchNameInput.value = target.name || '';
        lokiSearchDateInput.value = target.date || '';
        if (lokiSearchRegexToggle) lokiSearchRegexToggle.checked = false;
        // Force "And" here regardless of whatever mode was active before --
        // this prefills BOTH fields to one specific booking's own exact
        // name+date so the one row the doctor jumped to is what shows;
        // "Or" would widen that back out to every other booking sharing
        // just the name or just the date.
        lokiSearchMode = 'and';
        renderLokiSearchModeToggle();
        renderSearchResults();
      } else {
        lokiSearchNameInput.value = '';
        lokiSearchDateInput.value = '';
        var missingP = document.createElement('p');
        missingP.className = 'form-status error';
        missingP.textContent = 'Could not find appointment #' + targetId + '.';
        lokiSearchResults.appendChild(missingP);
      }
    }, function (err) {
      lokiSearchResults.innerHTML = '';
      var errP = document.createElement('p');
      errP.className = 'form-status error';
      errP.textContent = 'Could not load appointments. ' + (err && err.message ? err.message : '');
      lokiSearchResults.appendChild(errP);
    });
  }

  // Pops the most recent pre-jump search off the stack and re-shows it --
  // the counterpart to the push in openLokiCancelReschedModalForId, so
  // repeated clicks walk back out of a multi-level reschedule chain one
  // level at a time.
  function lokiSearchGoBack() {
    if (!lokiSearchNavStack.length) return;
    var prevState = lokiSearchNavStack.pop();
    lokiSearchNameInput.value = prevState.name || '';
    lokiSearchDateInput.value = prevState.date || '';
    if (lokiSearchRegexToggle) lokiSearchRegexToggle.checked = !!prevState.useRegex;
    lokiSearchMode = prevState.mode || 'or';
    renderLokiSearchModeToggle();
    updateLokiSearchBackBtnVisibility();
    renderSearchResults();
  }
  lokiSearchBackBtn.addEventListener('click', lokiSearchGoBack);

  document.getElementById('lokiCancelReschedTab').addEventListener('click', openLokiCancelReschedModal);
  closeLokiCancelReschedModalBtn.addEventListener('click', closeLokiCancelReschedModal);
  lokiSearchNameInput.addEventListener('input', renderSearchResults);
  lokiSearchDateInput.addEventListener('change', renderSearchResults);
  if (lokiSearchRegexToggle) lokiSearchRegexToggle.addEventListener('change', renderSearchResults);
  if (lokiSearchModeToggle) {
    lokiSearchModeToggle.addEventListener('click', function () {
      lokiSearchMode = (lokiSearchMode === 'and') ? 'or' : 'and';
      renderLokiSearchModeToggle();
      renderSearchResults();
    });
  }
  lokiSearchClearBtn.addEventListener('click', function () {
    lokiSearchNameInput.value = '';
    lokiSearchDateInput.value = '';
    if (lokiSearchRegexToggle) lokiSearchRegexToggle.checked = false;
    lokiSearchMode = 'or';
    renderLokiSearchModeToggle();
    lokiSearchNavStack = [];
    updateLokiSearchBackBtnVisibility();
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

  /* ---------- View More (booking detail) modal ----------
     Opened by a search result row's own status-save button when nothing's
     staged to save yet (see buildSearchResultRow) -- a read-only, all-in-
     one view of that one booking: contact details, current + Originally
     Booked slot, status, prescription notes, and a View All button for its
     photos/files, reusing the same openPhotosModal() the Prescription
     editor and Finished rows already use. Stacks on top of the still-open
     search modal (see the z-index bump in loki.css) rather than closing it. */
  var lokiViewMoreModalOverlay = document.getElementById('lokiViewMoreModalOverlay');
  var closeLokiViewMoreModalBtn = document.getElementById('closeLokiViewMoreModal');
  var lokiViewMoreSub = document.getElementById('lokiViewMoreSub');
  var lokiViewMoreDetails = document.getElementById('lokiViewMoreDetails');
  var lokiViewMorePhotosBtn = document.getElementById('lokiViewMorePhotosBtn');

  function buildViewMoreRow(label, value, extraClass) {
    var row = document.createElement('div');
    row.className = 'loki-view-more-row' + (extraClass ? ' ' + extraClass : '');
    var lbl = document.createElement('span');
    lbl.className = 'loki-view-more-row-label';
    lbl.textContent = label;
    row.appendChild(lbl);
    var val = document.createElement('span');
    val.className = 'loki-view-more-row-value';
    if (typeof value === 'string') {
      val.textContent = value;
    } else {
      val.appendChild(value); // a DOM node -- e.g. a <strong> or the ReScheduled jump link
    }
    row.appendChild(val);
    return row;
  }

  function openLokiViewMoreModal(a) {
    lokiViewMoreSub.textContent = (a.name || 'Unknown') + ' · ' + formatDateHeading(a.date) + ' · ' + (a.timeSlotLabel || '');
    lokiViewMoreDetails.innerHTML = '';

    lokiViewMoreDetails.appendChild(buildViewMoreRow('Name', a.name || 'Unknown'));
    lokiViewMoreDetails.appendChild(buildViewMoreRow('Phone', a.phone || '-'));
    lokiViewMoreDetails.appendChild(buildViewMoreRow('Email', a.email || '-'));
    lokiViewMoreDetails.appendChild(buildViewMoreRow('Date', formatDateHeading(a.date)));
    lokiViewMoreDetails.appendChild(buildViewMoreRow('Current Time Slot', a.timeSlotLabel || '-'));

    var origStrong = document.createElement('strong');
    origStrong.textContent = a.originalBookedSlot || a.timeSlotLabel || '-';
    lokiViewMoreDetails.appendChild(buildViewMoreRow('Originally Booked', origStrong, 'loki-view-more-original'));

    var statusWrap = document.createElement('span');
    statusWrap.appendChild(document.createTextNode(APPT_STATUS_LABELS[a.status || ''] || (a.status || 'Upcoming')));
    if (a.rescheduledId) {
      var link = buildRescheduledLink(a.rescheduledId);
      link.addEventListener('click', closeLokiViewMoreModal);
      statusWrap.appendChild(document.createTextNode(' '));
      statusWrap.appendChild(link);
    }
    lokiViewMoreDetails.appendChild(buildViewMoreRow('Status', statusWrap));

    if (a.status === 'Cancelled' && a.cancelledReason) {
      lokiViewMoreDetails.appendChild(buildViewMoreRow('Cancelled Reason', a.cancelledReason));
    }
    if (a.prescription) {
      lokiViewMoreDetails.appendChild(buildViewMoreRow('Prescription', a.prescription));
    }

    if (a.prescriptionImages && a.prescriptionImages.length) {
      lokiViewMorePhotosBtn.hidden = false;
      lokiViewMorePhotosBtn.textContent = '👁 View All (' + a.prescriptionImages.length + ')';
      lokiViewMorePhotosBtn.onclick = function () {
        openPhotosModal(
          a.prescriptionImages,
          'Prescription photos · ' + (a.name || 'Unknown') + ' · ' + formatDateHeading(a.date),
          'No prescription photos for this appointment.'
        );
      };
    } else {
      lokiViewMorePhotosBtn.hidden = true;
      lokiViewMorePhotosBtn.onclick = null;
    }

    lokiViewMoreModalOverlay.classList.add('is-open');
  }
  function closeLokiViewMoreModal() {
    lokiViewMoreModalOverlay.classList.remove('is-open');
  }
  closeLokiViewMoreModalBtn.addEventListener('click', closeLokiViewMoreModal);
  var lokiViewMoreMouseDownOnOverlay = false;
  lokiViewMoreModalOverlay.addEventListener('mousedown', function (e) {
    lokiViewMoreMouseDownOnOverlay = (e.target === lokiViewMoreModalOverlay);
  });
  lokiViewMoreModalOverlay.addEventListener('click', function (e) {
    if (e.target === lokiViewMoreModalOverlay && lokiViewMoreMouseDownOnOverlay) closeLokiViewMoreModal();
    lokiViewMoreMouseDownOnOverlay = false;
  });

  /* ---------- Insert/Delete/Push up/Push down ----------
     A dedicated tool for reshuffling the doctor's own upcoming schedule --
     separate from the usual per-booking Cancel/Reschedule flow because
     everything here is staged locally first (any number of pushes/
     deletes) and only actually saved -- in one batch, completely silently
     (no patient email, no calendar event) -- when Save Changes is
     clicked. See handleLokiApplyReorder_ in Code.gs for the backend side. */
  var lokiReorderModalOverlay = document.getElementById('lokiReorderModalOverlay');
  var closeLokiReorderModalBtn = document.getElementById('closeLokiReorderModal');
  var lokiReorderTab = document.getElementById('lokiReorderTab');
  var lokiReorderStatus = document.getElementById('lokiReorderStatus');
  var lokiReorderList = document.getElementById('lokiReorderList');
  var lokiReorderSaveBar = document.getElementById('lokiReorderSaveBar');
  var lokiReorderSaveCount = document.getElementById('lokiReorderSaveCount');
  var lokiReorderSaveBtn = document.getElementById('lokiReorderSaveBtn');
  var lokiReorderResetBtn = document.getElementById('lokiReorderResetBtn');
  var lokiReorderTodayBtn = document.getElementById('lokiReorderTodayBtn');
  var lokiReorderDateInput = document.getElementById('lokiReorderDateInput');
  var lokiReorderRangeLabel = document.getElementById('lokiReorderRangeLabel');

  var reorderItems = []; // the FULL staged working set -- see buildReorderItems(). Never
  // filtered by the selected date below; only what's rendered is, so
  // picking a different date never discards staged pushes/deletes made on
  // another date -- Save Changes always applies everything staged here,
  // visible or not.
  var reorderSelected = {}; // id -> true, which rows currently have their action buttons showing
  var reorderSelectedDate = startOfToday(); // the single day the tool is currently showing/operating on -- Today button / calendar picker below
  // Every date actually touched (persisted) during this tool's current
  // open session -- a Save Changes batch's old+new dates, a cancelled
  // booking's date, or an Insert Booking Below booking's date (added by
  // lokiApptForm's own submit handler above). Reset on open; read on
  // close to decide whether the main Appointment list needs refreshing --
  // see closeLokiReorderModal.
  var reorderTouchedDates = {};

  // (Re)builds the FULL working list straight from appointmentsCache,
  // discarding any staged pushes/deletes -- only "Upcoming" (blank-status)
  // bookings are reorderable here; Cancelled/ReScheduled/Finished/Past
  // ones don't occupy an active slot, so pushing or deleting them wouldn't
  // mean anything. Deliberately NOT filtered by reorderSelectedDate -- see
  // reorderItems' own comment. orig* is each booking's real, saved
  // date/time -- compared against date/startTime/etc. below to know what's
  // actually changed.
  function buildReorderItems() {
    reorderItems = (appointmentsCache || [])
      .filter(function (a) { return (a.status || '') === ''; })
      .map(function (a) {
        return {
          id: a.id, name: a.name, phone: a.phone, email: a.email,
          origDate: a.date, origStartTime: a.startTime, origEndTime: a.endTime, origTimeSlotLabel: a.timeSlotLabel,
          date: a.date, startTime: a.startTime, endTime: a.endTime, timeSlotLabel: a.timeSlotLabel,
          pendingDelete: false
        };
      });
    reorderSelected = {};
  }

  // Always-chronological (date+time) view of the FULL staged set, regardless
  // of whatever Sort by the main Appointment list itself is using.
  function sortedReorderItems() {
    return reorderItems.slice().sort(function (x, y) {
      return (x.date + x.startTime).localeCompare(y.date + y.startTime);
    });
  }

  // The subset of sortedReorderItems() that falls on the currently chosen
  // single date -- this is what's actually rendered, and Push Up/Push Down
  // only ever trade with a neighbor also on this same date (see
  // buildReorderRow/pushReorderItem below), so reordering stays scoped to
  // the one day the admin picked. A pushed item that lands on a different
  // date simply drops out of view, same as any other date change.
  function visibleReorderItems() {
    var selectedStr = toDateStr(reorderSelectedDate);
    return sortedReorderItems().filter(function (it) { return it.date === selectedStr; });
  }

  function renderLokiReorderNav() {
    lokiReorderDateInput.value = toDateStr(reorderSelectedDate);
    lokiReorderRangeLabel.textContent = formatDateHeading(toDateStr(reorderSelectedDate));
  }

  function updateLokiReorderSaveBar() {
    var count = reorderItems.filter(function (it) {
      return it.pendingDelete || it.date !== it.origDate || it.startTime !== it.origStartTime;
    }).length;
    lokiReorderSaveBar.hidden = count === 0;
    lokiReorderSaveCount.textContent = count + (count === 1 ? ' change' : ' changes');
    lokiReorderSaveBtn.disabled = count === 0;
  }

  function renderLokiReorderList() {
    renderLokiReorderNav();
    var sorted = visibleReorderItems();
    // Push Up/Down only ever trade places between two still-active rows --
    // a row staged for deletion is about to stop existing in this
    // schedule, so it's left out of the adjacency used for that, even
    // though it's still shown (struck through) in its chronological spot
    // below for context.
    var activeSorted = sorted.filter(function (it) { return !it.pendingDelete; });

    lokiReorderList.innerHTML = '';
    if (!sorted.length) {
      var empty = document.createElement('p');
      empty.className = 'loki-empty';
      empty.textContent = 'No upcoming bookings on this date to reorder.';
      lokiReorderList.appendChild(empty);
      updateLokiReorderSaveBar();
      return;
    }
    sorted.forEach(function (it) {
      lokiReorderList.appendChild(buildReorderRow(it, activeSorted));
    });
    updateLokiReorderSaveBar();
  }

  function buildReorderRow(it, activeSorted) {
    var row = document.createElement('div');
    row.className = 'appt-row loki-reorder-row' + (it.pendingDelete ? ' is-cancelled' : '');

    var checkbox = null;
    if (!it.pendingDelete) {
      var checkWrap = document.createElement('label');
      checkWrap.className = 'loki-reorder-check';
      checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = !!reorderSelected[it.id];
      checkWrap.appendChild(checkbox);
      row.appendChild(checkWrap);
    }

    var info = document.createElement('div');
    info.className = 'appt-row-info';
    info.innerHTML = '<strong>' + escapeHtml(it.name || 'Unknown') + '</strong>' +
      '<span>' + escapeHtml(it.phone || '-') + '</span>';
    row.appendChild(info);

    var time = document.createElement('div');
    time.className = 'appt-row-time';
    var moved = it.date !== it.origDate || it.startTime !== it.origStartTime;
    if (moved) {
      time.innerHTML = '<span class="loki-reorder-time-orig">' +
        escapeHtml(formatDateHeading(it.origDate) + ' · ' + (it.origTimeSlotLabel || '')) + '</span>' +
        ' → <span class="loki-reorder-time-new">' +
        escapeHtml(formatDateHeading(it.date) + ' · ' + (it.timeSlotLabel || '')) + '</span>';
    } else {
      time.textContent = formatDateHeading(it.date) + ' · ' + (it.timeSlotLabel || '');
    }
    row.appendChild(time);

    if (it.pendingDelete) {
      var badge = document.createElement('span');
      badge.className = 'appt-row-status-badge is-cancelled';
      badge.textContent = 'To be Cancelled';
      row.appendChild(badge);

      var undoBtn = document.createElement('button');
      undoBtn.type = 'button';
      undoBtn.className = 'appt-row-save-btn';
      undoBtn.textContent = 'Undo';
      undoBtn.addEventListener('click', function () {
        it.pendingDelete = false;
        renderLokiReorderList();
      });
      row.appendChild(undoBtn);
      return row;
    }

    checkbox.addEventListener('change', function () {
      // Just shows/hides this row's own action buttons -- it never
      // reverts an already-staged push itself. A push always trades
      // places between TWO rows at once, so undoing only one side of
      // that trade would leave the other stuck on a now-orphaned slot;
      // Reset All (which rebuilds every row fresh) is the only undo for a
      // push, by design.
      //
      // Only one booking at a time -- checking a row clears every other
      // selection first, so its own actions (Push Up/Down, Insert, Delete)
      // always apply to the one booking the admin is actually focused on,
      // never to a second, still-checked row left over from before.
      reorderSelected = {};
      if (checkbox.checked) reorderSelected[it.id] = true;
      renderLokiReorderList();
    });

    if (reorderSelected[it.id]) {
      var index = activeSorted.map(function (x) { return x.id; }).indexOf(it.id);
      var actions = document.createElement('div');
      actions.className = 'loki-reorder-actions';

      var upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'appt-row-save-btn';
      upBtn.textContent = '↑ Push Up';
      upBtn.disabled = index <= 0;
      upBtn.addEventListener('click', function () { pushReorderItem(it.id, -1); });
      actions.appendChild(upBtn);

      var downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.className = 'appt-row-save-btn';
      downBtn.textContent = '↓ Push Down';
      downBtn.disabled = index === -1 || index >= activeSorted.length - 1;
      downBtn.addEventListener('click', function () { pushReorderItem(it.id, 1); });
      actions.appendChild(downBtn);

      var insertBtn = document.createElement('button');
      insertBtn.type = 'button';
      insertBtn.className = 'appt-row-prescription-btn';
      insertBtn.textContent = 'Insert Booking Below';
      // Opens the ordinary Book Appointment form -- a genuinely new,
      // separate booking, not linked to this one -- pre-filled with this
      // row's Date so it's convenient to add right after it. See
      // openLokiApptFormModal's own comment: a prefill with no id never
      // triggers its Reschedule mode. fromReorder: true marks it as having
      // come from here, so that form's own submit handler knows to refresh
      // this tool's list on success and fold the date into
      // reorderTouchedDates. timeSlotStart is deliberately this row's own
      // end time, not left for the admin to pick -- it's always exactly
      // half an hour after the selected booking, with any bookings already
      // sitting there onward shifted later manually afterward (Push Up/
      // Push Down, right here in this same tab) -- see
      // lokiApptFormTimeLocked's own comment for what happens if that slot
      // turns out to already be taken.
      insertBtn.addEventListener('click', function () {
        var nextSlot = LOKI_TIME_SLOTS.filter(function (s) { return s.start === it.endTime; })[0];
        openLokiApptFormModal({ date: it.date, timeSlotStart: nextSlot ? nextSlot.start : null, fromReorder: true });
      });
      actions.appendChild(insertBtn);

      var deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'appt-row-delete-btn';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', function () {
        it.pendingDelete = true;
        delete reorderSelected[it.id];
        renderLokiReorderList();
      });
      actions.appendChild(deleteBtn);

      row.appendChild(actions);
    }

    return row;
  }

  // Swaps this booking's date/time fields (in practice, just its time --
  // see below) with whichever still-active booking currently sits one
  // place before (dir -1) or after (dir +1) it in the staged chronological
  // order -- the one in the way takes over this one's old slot, exactly as
  // if the two had traded places. Every click re-sorts first, so repeated
  // Push Down clicks keep trading with the next neighbor along, moving
  // this booking steadily later in the day. The neighbor search is scoped
  // to the currently-picked date (same as buildReorderRow's own Push
  // Up/Down disabled logic above), so a push only ever trades with another
  // booking on that same date the admin can actually see -- which, since
  // visibleReorderItems() is now a single day, always means swapping two
  // time slots on that day rather than moving a booking between dates.
  function pushReorderItem(id, dir) {
    var activeSorted = visibleReorderItems().filter(function (it) { return !it.pendingDelete; });
    var index = activeSorted.map(function (it) { return it.id; }).indexOf(id);
    var neighborIndex = index + dir;
    if (index === -1 || neighborIndex < 0 || neighborIndex >= activeSorted.length) return;

    var a = activeSorted[index];
    var b = activeSorted[neighborIndex];
    var tmp = { date: a.date, startTime: a.startTime, endTime: a.endTime, timeSlotLabel: a.timeSlotLabel };
    a.date = b.date; a.startTime = b.startTime; a.endTime = b.endTime; a.timeSlotLabel = b.timeSlotLabel;
    b.date = tmp.date; b.startTime = tmp.startTime; b.endTime = tmp.endTime; b.timeSlotLabel = tmp.timeSlotLabel;

    renderLokiReorderList();
  }

  function setLokiReorderBusy(busy) {
    lokiReorderSaveBtn.disabled = busy;
    lokiReorderSaveBtn.textContent = busy ? 'Saving…' : 'Save Changes';
    lokiReorderResetBtn.disabled = busy;
  }

  function performLokiReorderSave() {
    var moves = reorderItems
      .filter(function (it) { return !it.pendingDelete && (it.date !== it.origDate || it.startTime !== it.origStartTime); })
      .map(function (it) { return { id: it.id, date: it.date, timeSlotStart: it.startTime, timeSlotEnd: it.endTime, timeSlotLabel: it.timeSlotLabel }; });
    var cancels = reorderItems.filter(function (it) { return it.pendingDelete; }).map(function (it) { return it.id; });
    if (!moves.length && !cancels.length) return;

    // Fold every date this batch actually touches into reorderTouchedDates
    // -- both a moved booking's old date (it's no longer shown there) and
    // its new one (it now is), and a cancelled booking's date -- so
    // closeLokiReorderModal knows, once this tab is closed, whether the
    // main Appointment list's currently-shown range needs refreshing.
    reorderItems.forEach(function (it) {
      if (it.pendingDelete) {
        reorderTouchedDates[it.origDate] = true;
      } else if (it.date !== it.origDate || it.startTime !== it.origStartTime) {
        reorderTouchedDates[it.origDate] = true;
        reorderTouchedDates[it.date] = true;
      }
    });

    setLokiReorderBusy(true);
    lokiReorderStatus.textContent = '';
    lokiReorderStatus.className = 'form-status';

    var fd = new FormData();
    fd.append('action', 'lokiApplyReorder');
    fd.append('passcode', currentPasscode);
    fd.append('moves', JSON.stringify(moves));
    fd.append('cancels', JSON.stringify(cancels));

    fetch(GOOGLE_SHEET_WEBAPP_URL, { method: 'POST', body: fd })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.result !== 'success') throw new Error(data.message || 'Save failed.');

        var skippedCount = (data.skipped || []).length;
        lokiReorderStatus.textContent = 'Saved.' + (skippedCount
          ? ' ' + skippedCount + ' booking(s) were skipped because they’d already changed elsewhere — the list below has been refreshed.'
          : '');
        lokiReorderStatus.className = 'form-status success';
        showSavedToast();

        // The sheet now has brand-new rows and several changed statuses --
        // a real re-fetch (not a local patch) is the only reliable way to
        // reflect that, both here and in the Appointment section's own
        // currently-shown date range.
        fetchAppointments(function () {
          renderAppointments();
          buildReorderItems();
          renderLokiReorderList();
          setLokiReorderBusy(false);
        }, function (err) {
          lokiReorderStatus.textContent = 'Saved, but could not refresh the list. ' + (err && err.message ? err.message : 'Please reopen this tab.');
          lokiReorderStatus.className = 'form-status error';
          setLokiReorderBusy(false);
        });
      })
      .catch(function (err) {
        lokiReorderStatus.textContent = 'Could not save changes. ' + (err && err.message ? err.message : '');
        lokiReorderStatus.className = 'form-status error';
        setLokiReorderBusy(false);
      });
  }

  var reorderDataLoaded = false; // becomes true once loadReorderDate() has actually fetched -- see its own comment

  function showReorderPrompt() {
    lokiReorderList.innerHTML = '';
    var prompt = document.createElement('p');
    prompt.className = 'loki-empty';
    prompt.textContent = 'Click Today, or pick a date above, to load that day’s bookings.';
    lokiReorderList.appendChild(prompt);
    lokiReorderSaveBar.hidden = true;
  }

  function openLokiReorderModal() {
    lokiReorderModalOverlay.classList.add('is-open');
    reorderSelectedDate = startOfToday(); // the date field defaults to today, ready to go, but nothing is fetched or shown until Today or the calendar picker is actually used -- see loadReorderDate()
    reorderTouchedDates = {}; // fresh session -- see its own comment above
    reorderDataLoaded = false;
    renderLokiReorderNav();
    lokiReorderStatus.textContent = '';
    showReorderPrompt();
  }
  // Fetches (the first time this tool-open session needs it -- see
  // reorderDataLoaded) and displays reorderSelectedDate's bookings. Called
  // only from the Today button and the calendar picker's own change
  // handler below -- never automatically on open, so nothing loads until
  // the admin actually picks Today or a date, as asked. Once loaded, later
  // Today clicks / date picks just re-filter the same already-fetched
  // working set (see visibleReorderItems) rather than re-fetching, so
  // paging between dates never discards a staged-but-unsaved push or
  // delete made while looking at a different one.
  function loadReorderDate() {
    renderLokiReorderNav();
    if (reorderDataLoaded) {
      renderLokiReorderList();
      return;
    }
    setLoadingStatus(lokiReorderStatus, 'Loading bookings…');
    // Always a fresh fetch (not ensureAppointmentsLoaded's cache-if-present
    // shortcut) -- this tool stages real schedule changes, so it should
    // never start from data that might already be stale.
    fetchAppointments(function () {
      lokiReorderStatus.textContent = '';
      buildReorderItems();
      reorderDataLoaded = true;
      renderLokiReorderList();
    }, function (err) {
      lokiReorderStatus.textContent = 'Could not load appointments. ' + (err && err.message ? err.message : '');
      lokiReorderStatus.className = 'form-status error';
    });
  }
  // True if any date this session actually changed (persisted, not just
  // staged-and-discarded) falls inside the main Appointment section's
  // currently-shown date window -- used on close to decide whether that
  // list needs a refresh, so it never shows stale data for a date the
  // admin was just reordering, without forcing a refresh (and losing that
  // section's own scroll position/sort) for a date it isn't even looking at.
  function reorderTouchedMainApptWindow() {
    var windowEnd = addDays(apptWindowStart, WINDOW_DAYS - 1);
    for (var dateStr in reorderTouchedDates) {
      if (!reorderTouchedDates.hasOwnProperty(dateStr)) continue;
      var d = parseDateStr(dateStr);
      if (d >= apptWindowStart && d <= windowEnd) return true;
    }
    return false;
  }
  function closeLokiReorderModal() {
    lokiReorderModalOverlay.classList.remove('is-open');
    if (reorderTouchedMainApptWindow()) {
      reloadAppointments();
    }
    reorderTouchedDates = {};
  }
  lokiReorderTab.addEventListener('click', openLokiReorderModal);
  lokiReorderTodayBtn.addEventListener('click', function () {
    reorderSelectedDate = startOfToday();
    loadReorderDate();
  });
  // Calendar picker -- jump straight to any date instead of paging
  // through one WINDOW_DAYS range at a time. An invalid/cleared value
  // (e.g. the field emptied while typing) is ignored rather than crashing
  // the view on an invalid Date; the picker itself snaps back to showing
  // reorderSelectedDate on the next renderLokiReorderNav() either way.
  lokiReorderDateInput.addEventListener('change', function () {
    if (!lokiReorderDateInput.value) return;
    reorderSelectedDate = parseDateStr(lokiReorderDateInput.value);
    loadReorderDate();
  });
  closeLokiReorderModalBtn.addEventListener('click', closeLokiReorderModal);
  lokiReorderSaveBtn.addEventListener('click', performLokiReorderSave);
  lokiReorderResetBtn.addEventListener('click', function () {
    buildReorderItems();
    renderLokiReorderList();
  });
  var lokiReorderMouseDownOnOverlay = false;
  lokiReorderModalOverlay.addEventListener('mousedown', function (e) {
    lokiReorderMouseDownOnOverlay = (e.target === lokiReorderModalOverlay);
  });
  lokiReorderModalOverlay.addEventListener('click', function (e) {
    if (e.target === lokiReorderModalOverlay && lokiReorderMouseDownOnOverlay) closeLokiReorderModal();
    lokiReorderMouseDownOnOverlay = false;
  });

  /* ---------- Show Original Bookings ----------
     A read-only viewer: pick a date, see that day's current bookings each
     alongside the very first slot they were ever booked for (before any
     number of admin reschedules/pushes) -- see OriginalBookedSlot in
     Code.gs. Nothing here is editable or staged, so unlike the Insert/
     Delete/Push up/Push down tool there's no save bar, and a date switch
     just re-filters the same fetched set. */
  var lokiOriginalModalOverlay = document.getElementById('lokiOriginalModalOverlay');
  var closeLokiOriginalModalBtn = document.getElementById('closeLokiOriginalModal');
  var lokiOriginalTab = document.getElementById('lokiOriginalTab');
  var lokiOriginalStatus = document.getElementById('lokiOriginalStatus');
  var lokiOriginalList = document.getElementById('lokiOriginalList');
  var lokiOriginalTodayBtn = document.getElementById('lokiOriginalTodayBtn');
  var lokiOriginalDateInput = document.getElementById('lokiOriginalDateInput');
  var lokiOriginalRangeLabel = document.getElementById('lokiOriginalRangeLabel');

  var originalSelectedDate = startOfToday();
  var originalDataLoaded = false; // becomes true once loadOriginalDate() has actually fetched

  // The picked date's bookings, sorted by CURRENT start time (earliest to
  // latest), as asked. ReScheduled rows are left out -- they're dead rows
  // superseded by a replacement booking (which carries this same
  // OriginalBookedSlot forward and shows up under whatever date it's
  // currently sitting on), same as the main Appointment list already hides
  // them. Every other status (Upcoming/Cancelled/Finished/Past) is shown,
  // so this still answers "what was this day's lineup, and where did each
  // of these actually start out" even after cancellations.
  function visibleOriginalItems() {
    var selectedStr = toDateStr(originalSelectedDate);
    return (appointmentsCache || [])
      .filter(function (a) { return a.date === selectedStr && (a.status || '') !== 'ReScheduled'; })
      .slice()
      .sort(function (x, y) { return (x.startTime || '').localeCompare(y.startTime || ''); });
  }

  function renderLokiOriginalNav() {
    lokiOriginalDateInput.value = toDateStr(originalSelectedDate);
    lokiOriginalRangeLabel.textContent = formatDateHeading(toDateStr(originalSelectedDate));
  }

  function buildOriginalRow(a) {
    var row = document.createElement('div');
    row.className = 'appt-row loki-original-row' + apptRowStatusClass(a.status || '');

    var info = document.createElement('div');
    info.className = 'appt-row-info';
    info.innerHTML = '<strong>' + escapeHtml(a.name || 'Unknown') + '</strong>' +
      '<span>' + escapeHtml(a.phone || '-') + '</span>';
    row.appendChild(info);

    var current = document.createElement('div');
    current.className = 'loki-original-current';
    current.innerHTML = '<span class="loki-original-label">Current:</span> ' + escapeHtml(a.timeSlotLabel || '-');
    row.appendChild(current);

    var orig = document.createElement('div');
    orig.className = 'loki-original-slot';
    orig.innerHTML = '<span class="loki-original-label">Originally:</span> <strong>' +
      escapeHtml(a.originalBookedSlot || a.timeSlotLabel || '-') + '</strong>';
    row.appendChild(orig);

    if ((a.status || '') !== '') {
      var badge = document.createElement('span');
      badge.className = 'appt-row-status-badge' + apptRowStatusClass(a.status);
      badge.textContent = APPT_STATUS_LABELS[a.status || ''] || a.status;
      row.appendChild(badge);
    }
    return row;
  }

  function renderLokiOriginalList() {
    renderLokiOriginalNav();
    var items = visibleOriginalItems();
    lokiOriginalList.innerHTML = '';
    if (!items.length) {
      var empty = document.createElement('p');
      empty.className = 'loki-empty';
      empty.textContent = 'No bookings on this date.';
      lokiOriginalList.appendChild(empty);
      return;
    }
    items.forEach(function (a) {
      lokiOriginalList.appendChild(buildOriginalRow(a));
    });
  }

  function showOriginalPrompt() {
    lokiOriginalList.innerHTML = '';
    var prompt = document.createElement('p');
    prompt.className = 'loki-empty';
    prompt.textContent = 'Click Today, or pick a date above, to load that day’s bookings.';
    lokiOriginalList.appendChild(prompt);
  }

  function openLokiOriginalModal() {
    lokiOriginalModalOverlay.classList.add('is-open');
    originalSelectedDate = startOfToday();
    originalDataLoaded = false;
    renderLokiOriginalNav();
    lokiOriginalStatus.textContent = '';
    showOriginalPrompt();
  }
  // Fetches fresh the first time this tool-open session needs it, then
  // just re-filters the same set on later Today clicks / date picks --
  // same pattern as the Insert/Delete/Push up/Push down tool's
  // loadReorderDate(), minus any staging since this view is read-only.
  function loadOriginalDate() {
    renderLokiOriginalNav();
    if (originalDataLoaded) {
      renderLokiOriginalList();
      return;
    }
    setLoadingStatus(lokiOriginalStatus, 'Loading bookings…');
    fetchAppointments(function () {
      lokiOriginalStatus.textContent = '';
      originalDataLoaded = true;
      renderLokiOriginalList();
    }, function (err) {
      lokiOriginalStatus.textContent = 'Could not load appointments. ' + (err && err.message ? err.message : '');
      lokiOriginalStatus.className = 'form-status error';
    });
  }
  function closeLokiOriginalModal() {
    lokiOriginalModalOverlay.classList.remove('is-open');
  }
  lokiOriginalTab.addEventListener('click', openLokiOriginalModal);
  lokiOriginalTodayBtn.addEventListener('click', function () {
    originalSelectedDate = startOfToday();
    loadOriginalDate();
  });
  lokiOriginalDateInput.addEventListener('change', function () {
    if (!lokiOriginalDateInput.value) return;
    originalSelectedDate = parseDateStr(lokiOriginalDateInput.value);
    loadOriginalDate();
  });
  closeLokiOriginalModalBtn.addEventListener('click', closeLokiOriginalModal);
  var lokiOriginalMouseDownOnOverlay = false;
  lokiOriginalModalOverlay.addEventListener('mousedown', function (e) {
    lokiOriginalMouseDownOnOverlay = (e.target === lokiOriginalModalOverlay);
  });
  lokiOriginalModalOverlay.addEventListener('click', function (e) {
    if (e.target === lokiOriginalModalOverlay && lokiOriginalMouseDownOnOverlay) closeLokiOriginalModal();
    lokiOriginalMouseDownOnOverlay = false;
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
    if (lokiReorderModalOverlay.classList.contains('is-open')) closeLokiReorderModal();
    if (lokiOriginalModalOverlay.classList.contains('is-open')) closeLokiOriginalModal();
    if (lokiViewMoreModalOverlay.classList.contains('is-open')) closeLokiViewMoreModal();
  });

})();
