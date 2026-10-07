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
    pinterest: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><text x="12" y="16.5" text-anchor="middle" font-size="11" fill="currentColor" stroke="none" font-family="sans-serif">p</text></svg>'
  };
  document.querySelectorAll('i[data-icon]').forEach(el => {
    const name = el.getAttribute('data-icon');
    if (icons[name]) el.innerHTML = icons[name];
  });

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

    track.addEventListener('mouseenter', () => clearInterval(slideTimer));
    track.addEventListener('mouseleave', startAutoplay);
  }

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

  /* ---------- Footer year ---------- */
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

});
