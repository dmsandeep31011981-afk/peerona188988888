/* =========================================================
   PeerOna — Spa & Wellness · main script
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {

  /* ---------- Inline icon set (simple, dependency-free) ---------- */
  const icons = {
    phone: '<svg viewBox="0 0 24 24"><path d="M5 4h3.2l1.4 4.2-2 1.6a11 11 0 0 0 5.6 5.6l1.6-2 4.2 1.4V18c0 1.1-.9 2-2 2C10.5 20 4 13.5 4 6c0-1.1.9-2 2-2z"/></svg>',
    mail: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M4 6.5 12 13l8-6.5"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
    'arrow-up': '<svg viewBox="0 0 24 24"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
    award: '<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="5.5"/><path d="M9 13.5 7.5 21l4.5-2.5 4.5 2.5-1.5-7.5"/></svg>',
    leaf: '<svg viewBox="0 0 24 24"><path d="M5 19c8 0 14-6 14-14-8 0-14 6-14 14z"/><path d="M5 19c1-4 4-8 8-10"/></svg>',
    home: '<svg viewBox="0 0 24 24"><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10.5V20h12v-9.5"/></svg>',
    'map-pin': '<svg viewBox="0 0 24 24"><path d="M12 21s7-6.4 7-12a7 7 0 1 0-14 0c0 5.6 7 12 7 12z"/><circle cx="12" cy="9" r="2.4"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="7.5" r="0.9" fill="currentColor" stroke="none"/></svg>',
    grid: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>',
    facebook: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><text x="12" y="16.5" text-anchor="middle" font-size="11" fill="currentColor" stroke="none" font-family="sans-serif">f</text></svg>',
    instagram: '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r="0.6" fill="currentColor"/></svg>',
    twitter: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><text x="12" y="16" text-anchor="middle" font-size="10" fill="currentColor" stroke="none" font-family="sans-serif">X</text></svg>',
    pinterest: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><text x="12" y="16.5" text-anchor="middle" font-size="11" fill="currentColor" stroke="none" font-family="sans-serif">p</text></svg>',
    'message-circle': '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 1 3.2 6.4L4 20l1.3-3.5A8 8 0 0 1 4 12z"/></svg>',
    video: '<svg viewBox="0 0 24 24"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3.5v11L16 14"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17"/><path d="M8 3v4"/><path d="M16 3v4"/></svg>'
  };
  document.querySelectorAll('i[data-icon]').forEach(el => {
    const name = el.getAttribute('data-icon');
    if (icons[name]) el.innerHTML = icons[name];
  });

  /* ---------- "Saved" toast (shown briefly after any save to the sheet) ---------- */
  let savedToastEl = null;
  let savedToastTimer = null;
  const showSavedToast = (message) => {
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
    savedToastTimer = setTimeout(() => savedToastEl.classList.remove('is-visible'), 2000);
  };

  // Shows a circular spinner over a form's fields and disables them while a
  // save request to the sheet is in flight (Appointment / Message Us forms).
  const setFormSaving = (form, isSaving) => {
    let overlay = form.querySelector('.form-saving-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'form-saving-overlay';
      overlay.innerHTML = '<span class="loki-spinner" aria-hidden="true"></span>';
      form.appendChild(overlay);
    }
    overlay.classList.toggle('is-active', isSaving);
    form.querySelectorAll('input, select, textarea').forEach((el) => { el.disabled = isSaving; });
  };

  /* ---------- Preloader ---------- */
  const preloader = document.getElementById('preloader');
  window.addEventListener('load', () => {
    setTimeout(() => preloader && preloader.classList.add('hidden'), 250);
  });
  // Fallback in case 'load' already fired
  setTimeout(() => preloader && preloader.classList.add('hidden'), 1200);

  /* ---------- Sticky header + back-to-top ---------- */
  const header = document.getElementById('siteHeader');
  const backToTop = document.getElementById('backToTop');
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    header.classList.toggle('scrolled', y > 20);
    backToTop.classList.toggle('show', y > 500);
  }, { passive: true });
  backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  /* ---------- Mobile nav ---------- */
  const navToggle = document.getElementById('navToggle');
  const mainNav = document.getElementById('mainNav');
  navToggle.addEventListener('click', () => {
    mainNav.classList.toggle('open');
    navToggle.classList.toggle('active');
  });
  mainNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => mainNav.classList.remove('open'));
  });

  /* ---------- Active nav link on scroll ---------- */
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.main-nav a, .mobile-tabbar a');
  window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(sec => {
      const top = sec.offsetTop - 140;
      if (window.scrollY >= top) current = sec.getAttribute('id');
    });
    navLinks.forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === `#${current}`);
    });
  }, { passive: true });

  /* ---------- Scroll reveal ---------- */
  const revealEls = document.querySelectorAll('.reveal');
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  revealEls.forEach(el => revealObserver.observe(el));

  /* ---------- Stat counters ---------- */
  const statNums = document.querySelectorAll('.stat-num');
  const animateCount = (el) => {
    const target = parseInt(el.getAttribute('data-count'), 10) || 0;
    const duration = 1400;
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.floor(eased * target).toLocaleString();
      if (progress < 1) requestAnimationFrame(tick);
      else el.textContent = target.toLocaleString();
    };
    requestAnimationFrame(tick);
  };
  const statObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCount(entry.target);
        statObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });
  statNums.forEach(el => statObserver.observe(el));

  /* ---------- Testimonial slider ---------- */
  const track = document.getElementById('testimonialTrack');
  const slides = track ? track.querySelectorAll('.testimonial-slide') : [];
  const dotsWrap = document.getElementById('testimonialDots');
  let current = 0;
  let slideTimer;

  if (slides.length) {
    slides.forEach((_, i) => {
      const dot = document.createElement('span');
      if (i === 0) dot.classList.add('active');
      dot.addEventListener('click', () => goToSlide(i));
      dotsWrap.appendChild(dot);
    });

    function goToSlide(i) {
      slides[current].classList.remove('active');
      dotsWrap.children[current].classList.remove('active');
      current = i;
      slides[current].classList.add('active');
      dotsWrap.children[current].classList.add('active');
    }

    function nextSlide() {
      goToSlide((current + 1) % slides.length);
    }

    function startAutoplay() {
      slideTimer = setInterval(nextSlide, 5500);
    }
    startAutoplay();

    // Same touch-vs-hover guard as the glimpse carousels below: a tap on
    // a touch device can fire "mouseenter" with no "mouseleave" to match,
    // which would otherwise leave this stuck paused permanently.
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      track.addEventListener('mouseenter', () => clearInterval(slideTimer));
      track.addEventListener('mouseleave', startAutoplay);
    }
  }

  /* ---------- Glimpse-style coverflow carousel (reusable) ----------
     Powers both the Gallery's "A Glimpse of Your Retreat" strip and the
     "Explore Our Signature Treatments" strip, with identical behavior:
     3 visible slides, autoplay, pause-on-hover, click-to-select, drag/
     swipe navigation (mouse pull on desktop, thumb swipe on mobile) with
     flick momentum, the mobile left-bias/clamp logic, and (when an
     anchor element id is given) centering the lead slide under a
     heading letter on desktop. */
  const initGlimpseCarousel = (carouselId, trackId, anchorId, initialIndex = 0) => {
    const glimpseCarousel = document.getElementById(carouselId);
    const glimpseTrack = document.getElementById(trackId);
    if (!glimpseCarousel || !glimpseTrack) return;

    const glimpseSlides = Array.from(glimpseTrack.querySelectorAll('.glimpse-slide'));
    const total = glimpseSlides.length;
    let current = total ? ((initialIndex % total) + total) % total : 0;
    let glimpseTimer = null;
    let currentStep = 0;
    let dragOffset = 0;

    const wrapDiff = (diff, n) => {
      let d = diff % n;
      if (d > n / 2) d -= n;
      if (d < -n / 2) d += n;
      return d;
    };

    const SIDE_SCALE = 0.76;
    const glimpseAnchor = anchorId ? document.getElementById(anchorId) : null;

    const MOBILE_BREAKPOINT = 640; // matches the .glimpse-slide mobile CSS breakpoint
    const MOBILE_GAP_PX = 12; // visible gap between the center and each side slide

    const renderGlimpse = () => {
      // Base (unscaled) card size comes straight from the CSS for the
      // current breakpoint, so the gap math stays correct on any screen size.
      const baseWidth = parseFloat(getComputedStyle(glimpseSlides[0]).width) || 300;
      const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;

      let step;
      if (isMobile) {
        // On phones the center slide is intentionally large and the carousel
        // isn't wide enough to show the side slides in full, so they end up
        // cropped by the carousel's own edges — that's expected. What still
        // matters is a real gap between the center and each side slide
        // (not an overlap), so this uses the same "fully spaced" formula as
        // desktop, just with a smaller fixed gap sized for a phone screen.
        step = (baseWidth / 2) + (baseWidth * SIDE_SCALE / 2) + MOBILE_GAP_PX;
      } else {
        const gap = Math.max(20, baseWidth * 0.14);
        step = (baseWidth / 2) + (baseWidth * SIDE_SCALE / 2) + gap;
      }
      currentStep = step;

      const carouselRect = glimpseCarousel.getBoundingClientRect();
      const carouselCenterX = carouselRect.left + carouselRect.width / 2;

      let alignOffset;
      if (isMobile) {
        // The partial side peek is the point here, so just keep the trio
        // centered rather than fighting to keep every slide fully visible.
        alignOffset = 0;
      } else {
        const sideHalfWidth = (baseWidth * SIDE_SCALE) / 2;
        const naturalLeftEdge = (carouselCenterX - step) - sideHalfWidth;
        const naturalRightEdge = (carouselCenterX + step) + sideHalfWidth;

        let targetOffset = 0;
        if (glimpseAnchor) {
          // Desktop/tablet: the center slide's left edge starts below the
          // left edge of the "p" in "Glimpse" — there's plenty of room here.
          const anchorRect = glimpseAnchor.getBoundingClientRect();
          targetOffset = (anchorRect.left + baseWidth / 2) - carouselCenterX;
        }

        // Clamp to the room that's actually available so neither preview
        // slide is ever pushed out past the carousel's own box.
        const maxOffset = carouselRect.right - naturalRightEdge;
        const minOffset = carouselRect.left - naturalLeftEdge;
        // On screens too narrow to fit all 3 preview slides without any
        // crop at all, minOffset can end up greater than maxOffset. Clamping
        // naively in that case collapses to one extreme and crops one side
        // hard while leaving the other untouched, which is worse than before.
        // Fall back to splitting the unavoidable overflow evenly instead.
        alignOffset = minOffset <= maxOffset
          ? Math.min(Math.max(targetOffset, minOffset), maxOffset)
          : (minOffset + maxOffset) / 2;
      }

      glimpseSlides.forEach((slide, i) => {
        const diff = wrapDiff(i - current, total);
        const abs = Math.abs(diff);
        let scale = 1, opacity = 1, blur = 'none';
        if (abs === 1) { scale = SIDE_SCALE; opacity = 0.8; blur = 'brightness(0.85)'; }
        else if (abs >= 2) { scale = 0.6; opacity = 0; blur = 'brightness(0.8)'; }
        slide.style.transform = `translateX(${diff * step + alignOffset + dragOffset}px) scale(${scale})`;
        slide.style.opacity = opacity;
        slide.style.filter = blur;
        slide.style.zIndex = String(10 - abs);
        slide.style.pointerEvents = abs <= 1 ? 'auto' : 'none';
        slide.classList.toggle('is-center', abs === 0);
      });
    };

    const nextGlimpse = () => {
      current = (current + 1) % total;
      renderGlimpse();
    };

    const startGlimpse = () => {
      stopGlimpse();
      glimpseTimer = setInterval(nextGlimpse, 1500);
    };
    const stopGlimpse = () => {
      if (glimpseTimer) clearInterval(glimpseTimer);
      glimpseTimer = null;
    };

    // The carousel should only move while its images are actually on
    // screen: pause it while scrolled away (desktop or mobile) and have
    // it pick back up moving as soon as it scrolls back into view,
    // rather than silently cycling somewhere off-screen the whole time.
    // It also still pauses on hover, so track both reasons independently
    // and only play when neither is blocking it.
    let isHovered = false;
    let isVisible = false;
    let isDragging = false;
    const updatePlayState = () => {
      if (isVisible && !isHovered && !isDragging) startGlimpse();
      else stopGlimpse();
    };

    let suppressNextClick = false;
    glimpseSlides.forEach((slide, i) => {
      slide.addEventListener('click', () => {
        current = i;
        renderGlimpse();
        const slideImg = slide.querySelector('img');
        if (slideImg) openImgLightbox(slideImg.src, slideImg.alt);
      });
    });
    // A drag that moved the carousel shouldn't also register as a click on
    // whichever slide happened to be under the pointer when it was released.
    glimpseCarousel.addEventListener('click', (e) => {
      if (suppressNextClick) {
        suppressNextClick = false;
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    // Only pause-on-hover on devices that actually have a real mouse.
    // On touch devices, tapping a slide (to select it) fires a synthetic
    // "mouseenter" with no matching "mouseleave" afterward, which was
    // permanently stuck the carousel as "hovered" and it never moved
    // again, even after scrolling away and back. Touch taps still work
    // via the click handler above; they just no longer touch isHovered.
    const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (supportsHover) {
      glimpseCarousel.addEventListener('mouseenter', () => { isHovered = true; updatePlayState(); });
      glimpseCarousel.addEventListener('mouseleave', () => { isHovered = false; updatePlayState(); });
    }

    /* ---------- Drag / swipe navigation ----------
       One Pointer Events implementation covers both a mouse pull on
       desktop and a thumb swipe on mobile. The slides track the pointer
       1:1 while dragging (no transition), then snap to the nearest slide
       on release, factoring in how fast the pointer was moving so a
       quick flick carries on past one slide — the way it does in most
       other apps (a slow drag settles on the next slide; a fast flick
       can land 2-3 slides further on). A gesture that turns out to be
       mostly vertical lets go immediately, so scrolling the page over
       the carousel still works normally. */
    const DRAG_DECIDE_PX = 6;     // movement before committing to a direction
    const MAX_FLING_SLIDES = 3;   // cap how far one fast flick can jump
    const MOMENTUM_MS = 200;      // how far ahead velocity gets projected
    const SNAP_TRANSITION = 'transform 0.5s cubic-bezier(.22,.61,.36,1), opacity 0.5s ease, filter 0.5s ease';

    let pointerId = null;
    let dragStartX = 0;
    let dragStartY = 0;
    let directionLocked = false;
    let horizontalDrag = false;
    let moveSamples = [];
    let renderQueued = false;

    const queueRender = () => {
      if (renderQueued) return;
      renderQueued = true;
      requestAnimationFrame(() => { renderQueued = false; renderGlimpse(); });
    };

    const beginHorizontalDrag = (e) => {
      horizontalDrag = true;
      isDragging = true;
      updatePlayState();
      glimpseTrack.classList.add('is-dragging');
      glimpseCarousel.classList.add('is-dragging');
      try { glimpseCarousel.setPointerCapture(e.pointerId); } catch (err) { /* not critical */ }
    };

    const onPointerDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pointerId = e.pointerId;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      directionLocked = false;
      horizontalDrag = false;
      dragOffset = 0;
      moveSamples = [{ x: e.clientX, t: performance.now() }];
    };

    const onPointerMove = (e) => {
      if (pointerId === null || e.pointerId !== pointerId) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;

      if (!directionLocked) {
        if (Math.abs(dx) < DRAG_DECIDE_PX && Math.abs(dy) < DRAG_DECIDE_PX) return;
        directionLocked = true;
        if (Math.abs(dx) <= Math.abs(dy)) {
          // Mostly vertical: this is a page scroll, not a carousel drag.
          pointerId = null;
          return;
        }
        beginHorizontalDrag(e);
      }
      if (!horizontalDrag) return;

      dragOffset = dx;
      moveSamples.push({ x: e.clientX, t: performance.now() });
      if (moveSamples.length > 6) moveSamples.shift();
      queueRender();
      e.preventDefault();
    };

    const endDrag = (e) => {
      if (pointerId === null || (e && e.pointerId !== pointerId)) return;
      pointerId = null;

      if (!horizontalDrag) return;
      horizontalDrag = false;
      isDragging = false;
      glimpseTrack.classList.remove('is-dragging');
      glimpseCarousel.classList.remove('is-dragging');

      const last = moveSamples[moveSamples.length - 1];
      const first = moveSamples[0];
      const dt = Math.max(1, last.t - first.t);
      const velocity = (last.x - first.x) / dt; // px per ms
      const projected = dragOffset + velocity * MOMENTUM_MS;
      const step = currentStep || 1;

      let slidesToMove = Math.round(-projected / step);
      if (slidesToMove === 0 && Math.abs(dragOffset) > step * 0.15) {
        slidesToMove = dragOffset < 0 ? 1 : -1;
      }
      slidesToMove = Math.max(-MAX_FLING_SLIDES, Math.min(MAX_FLING_SLIDES, slidesToMove));

      if (slidesToMove !== 0) {
        current = ((current + slidesToMove) % total + total) % total;
        suppressNextClick = true;
      }

      dragOffset = 0;
      glimpseSlides.forEach(slide => { slide.style.transition = SNAP_TRANSITION; });
      renderGlimpse();
      clearTimeout(glimpseCarousel._snapResetTimer);
      glimpseCarousel._snapResetTimer = setTimeout(() => {
        glimpseSlides.forEach(slide => { slide.style.transition = ''; });
      }, 520);

      updatePlayState();
    };

    glimpseCarousel.addEventListener('pointerdown', onPointerDown);
    glimpseCarousel.addEventListener('pointermove', onPointerMove);
    glimpseCarousel.addEventListener('pointerup', endDrag);
    glimpseCarousel.addEventListener('pointercancel', endDrag);
    // Native image drag-and-drop would otherwise fight with the pointer
    // drag above (a ghost image icon instead of the carousel moving).
    glimpseCarousel.addEventListener('dragstart', (e) => e.preventDefault());

    const visibilityObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        isVisible = entry.isIntersecting;
        updatePlayState();
      });
    }, { threshold: 0.2 });
    visibilityObserver.observe(glimpseCarousel);

    const handleGlimpseResize = () => {
      renderGlimpse();
    };
    window.addEventListener('resize', handleGlimpseResize, { passive: true });

    renderGlimpse();

    // Re-check alignment once fonts/layout settle (web fonts can shift text metrics).
    window.addEventListener('load', handleGlimpseResize);
    setTimeout(handleGlimpseResize, 400);
  };

  initGlimpseCarousel('glimpseCarousel', 'glimpseTrack', 'glimpseAnchor');
  initGlimpseCarousel('treatmentsCarousel', 'treatmentsTrack', null, 11); // 11 = hero-facial-massage.jpg, centered on load

  /* ---------- Newsletter form ---------- */
  const newsletterForm = document.getElementById('newsletterForm');
  if (newsletterForm) {
    newsletterForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = newsletterForm.querySelector('input');
      const btn = newsletterForm.querySelector('button');
      const original = btn.textContent;
      btn.textContent = 'Subscribed ✓';
      input.value = '';
      setTimeout(() => { btn.textContent = original; }, 2500);
    });
  }

  /* ---------- Message Us modal + Google Sheet submission ---------- */
  // Paste the Google Apps Script "Web app" URL you get after deploying the
  // script from the setup guide below. Looks like:
  // https://script.google.com/macros/s/AKfycb.../exec
  const GOOGLE_SHEET_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbw485zzrMSWZ9uCpLTy4YaDfKC6xVHDOpGAVywC6dGi963b8PGRgq5AVEBxdmJ2Khy_fA/exec';

  // Global site settings (clinic address, and the Google Maps link its
  // "Visit Us" card / Book Appointment address row open) live in the
  // "Settings" sheet tab, so they can be edited there without touching
  // code. Fetched once on load; until it resolves (or if it fails) the
  // hard-coded defaults already in the page markup are used instead.
  const DEFAULT_MAPS_LINK = 'https://www.google.com/maps/search/?api=1&query=12.9865278%2C77.5501667';
  const visitUsCard = document.getElementById('visitUsCard');
  const apptClinicAddressBtn = document.getElementById('apptClinicAddressBtn');

  function applyMapsLink(url) {
    if (!url) return;
    if (visitUsCard) visitUsCard.href = url;
    if (apptClinicAddressBtn) apptClinicAddressBtn.dataset.mapsUrl = url;
  }

  if (apptClinicAddressBtn) {
    apptClinicAddressBtn.addEventListener('click', () => {
      window.open(apptClinicAddressBtn.dataset.mapsUrl || DEFAULT_MAPS_LINK, '_blank', 'noopener');
    });
  }

  (function loadSiteConfig() {
    if (!GOOGLE_SHEET_WEBAPP_URL || GOOGLE_SHEET_WEBAPP_URL.indexOf('PASTE_YOUR') === 0) return;
    fetch(GOOGLE_SHEET_WEBAPP_URL + '?action=config')
      .then((res) => res.json())
      .then((config) => {
        if (!config) return;
        if (config.address) {
          document.querySelectorAll('[data-config="address"]').forEach((el) => {
            el.textContent = config.address;
          });
        }
        if (config.mapslink) applyMapsLink(config.mapslink);
      })
      .catch(() => {
        // Fetch failed — the hard-coded fallback text/link already in the page stays as-is.
      });
  })();

  /* ---------- Shared modal body-scroll lock ----------
     document.body.style.overflow = 'hidden' alone can still let the
     background page scroll on some browsers/devices (trackpad momentum,
     mouse-wheel over the dark backdrop, etc. "scroll chains" past the
     hidden body). Locking with position:fixed removes the body from the
     normal flow entirely while a modal is open, so there is nothing for
     that stray scroll to act on; we restore the exact scroll position on
     close. A counter supports (defensively) more than one modal being
     open/closing in quick succession without one closing modal re-enabling
     scroll while another is still open. */
  let modalLockCount = 0;
  let modalLockScrollY = 0;
  const lockBodyScroll = () => {
    if (modalLockCount === 0) {
      modalLockScrollY = window.scrollY || window.pageYOffset || 0;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${modalLockScrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
    }
    modalLockCount++;
  };
  const unlockBodyScroll = () => {
    modalLockCount = Math.max(0, modalLockCount - 1);
    if (modalLockCount === 0) {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      // 'instant' overrides the page's CSS scroll-behavior:smooth so the
      // restore lands exactly, instead of animating and getting cut short.
      window.scrollTo({ top: modalLockScrollY, left: 0, behavior: 'instant' });
    }
  };

  /* ---------- Image lightbox (shared by both scrolling-image carousels:
     the hero's "Signature Treatments" strip and the Gallery section) ----------
     Clicking any slide -- first one, last one, or anywhere in between --
     opens its photo full-size in a closeable overlay, on top of the
     carousel's existing click-to-center behavior (both happen on the same
     click; see initGlimpseCarousel's slide click listener below). */
  const imgLightboxOverlay = document.getElementById('imgLightboxOverlay');
  const imgLightboxImg = document.getElementById('imgLightboxImg');
  const imgLightboxCloseBtn = document.getElementById('imgLightboxClose');

  const openImgLightbox = (src, alt) => {
    if (!imgLightboxOverlay || !imgLightboxImg) return;
    imgLightboxImg.src = src;
    imgLightboxImg.alt = alt || '';
    imgLightboxOverlay.classList.add('is-open');
    lockBodyScroll();
  };
  const closeImgLightbox = () => {
    if (!imgLightboxOverlay) return;
    imgLightboxOverlay.classList.remove('is-open');
    unlockBodyScroll();
  };
  if (imgLightboxCloseBtn) imgLightboxCloseBtn.addEventListener('click', closeImgLightbox);
  if (imgLightboxOverlay) {
    // Click the dark backdrop (not the photo itself) to close, same
    // press-and-release-both-on-the-backdrop guard the other modals use so
    // a text-selection drag ending over the backdrop doesn't close it.
    let imgLightboxMouseDownOnOverlay = false;
    imgLightboxOverlay.addEventListener('mousedown', (e) => {
      imgLightboxMouseDownOnOverlay = (e.target === imgLightboxOverlay);
    });
    imgLightboxOverlay.addEventListener('click', (e) => {
      if (e.target === imgLightboxOverlay && imgLightboxMouseDownOnOverlay) closeImgLightbox();
      imgLightboxMouseDownOnOverlay = false;
    });
  }
  const messageModalOverlay = document.getElementById('messageModalOverlay');
  const openMessageModalBtn = document.getElementById('openMessageModal');
  const closeMessageModalBtn = document.getElementById('closeMessageModal');
  const messageUsForm = document.getElementById('messageUsForm');
  const messageFormStatus = document.getElementById('messageFormStatus');

  const openMessageModal = () => {
    if (!messageModalOverlay) return;
    if (messageFormStatus) {
      messageFormStatus.textContent = '';
      messageFormStatus.className = 'form-status';
    }
    if (messageUsForm) {
      const resetBtn = messageUsForm.querySelector('button[type="submit"]');
      if (resetBtn) {
        resetBtn.disabled = false;
        resetBtn.textContent = 'Send Message';
      }
    }
    messageModalOverlay.classList.add('is-open');
    lockBodyScroll();
  };
  const closeMessageModal = () => {
    if (!messageModalOverlay) return;
    messageModalOverlay.classList.remove('is-open');
    unlockBodyScroll();
  };

  if (openMessageModalBtn) openMessageModalBtn.addEventListener('click', openMessageModal);
  if (closeMessageModalBtn) closeMessageModalBtn.addEventListener('click', closeMessageModal);
  if (messageModalOverlay) {
    let messageModalMouseDownOnOverlay = false;
    messageModalOverlay.addEventListener('mousedown', (e) => {
      messageModalMouseDownOnOverlay = (e.target === messageModalOverlay);
    });
    messageModalOverlay.addEventListener('click', (e) => {
      // Only close when both the press and the release landed on the
      // backdrop itself -- otherwise selecting message text (e.g. dragging
      // right-to-left) that ends with the mouse released over the backdrop
      // would wrongly close the modal.
      if (e.target === messageModalOverlay && messageModalMouseDownOnOverlay) closeMessageModal();
      messageModalMouseDownOnOverlay = false;
    });
  }

  /* ---------- Book Appointment modal ---------- */
  const appointmentModalOverlay = document.getElementById('appointmentModalOverlay');
  const openAppointmentModalBtn = document.getElementById('openAppointmentModal');
  const closeAppointmentModalBtn = document.getElementById('closeAppointmentModal');
  const appointmentForm = document.getElementById('appointmentForm');
  const appointmentFormStatus = document.getElementById('appointmentFormStatus');
  const apptDateInput = document.getElementById('apptDate');
  const apptTimeSelect = document.getElementById('apptTime');

  // Toggle the native date picker open/closed on repeated clicks anywhere
  // in the field, not just the small calendar icon — showPicker() is
  // supported in modern Chromium/Edge/Safari; older browsers just fall
  // back to their normal date-field behavior (typing, or clicking the
  // icon). There's no standard "hide" API, so closing is done by blurring
  // the field, which dismisses the picker in every browser that supports
  // showPicker() in the first place.
  //
  // This custom open/close dance is for mouse/trackpad use only. On a
  // touch device (phone or tablet), tapping a date field already opens
  // the OS's own native picker (a full-screen wheel on iOS, a modal
  // dialog on Android) automatically, with no JS needed — and that
  // native UI can't be closed from JS (blur() does nothing to it, and on
  // Android it blocks all other taps while open, so a "second tap to
  // close" on the field is never actually received). Running our open
  // logic on top of that native behavior was fighting it, which is why
  // it looked broken on mobile. So this whole block is skipped on coarse
  // (touch) pointers and the browser's built-in tap-to-open /
  // tap-away-or-pick-a-date-to-close behavior is left alone — that's
  // already the standard, working mobile experience.
  const apptDateIsTouchDevice = window.matchMedia('(pointer: coarse)').matches;
  if (apptDateInput && typeof apptDateInput.showPicker === 'function' && !apptDateIsTouchDevice) {
    let apptDatePickerOpen = false;

    const openDatePicker = () => {
      try {
        apptDateInput.showPicker();
        apptDatePickerOpen = true;
      } catch (err) { /* ignore: e.g. already open, or blocked by the browser */ }
    };
    const closeDatePicker = () => {
      apptDateInput.blur();
      apptDatePickerOpen = false;
    };

    apptDateInput.addEventListener('click', () => {
      if (apptDatePickerOpen) {
        closeDatePicker();
      } else {
        openDatePicker();
      }
    });
    // Keyboard equivalent of a click, for anyone tabbing to the field and
    // pressing Enter/Space instead of using a mouse or touchscreen.
    apptDateInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (apptDatePickerOpen) {
        closeDatePicker();
      } else {
        openDatePicker();
      }
    });
    // Picking a date, or clicking/tapping away, closes the picker on its
    // own — keep our toggle state in sync so the next click reopens it
    // instead of trying (and failing) to close an already-closed picker.
    apptDateInput.addEventListener('change', () => { apptDatePickerOpen = false; });
    apptDateInput.addEventListener('blur', () => { apptDatePickerOpen = false; });
  }

  // IST "today" as YYYY-MM-DD — read from the browser's clock but expressed
  // in India's timezone, regardless of the visitor's own.
  const getISTDateString = (date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date || new Date());

  // 10 AM-2 PM and 3 PM-8 PM, half-hour slots, with a 2-3 PM lunch break.
  const TIME_SLOTS = (() => {
    const pad = (n) => String(n).padStart(2, '0');
    const label = (h, m) => {
      const period = h < 12 ? 'AM' : 'PM';
      let h12 = h % 12; if (h12 === 0) h12 = 12;
      return h12 + ':' + (m === 0 ? '00' : m) + ' ' + period;
    };
    const slots = [];
    const addSlot = (h, m) => {
      const endH = m === 30 ? h + 1 : h;
      const endM = m === 30 ? 0 : 30;
      slots.push({
        start: pad(h) + ':' + pad(m),
        end: pad(endH) + ':' + pad(endM),
        label: label(h, m) + ' - ' + label(endH, endM)
      });
    };
    for (let h = 10; h < 14; h++) { addSlot(h, 0); addSlot(h, 30); }
    for (let h = 15; h < 20; h++) { addSlot(h, 0); addSlot(h, 30); }
    return slots;
  })();

  const populateTimeSlots = () => {
    if (!apptTimeSelect) return;
    apptTimeSelect.innerHTML = '<option value="">Select a time slot</option>' +
      TIME_SLOTS.map((s) => '<option value="' + s.start + '">' + s.label + '</option>').join('');
  };

  // Greys out slots already booked for the chosen date so a patient can't
  // even select a taken slot; the server still re-checks on submit in case
  // someone else grabs the same slot in the meantime.
  const refreshSlotAvailability = async () => {
    if (!apptTimeSelect || !apptDateInput || !apptDateInput.value) return;
    if (!GOOGLE_SHEET_WEBAPP_URL || GOOGLE_SHEET_WEBAPP_URL.indexOf('PASTE_YOUR') === 0) return;
    try {
      const res = await fetch(GOOGLE_SHEET_WEBAPP_URL + '?action=availability&date=' + encodeURIComponent(apptDateInput.value));
      const data = await res.json();
      const booked = (data && data.bookedSlots) || [];
      const previousValue = apptTimeSelect.value;
      Array.from(apptTimeSelect.options).forEach((opt) => {
        if (!opt.value) return;
        const slot = TIME_SLOTS.find((s) => s.start === opt.value);
        const isBooked = booked.indexOf(opt.value) !== -1;
        opt.disabled = isBooked;
        opt.textContent = isBooked ? (slot.label + ' (Booked)') : slot.label;
      });
      if (previousValue && booked.indexOf(previousValue) !== -1) apptTimeSelect.value = '';
    } catch (err) {
      // Availability check is a nicety — if it fails, slots just stay
      // selectable and the server still blocks a real conflict on submit.
    }
  };

  const openAppointmentModal = () => {
    if (!appointmentModalOverlay) return;
    if (appointmentFormStatus) {
      appointmentFormStatus.textContent = '';
      appointmentFormStatus.className = 'form-status';
    }
    const resetBtn = appointmentForm && appointmentForm.querySelector('button[type="submit"]');
    if (resetBtn) {
      resetBtn.disabled = false;
      resetBtn.textContent = 'Confirm Appointment';
    }
    populateTimeSlots();
    if (apptDateInput) {
      const today = getISTDateString();
      apptDateInput.min = today;
      if (!apptDateInput.value || apptDateInput.value < today) apptDateInput.value = today;
    }
    refreshSlotAvailability();
    appointmentModalOverlay.classList.add('is-open');
    lockBodyScroll();
  };
  const closeAppointmentModal = () => {
    if (!appointmentModalOverlay) return;
    appointmentModalOverlay.classList.remove('is-open');
    unlockBodyScroll();
  };

  if (openAppointmentModalBtn) openAppointmentModalBtn.addEventListener('click', openAppointmentModal);
  if (closeAppointmentModalBtn) closeAppointmentModalBtn.addEventListener('click', closeAppointmentModal);
  if (appointmentModalOverlay) {
    let appointmentModalMouseDownOnOverlay = false;
    appointmentModalOverlay.addEventListener('mousedown', (e) => {
      appointmentModalMouseDownOnOverlay = (e.target === appointmentModalOverlay);
    });
    appointmentModalOverlay.addEventListener('click', (e) => {
      // Only close when both the press and the release landed on the
      // backdrop itself -- otherwise a text-selection drag that ends with
      // the mouse released over the backdrop would wrongly close the modal.
      if (e.target === appointmentModalOverlay && appointmentModalMouseDownOnOverlay) closeAppointmentModal();
      appointmentModalMouseDownOnOverlay = false;
    });
  }
  if (apptDateInput) apptDateInput.addEventListener('change', refreshSlotAvailability);

  if (appointmentForm) {
    appointmentForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!GOOGLE_SHEET_WEBAPP_URL || GOOGLE_SHEET_WEBAPP_URL.indexOf('PASTE_YOUR') === 0) {
        appointmentFormStatus.textContent = 'Form is not connected yet — add the Google Sheet web app URL in script.js.';
        appointmentFormStatus.className = 'form-status error';
        return;
      }

      const slot = TIME_SLOTS.find((s) => s.start === apptTimeSelect.value);
      if (!slot) {
        appointmentFormStatus.textContent = 'Please choose a booking time.';
        appointmentFormStatus.className = 'form-status error';
        return;
      }

      // Email Id is optional, but if the patient typed something in, do a
      // basic sanity check on the format before submitting (the browser's
      // own type="email" validation already catches most of this, but we
      // check again here so the message is consistent and works even if
      // native validation is skipped, e.g. via autofill).
      const apptEmailInput = appointmentForm.querySelector('#apptEmail');
      const apptEmailValue = apptEmailInput ? apptEmailInput.value.trim() : '';
      const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      apptEmailInput && apptEmailInput.classList.remove('field-invalid');
      if (apptEmailValue && !EMAIL_PATTERN.test(apptEmailValue)) {
        appointmentFormStatus.textContent = 'Please enter a valid email address, or leave it blank.';
        appointmentFormStatus.className = 'form-status error';
        apptEmailInput && apptEmailInput.classList.add('field-invalid');
        apptEmailInput && apptEmailInput.focus();
        return;
      }

      const submitBtn = appointmentForm.querySelector('button[type="submit"]');
      const originalLabel = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Booking…';
      appointmentFormStatus.textContent = '';
      appointmentFormStatus.className = 'form-status';
      setFormSaving(appointmentForm, true);

      const formData = new FormData();
      formData.append('formType', 'appointment');
      formData.append('name', appointmentForm.querySelector('#apptName').value);
      formData.append('phone', appointmentForm.querySelector('#apptPhone').value);
      formData.append('email', apptEmailValue);
      formData.append('date', apptDateInput.value);
      formData.append('timeSlotStart', slot.start);
      formData.append('timeSlotEnd', slot.end);
      formData.append('timeSlotLabel', slot.label);

      try {
        const res = await fetch(GOOGLE_SHEET_WEBAPP_URL, { method: 'POST', body: formData });
        const data = await res.json();

        if (data.result === 'success') {
          submitBtn.textContent = 'Appointment Booked ✓';
          appointmentFormStatus.textContent = 'Booked for ' + apptDateInput.value + ', ' + slot.label + '.';
          appointmentFormStatus.className = 'form-status success';
          showSavedToast();
          setTimeout(() => {
            appointmentForm.reset();
            closeAppointmentModal();
          }, 6000);
        } else if (data.result === 'conflict') {
          submitBtn.disabled = false;
          submitBtn.textContent = originalLabel;
          appointmentFormStatus.textContent = data.message || 'That time slot is already booked — please choose another.';
          appointmentFormStatus.className = 'form-status error';
          refreshSlotAvailability();
        } else {
          throw new Error((data && (data.message || data.error)) || 'Unknown error');
        }
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
        appointmentFormStatus.textContent = 'Something went wrong. Please try again or call us directly.';
        appointmentFormStatus.className = 'form-status error';
      } finally {
        setFormSaving(appointmentForm, false);
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (messageModalOverlay && messageModalOverlay.classList.contains('is-open')) closeMessageModal();
    if (appointmentModalOverlay && appointmentModalOverlay.classList.contains('is-open')) closeAppointmentModal();
    if (imgLightboxOverlay && imgLightboxOverlay.classList.contains('is-open')) closeImgLightbox();
  });

  const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB
  const MAX_MESSAGE_PHOTOS = 20; // matches Code.gs's MAX_PHOTOS_PER_MESSAGE safety cap

  const readFileAsBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // reader.result looks like "data:image/png;base64,AAAA..." — keep only the base64 part.
      const base64 = String(reader.result).split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  /* ---------- Message Us "Add Photo" picker (any number of photos) ---------- */
  const msgPhotoList = document.getElementById('msgPhotoList');
  const msgPhotoAddInput = document.getElementById('msgPhotoAddInput');
  const msgPhotoAddBtn = document.getElementById('msgPhotoAddBtn');
  let msgPhotos = []; // { file, objectUrl }

  const renderMsgPhotoList = () => {
    if (!msgPhotoList) return;
    msgPhotoList.innerHTML = '';
    msgPhotos.forEach((entry, i) => {
      const chip = document.createElement('div');
      chip.className = 'msg-photo-chip';

      const thumb = document.createElement('a');
      thumb.href = entry.objectUrl;
      thumb.target = '_blank';
      thumb.rel = 'noopener';
      thumb.className = 'msg-photo-thumb';
      const img = document.createElement('img');
      img.src = entry.objectUrl;
      img.alt = 'Photo ' + (i + 1) + ' preview';
      thumb.appendChild(img);
      chip.appendChild(thumb);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'msg-photo-remove';
      removeBtn.setAttribute('aria-label', 'Remove this photo');
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => {
        URL.revokeObjectURL(entry.objectUrl);
        msgPhotos.splice(msgPhotos.indexOf(entry), 1);
        renderMsgPhotoList();
      });
      chip.appendChild(removeBtn);

      msgPhotoList.appendChild(chip);
    });
  };

  const resetMsgPhotos = () => {
    msgPhotos.forEach((entry) => URL.revokeObjectURL(entry.objectUrl));
    msgPhotos = [];
    if (msgPhotoAddInput) msgPhotoAddInput.value = '';
    renderMsgPhotoList();
  };

  if (msgPhotoAddBtn && msgPhotoAddInput) {
    msgPhotoAddBtn.addEventListener('click', () => msgPhotoAddInput.click());
    msgPhotoAddInput.addEventListener('change', () => {
      const file = msgPhotoAddInput.files && msgPhotoAddInput.files[0];
      msgPhotoAddInput.value = ''; // allow picking the same file again later
      if (!file) return;
      if (msgPhotos.length >= MAX_MESSAGE_PHOTOS) {
        messageFormStatus.textContent = `You can attach up to ${MAX_MESSAGE_PHOTOS} photos.`;
        messageFormStatus.className = 'form-status error';
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        messageFormStatus.textContent = 'That photo is over 4 MB — please choose a smaller image.';
        messageFormStatus.className = 'form-status error';
        return;
      }
      messageFormStatus.textContent = '';
      messageFormStatus.className = 'form-status';
      msgPhotos.push({ file, objectUrl: URL.createObjectURL(file) });
      renderMsgPhotoList();
    });
  }

  if (messageUsForm) {
    messageUsForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!GOOGLE_SHEET_WEBAPP_URL || GOOGLE_SHEET_WEBAPP_URL.indexOf('PASTE_YOUR') === 0) {
        messageFormStatus.textContent = 'Form is not connected yet — add the Google Sheet web app URL in script.js.';
        messageFormStatus.className = 'form-status error';
        return;
      }

      // Any number of photos (the old fixed msgImage/msgImage2/msgImage3/
      // msgImage4 inputs are gone), sent as photo0(Base64|Name|Mime),
      // photo1(...), ... matching Code.gs's collectImagesUnlimited_.
      const submitBtn = messageUsForm.querySelector('button[type="submit"]');
      const originalLabel = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = msgPhotos.length ? 'Uploading photo…' : 'Sending…';
      messageFormStatus.textContent = '';
      messageFormStatus.className = 'form-status';
      setFormSaving(messageUsForm, true);

      const formData = new FormData();
      formData.append('name', messageUsForm.querySelector('#msgName').value);
      formData.append('phone', messageUsForm.querySelector('#msgPhone').value);
      formData.append('message', messageUsForm.querySelector('#msgMessage').value);

      try {
        for (let i = 0; i < msgPhotos.length; i++) {
          const file = msgPhotos[i].file;
          const base64 = await readFileAsBase64(file);
          formData.append(`photo${i}Base64`, base64);
          formData.append(`photo${i}Name`, file.name);
          formData.append(`photo${i}Mime`, file.type || 'image/jpeg');
        }
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
        messageFormStatus.textContent = "Couldn't read that photo — please try a different file.";
        messageFormStatus.className = 'form-status error';
        setFormSaving(messageUsForm, false);
        return;
      }

      submitBtn.textContent = 'Sending…';

      // Apps Script web apps don't return CORS headers, so the browser can't
      // read the response — "no-cors" lets the request go through anyway;
      // the row is written to the sheet even though we can't read the reply.
      fetch(GOOGLE_SHEET_WEBAPP_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: formData
      })
        .then(() => {
          submitBtn.textContent = 'Message Sent ✓';
          submitBtn.disabled = true;
          messageFormStatus.textContent = 'Message sent';
          messageFormStatus.className = 'form-status success';
          showSavedToast();
          messageUsForm.reset();
          resetMsgPhotos();
        })
        .catch(() => {
          submitBtn.textContent = originalLabel;
          submitBtn.disabled = false;
          messageFormStatus.textContent = 'Something went wrong. Please try again or call us directly.';
          messageFormStatus.className = 'form-status error';
        })
        .finally(() => setFormSaving(messageUsForm, false));
    });
  }

  /* ---------- Footer year ---------- */
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

});
