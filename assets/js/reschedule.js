/* =========================================================
   PeerOna — Reschedule page (reschedule.html)
   A trimmed-down copy of just the booking logic from the main
   site's assets/js/script.js — nothing else from that file (no
   carousels, no gallery, no other forms) is needed here.
   ========================================================= */

(function () {
  'use strict';

  // Must match the deployed Apps Script web app URL used across the site.
  var GOOGLE_SHEET_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwOOx11a_BeZd83JR9JENYaDEKLckQ9SxrpncR_6cnUrOcii79jMGjbbfg6Bse1wB9UhA/exec';

  // The cancellation email links here with ?id=<original booking's Id>
  // &name=...&phone=...&email=... — id lets the backend link the new
  // booking back to the cancelled one; name/phone/email just pre-fill the
  // form so the patient doesn't have to retype their own details.
  var urlParams = new URLSearchParams(window.location.search);
  var originalId = (urlParams.get('id') || '').trim();

  var form = document.getElementById('rescheduleForm');
  var formStatus = document.getElementById('reschFormStatus');
  var nameInput = document.getElementById('reschName');
  var phoneInput = document.getElementById('reschPhone');
  var emailInput = document.getElementById('reschEmail');
  var dateInput = document.getElementById('reschDate');
  var timeSelect = document.getElementById('reschTime');

  if (urlParams.get('name')) nameInput.value = urlParams.get('name');
  if (urlParams.get('phone')) phoneInput.value = urlParams.get('phone');
  if (urlParams.get('email')) emailInput.value = urlParams.get('email');

  // IST "today" as YYYY-MM-DD — read from the browser's clock but expressed
  // in India's timezone, regardless of the visitor's own.
  var getISTDateString = function (date) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date || new Date());
  };

  // 10 AM-2 PM and 3 PM-8 PM, half-hour slots, with a 2-3 PM lunch break —
  // same schedule as the main site's Book Appointment form.
  var TIME_SLOTS = (function () {
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

  var populateTimeSlots = function () {
    timeSelect.innerHTML = '<option value="">Select a time slot</option>' +
      TIME_SLOTS.map(function (s) { return '<option value="' + s.start + '">' + s.label + '</option>'; }).join('');
  };

  // Greys out slots already booked for the chosen date; the server still
  // re-checks on submit in case someone else grabs the same slot meanwhile.
  var refreshSlotAvailability = function () {
    if (!dateInput.value) return;
    fetch(GOOGLE_SHEET_WEBAPP_URL + '?action=availability&date=' + encodeURIComponent(dateInput.value))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var booked = (data && data.bookedSlots) || [];
        var previousValue = timeSelect.value;
        Array.prototype.forEach.call(timeSelect.options, function (opt) {
          if (!opt.value) return;
          var slot = TIME_SLOTS.filter(function (s) { return s.start === opt.value; })[0];
          var isBooked = booked.indexOf(opt.value) !== -1;
          opt.disabled = isBooked;
          opt.textContent = isBooked ? (slot.label + ' (Booked)') : slot.label;
        });
        if (previousValue && booked.indexOf(previousValue) !== -1) timeSelect.value = '';
      })
      .catch(function () {
        // Availability check is a nicety — if it fails, slots just stay
        // selectable and the server still blocks a real conflict on submit.
      });
  };

  populateTimeSlots();
  var today = getISTDateString();
  dateInput.min = today;
  dateInput.value = today;
  refreshSlotAvailability();
  dateInput.addEventListener('change', refreshSlotAvailability);

  var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var slot = TIME_SLOTS.filter(function (s) { return s.start === timeSelect.value; })[0];
    if (!slot) {
      formStatus.textContent = 'Please choose a booking time.';
      formStatus.className = 'form-status error';
      return;
    }

    var emailValue = emailInput.value.trim();
    emailInput.classList.remove('field-invalid');
    if (emailValue && !EMAIL_PATTERN.test(emailValue)) {
      formStatus.textContent = 'Please enter a valid email address, or leave it blank.';
      formStatus.className = 'form-status error';
      emailInput.classList.add('field-invalid');
      emailInput.focus();
      return;
    }

    var submitBtn = form.querySelector('button[type="submit"]');
    var originalLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Booking…';
    formStatus.textContent = '';
    formStatus.className = 'form-status';

    var formData = new FormData();
    formData.append('formType', 'appointment');
    formData.append('name', nameInput.value);
    formData.append('phone', phoneInput.value);
    formData.append('email', emailValue);
    formData.append('date', dateInput.value);
    formData.append('timeSlotStart', slot.start);
    formData.append('timeSlotEnd', slot.end);
    formData.append('timeSlotLabel', slot.label);
    if (originalId) formData.append('originalId', originalId);

    fetch(GOOGLE_SHEET_WEBAPP_URL, { method: 'POST', body: formData })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.result === 'success') {
          submitBtn.textContent = 'Appointment Booked ✓';
          formStatus.textContent = 'Booked for ' + dateInput.value + ', ' + slot.label + '. You can close this page.';
          formStatus.className = 'form-status success';
          form.querySelectorAll('input, select, button[type="submit"]').forEach(function (el) { el.disabled = true; });
        } else if (data.result === 'conflict') {
          submitBtn.disabled = false;
          submitBtn.textContent = originalLabel;
          formStatus.textContent = data.message || 'That time slot is already booked — please choose another.';
          formStatus.className = 'form-status error';
          refreshSlotAvailability();
        } else {
          throw new Error((data && (data.message || data.error)) || 'Unknown error');
        }
      })
      .catch(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
        formStatus.textContent = 'Something went wrong. Please try again or call us directly.';
        formStatus.className = 'form-status error';
      });
  });
})();
