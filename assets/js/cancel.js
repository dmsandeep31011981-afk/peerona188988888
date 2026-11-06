/* =========================================================
   PeerOna — Cancel Booking page (cancel.html)
   Reached only via the "Cancel This Booking" link in a patient's
   own booking confirmation email (sendPatientBookingConfirmation
   Email_ in Code.gs) — same trust model as reschedule.html: the
   booking's own numeric Id, handed to the patient only in that
   email, is what this page and the backend key off.
   ========================================================= */

(function () {
  'use strict';

  // Must match the deployed Apps Script web app URL used across the site.
  var GOOGLE_SHEET_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbw485zzrMSWZ9uCpLTy4YaDfKC6xVHDOpGAVywC6dGi963b8PGRgq5AVEBxdmJ2Khy_fA/exec';

  // The confirmation email links here with ?id=<booking's Id>&name=...
  // &phone=...&email=... — id is what actually identifies the booking;
  // name/phone/email are only carried along so the Reschedule Instead
  // link below can pre-fill reschedule.html the same way.
  var urlParams = new URLSearchParams(window.location.search);
  var bookingId = (urlParams.get('id') || '').trim();
  var nameParam = urlParams.get('name') || '';
  var phoneParam = urlParams.get('phone') || '';
  var emailParam = urlParams.get('email') || '';

  var sub = document.getElementById('cancelSub');
  var details = document.getElementById('cancelDetails');
  var detailName = document.getElementById('cancelDetailName');
  var detailDate = document.getElementById('cancelDetailDate');
  var detailTime = document.getElementById('cancelDetailTime');
  var confirmBtn = document.getElementById('cancelConfirmBtn');
  var rescheduleLink = document.getElementById('cancelRescheduleLink');
  var formStatus = document.getElementById('cancelFormStatus');

  function rescheduleUrl() {
    var params = new URLSearchParams();
    if (bookingId) params.set('id', bookingId);
    if (nameParam) params.set('name', nameParam);
    if (phoneParam) params.set('phone', phoneParam);
    if (emailParam) params.set('email', emailParam);
    var qs = params.toString();
    return 'reschedule.html' + (qs ? '?' + qs : '');
  }
  rescheduleLink.href = rescheduleUrl();

  if (!bookingId) {
    sub.textContent = 'This link is missing some information, so we can’t look up your booking. Please get in touch with us directly.';
    rescheduleLink.hidden = false;
    return;
  }

  fetch(GOOGLE_SHEET_WEBAPP_URL + '?action=patientBookingInfo&id=' + encodeURIComponent(bookingId))
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (data.result !== 'success') {
        sub.textContent = data.message || 'We couldn’t find this booking.';
        rescheduleLink.hidden = false;
        return;
      }

      detailName.textContent = data.name || '-';
      detailDate.textContent = data.date || '-';
      detailTime.textContent = data.label || '-';
      details.hidden = false;
      rescheduleLink.hidden = false;

      if (data.cancellable) {
        sub.textContent = 'Here’s the appointment on file. You can cancel it below, or pick a different time instead.';
        confirmBtn.hidden = false;
      } else {
        var statusLabel = data.status === 'Cancelled' ? 'already been cancelled'
          : data.status === 'ReScheduled' ? 'already been rescheduled to a new time'
          : data.status === 'Finished' ? 'already taken place'
          : 'already moved past the point where it can be cancelled online';
        sub.textContent = 'This appointment has ' + statusLabel + ', so it can’t be cancelled from here.';
      }
    })
    .catch(function () {
      sub.textContent = 'Something went wrong loading your booking. Please try again or call us directly.';
      rescheduleLink.hidden = false;
    });

  // Two taps to actually cancel (first tap just asks the patient to
  // confirm by tapping again) instead of a native confirm() dialog, which
  // reads as jarring on a plain link-opened page like this one.
  var confirming = false;
  confirmBtn.addEventListener('click', function () {
    if (!confirming) {
      confirming = true;
      confirmBtn.textContent = 'Click Again to Confirm Cancellation';
      formStatus.textContent = '';
      formStatus.className = 'form-status';
      return;
    }

    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Cancelling…';
    formStatus.textContent = '';
    formStatus.className = 'form-status';

    var formData = new FormData();
    formData.append('action', 'patientCancelBooking');
    formData.append('id', bookingId);

    fetch(GOOGLE_SHEET_WEBAPP_URL, { method: 'POST', body: formData })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.result !== 'success') throw new Error(data.message || 'Could not cancel this booking.');
        confirmBtn.hidden = true;
        sub.textContent = 'Your appointment on ' + (data.date || detailDate.textContent) + ' (' + (data.label || detailTime.textContent) + ') has been cancelled.';
        formStatus.textContent = 'Cancelled. You can close this page, or pick a new time below.';
        formStatus.className = 'form-status success';
      })
      .catch(function (err) {
        confirming = false;
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Cancel This Booking';
        formStatus.textContent = err && err.message ? err.message : 'Could not cancel this booking. Please try again.';
        formStatus.className = 'form-status error';
      });
  });
})();
