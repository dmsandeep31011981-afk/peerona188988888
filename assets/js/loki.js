/* =========================================================
   PeerOna — Dr. Lokesh's private page (loki.html)
   ========================================================= */

(function () {
  'use strict';

  var GOOGLE_SHEET_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwOOx11a_BeZd83JR9JENYaDEKLckQ9SxrpncR_6cnUrOcii79jMGjbbfg6Bse1wB9UhA/exec';
  var PASSCODE_STORAGE_KEY = 'lokiPasscode';
  var WINDOW_DAYS = 7; // default visible date-window size, both sections
  var MAX_REPLY_WORDS = 1000;

  /* ---------- tiny inline icon set (subset reused from the main site) ---------- */
  var icons = {
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17"/><path d="M8 3v4"/><path d="M16 3v4"/></svg>',
    'message-circle': '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 1 3.2 6.4L4 20l1.3-3.5A8 8 0 0 1 4 12z"/></svg>',
    'arrow-up': '<svg viewBox="0 0 24 24"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>'
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
  var apptSaveBar = document.getElementById('apptSaveBar');
  var apptSaveCount = document.getElementById('apptSaveCount');
  var apptSaveBtn = document.getElementById('apptSaveBtn');

  var appointmentsCache = null; // array, fetched once per unlock (or forced refresh)
  var apptWindowStart = startOfToday(); // appointments default forward: today .. +6
  var apptChanges = {}; // timestamp -> boolean

  function loadAppointments() {
    if (appointmentsCache) { renderAppointments(); return; }
    apptStatus.textContent = 'Loading appointments…';
    apptStatus.className = 'form-status';
    fetch(buildGetUrl('lokiAppointments'))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.result !== 'success') throw new Error(data.message || 'Failed to load.');
        appointmentsCache = data.appointments;
        apptStatus.textContent = '';
        renderAppointments();
      })
      .catch(function (err) {
        apptStatus.textContent = 'Could not load appointments. ' + (err && err.message ? err.message : '');
        apptStatus.className = 'form-status error';
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

  function buildApptRow(a) {
    var row = document.createElement('div');
    row.className = 'appt-row' + (a.cancelled ? ' is-cancelled' : '');

    var info = document.createElement('div');
    info.className = 'appt-row-info';
    var infoHtml = '<strong>' + escapeHtml(a.name || 'Unknown') + '</strong>' +
      '<span>' + escapeHtml(a.phone || '-') + '</span>';
    if (a.email) infoHtml += '<span>' + escapeHtml(a.email) + '</span>';
    info.innerHTML = infoHtml;
    row.appendChild(info);

    var time = document.createElement('div');
    time.className = 'appt-row-time';
    time.textContent = a.timeSlotLabel || '';
    row.appendChild(time);

    var label = document.createElement('label');
    label.className = 'appt-row-cancel';
    var checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!a.cancelled;
    checkbox.addEventListener('change', function () {
      row.classList.toggle('is-cancelled', checkbox.checked);
      var original = appointmentsCache.filter(function (x) { return x.timestamp === a.timestamp; })[0];
      if (original && checkbox.checked === original.cancelled) {
        delete apptChanges[a.timestamp];
      } else {
        apptChanges[a.timestamp] = checkbox.checked;
      }
      updateApptSaveBar();
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(' Cancelled'));
    row.appendChild(label);

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

    var changesPayload = keys.map(function (timestamp) {
      return { timestamp: timestamp, cancelled: apptChanges[timestamp] };
    });

    var fd = new FormData();
    fd.append('action', 'lokiSaveCancellations');
    fd.append('passcode', currentPasscode);
    fd.append('changes', JSON.stringify(changesPayload));

    fetch(GOOGLE_SHEET_WEBAPP_URL, { method: 'POST', body: fd })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.result !== 'success') throw new Error(data.message || 'Save failed.');

        changesPayload.forEach(function (c) {
          var a = appointmentsCache.filter(function (x) { return x.timestamp === c.timestamp; })[0];
          if (a) a.cancelled = c.cancelled;
        });
        apptChanges = {};
        updateApptSaveBar();

        var notifiedCount = (data.notified || []).length;
        apptStatus.textContent = 'Saved.' + (notifiedCount ? ' ' + notifiedCount + ' patient(s) emailed about their cancellation.' : '');
        apptStatus.className = 'form-status success';
        renderAppointments();
      })
      .catch(function (err) {
        apptStatus.textContent = 'Could not save changes. ' + (err && err.message ? err.message : '');
        apptStatus.className = 'form-status error';
      })
      .finally(function () {
        apptSaveBtn.disabled = false;
        apptSaveBtn.textContent = 'Save Changes';
      });
  });

  apptToggle.addEventListener('click', function () {
    var expanded = apptToggle.getAttribute('aria-expanded') === 'true';
    apptToggle.setAttribute('aria-expanded', String(!expanded));
    apptBody.hidden = expanded;
    if (!expanded) loadAppointments();
  });
  apptPrevBtn.addEventListener('click', function () { apptWindowStart = addDays(apptWindowStart, -WINDOW_DAYS); renderAppointments(); });
  apptNextBtn.addEventListener('click', function () { apptWindowStart = addDays(apptWindowStart, WINDOW_DAYS); renderAppointments(); });
  apptTodayBtn.addEventListener('click', function () { apptWindowStart = startOfToday(); renderAppointments(); });

  /* ---------- Messages Section ---------- */
  var msgToggle = document.getElementById('msgToggle');
  var msgBody = document.getElementById('msgBody');
  var msgList = document.getElementById('msgList');
  var msgStatus = document.getElementById('msgStatus');
  var msgRangeLabel = document.getElementById('msgRangeLabel');
  var msgPrevBtn = document.getElementById('msgPrevBtn');
  var msgNextBtn = document.getElementById('msgNextBtn');
  var msgTodayBtn = document.getElementById('msgTodayBtn');

  var messagesCache = null;
  // Messages are historical (received in the past), so default to a
  // trailing window ending today, rather than looking forward like
  // appointments do.
  var msgWindowStart = addDays(startOfToday(), -(WINDOW_DAYS - 1));

  function loadMessages() {
    if (messagesCache) { renderMessages(); return; }
    msgStatus.textContent = 'Loading messages…';
    msgStatus.className = 'form-status';
    fetch(buildGetUrl('lokiMessages'))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.result !== 'success') throw new Error(data.message || 'Failed to load.');
        messagesCache = data.messages;
        msgStatus.textContent = '';
        renderMessages();
      })
      .catch(function (err) {
        msgStatus.textContent = 'Could not load messages. ' + (err && err.message ? err.message : '');
        msgStatus.className = 'form-status error';
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
  msgPrevBtn.addEventListener('click', function () { msgWindowStart = addDays(msgWindowStart, -WINDOW_DAYS); renderMessages(); });
  msgNextBtn.addEventListener('click', function () { msgWindowStart = addDays(msgWindowStart, WINDOW_DAYS); renderMessages(); });
  msgTodayBtn.addEventListener('click', function () { msgWindowStart = addDays(startOfToday(), -(WINDOW_DAYS - 1)); renderMessages(); });

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
        var img = document.createElement('img');
        img.src = url;
        img.alt = 'Patient photo';
        img.loading = 'lazy';
        photosScroll.appendChild(img);
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

  function countWords(text) {
    var trimmed = (text || '').trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }
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

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (photosModalOverlay.classList.contains('is-open')) closePhotosModal();
    if (replyModalOverlay.classList.contains('is-open')) closeReplyModal();
  });

})();
