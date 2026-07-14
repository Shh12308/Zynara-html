/* =========================================
   LIVE CLOCK WIDGET ENGINE
   ========================================= */
window.LiveClocks = (() => {
  const intervals = new Map();

  /* Intl timezone to IANA mapping helpers */
  const TZ_ALIASES = {
    'est': 'America/New_York', 'edt': 'America/New_York',
    'cst': 'America/Chicago', 'cdt': 'America/Chicago',
    'mst': 'America/Denver', 'mdt': 'America/Denver',
    'pst': 'America/Los_Angeles', 'pdt': 'America/Los_Angeles',
    'gmt': 'Europe/London', 'bst': 'Europe/London',
    'ist': 'Asia/Kolkata', 'jst': 'Asia/Tokyo',
    'cet': 'Europe/Berlin', 'cest': 'Europe/Berlin',
    'aest': 'Australia/Sydney', 'aedt': 'Australia/Sydney',
    'nzst': 'Pacific/Auckland', 'nzdt': 'Pacific/Auckland',
    'hst': 'Pacific/Honolulu', 'akst': 'America/Anchorage',
    'ast': 'America/Halifax', 'brt': 'America/Sao_Paulo',
    'art': 'America/Argentina/Buenos_Aires',
    'cat': 'Africa/Johannesburg', 'eat': 'Africa/Nairobi',
    'wib': 'Asia/Jakarta', 'wita': 'Asia/Makassar', 'wit': 'Asia/Jayapura',
    'hkt': 'Asia/Hong_Kong', 'sgt': 'Asia/Singapore',
    'kst': 'Asia/Seoul', 'cst_china': 'Asia/Shanghai',
    'msk': 'Europe/Moscow', 'gmt+3': 'Europe/Moscow',
  };

  function resolveTZ(tz) {
    if (!tz) return Intl.DateTimeFormat().resolvedOptions().timeZone;
    const lower = tz.toLowerCase().replace(/\s/g, '');
    if (TZ_ALIASES[lower]) return TZ_ALIASES[lower];
    /* Try UTC offsets like UTC+5:30 */
    const utcMatch = tz.match(/^UTC([+-]\d{1,2}(?::\d{2})?)$/i);
    if (utcMatch) {
      /* Convert UTC offset to IANA — use Etc/GMT convention (inverted sign) */
      const sign = utcMatch[1].startsWith('+') ? '-' : '+';
      const num = utcMatch[1].slice(1).replace(':', '');
      return `Etc/GMT${sign}${num}`;
    }
    return tz;
  }

  /* Get time period: day, night, dawn, dusk */
  function getTimePeriod(hour) {
    if (hour >= 6 && hour < 8) return 'dawn';
    if (hour >= 8 && hour < 17) return 'day';
    if (hour >= 17 && hour < 20) return 'dusk';
    return 'night';
  }

  function getPeriodIcon(period) {
    switch (period) {
      case 'day': return '☀️';
      case 'night': return '🌙';
      case 'dawn': return '🌅';
      case 'dusk': return '🌇';
      default: return '☀️';
    }
  }

  /* Format time in 12h or 24h */
  function formatTime(date, use24h) {
    let h = date.getHours();
    const m = date.getMinutes();
    const s = date.getSeconds();
    let ampm = '';
    if (!use24h) {
      ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
    }
    return {
      hm: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      sec: String(s).padStart(2, '0'),
      ampm
    };
  }

  /* Format date nicely */
  function formatDate(date, tz) {
    return date.toLocaleDateString('en-US', {
      timeZone: tz,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function formatDayOfWeek(date, tz) {
    return date.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long' });
  }

  /* Get UTC offset string */
  function getUTCOffset(tz) {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset'
    });
    const parts = fmt.formatToParts(now);
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    return tzPart ? tzPart.value : '';
  }

  /* Get hour difference from user's local timezone */
  function getRelativeDiff(tz) {
    const now = new Date();
    const localOffset = -now.getTimezoneOffset(); // in minutes, positive east
    /* Get target offset */
    const targetStr = now.toLocaleString('en-US', { timeZone: tz });
    const targetDate = new Date(targetStr);
    const targetOffset = (targetDate - now) / 60000 + localOffset;
    const diffHours = Math.round((targetOffset - localOffset) / 60 * 10) / 10;
    return diffHours;
  }

  function formatRelativeDiff(diffHours) {
    if (Math.abs(diffHours) < 0.01) return { text: 'Same as you', cls: 'rel-same' };
    const abs = Math.abs(diffHours);
    const hrs = Math.floor(abs);
    const mins = Math.round((abs - hrs) * 60);
    let str = '';
    if (hrs > 0) str += `${hrs}h`;
    if (mins > 0) str += `${mins}m`;
    if (diffHours > 0) return { text: `${str} ahead of you`, cls: 'rel-ahead' };
    return { text: `${str} behind you`, cls: 'rel-behind' };
  }

  /* Update a single widget */
  function updateWidget(el) {
    const tz = resolveTZ(el.dataset.tz);
    const use24h = el.dataset.format24 === 'true';
    const now = new Date();
    const localNow = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const period = getTimePeriod(localNow.getHours());
    const time = formatTime(localNow, use24h);
    const date = formatDate(localNow, tz);
    const dow = formatDayOfWeek(localNow, tz);
    const utcOff = getUTCOffset(tz);
    const diff = getRelativeDiff(tz);
    const relText = formatRelativeDiff(diff);

    /* Set data-period for CSS */
    el.dataset.period = period;

    /* Update time elements */
    const hmEl = el.querySelector('.lcw-time-hm');
    const secEl = el.querySelector('.lcw-time-sec');
    const ampmEl = el.querySelector('.lcw-time-ampm');
    const dateEl = el.querySelector('.lcw-date');
    const dowEl = el.querySelector('.lcw-dow');
    const utcEl = el.querySelector('.lcw-utc-val');
    const relEl = el.querySelector('.lcw-relative-val');
    const relCls = el.querySelector('.lcw-relative');
    const iconEl = el.querySelector('.lcw-daynight-icon');
    const dnEl = el.querySelector('.lcw-daynight');
    const ambEl = el.querySelector('.lcw-ambient');

    if (hmEl) hmEl.textContent = time.hm;
    if (secEl) secEl.textContent = time.sec;
    if (ampmEl) ampmEl.textContent = time.ampm;
    if (dateEl) dateEl.textContent = date;
    if (dowEl) dowEl.textContent = dow;
    if (utcEl) utcEl.textContent = utcOff;
    if (relEl) relEl.textContent = relText.text;
    if (relCls) {
      relCls.querySelector('.lcw-relative-val')?.classList.remove('rel-ahead', 'rel-behind', 'rel-same');
      relCls.querySelector('.lcw-relative-val')?.classList.add(relText.cls);
    }
    if (iconEl) iconEl.textContent = getPeriodIcon(period);
    if (dnEl) {
      dnEl.classList.remove('is-day', 'is-night', 'is-dawn', 'is-dusk');
      dnEl.classList.add(`is-${period}`);
    }
    if (ambEl) {
      ambEl.classList.remove('is-day', 'is-night', 'is-dawn', 'is-dusk');
      ambEl.classList.add(`is-${period}`);
    }

    /* Update analog clock if present */
    updateAnalog(el, localNow);
  }

  /* Update analog clock hands */
  function updateAnalog(el, date) {
    const h = date.getHours() % 12;
    const m = date.getMinutes();
    const s = date.getSeconds();
    const hourHand = el.querySelector('.lcw-analog-hour');
    const minHand = el.querySelector('.lcw-analog-minute');
    const secHand = el.querySelector('.lcw-analog-second');
    if (hourHand) hourHand.style.transform = `rotate(${h * 30 + m * 0.5}deg)`;
    if (minHand) minHand.style.transform = `rotate(${m * 6}deg)`;
    if (secHand) secHand.style.transform = `rotate(${s * 6}deg)`;
  }

  /* Update inline time mentions */
  function updateInline(el) {
    const tz = resolveTZ(el.dataset.tz);
    const use24h = el.dataset.format24 === 'true';
    const now = new Date();
    const localNow = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const time = formatTime(localNow, use24h);
    const hmEl = el.querySelector('.it-hm');
    const secEl = el.querySelector('.it-sec');
    if (hmEl) hmEl.textContent = time.hm + (time.ampm ? ` ${time.ampm}` : '');
    if (secEl) secEl.textContent = `:${time.sec}`;
  }

  /* Update strip cards */
  function updateStripCard(el) {
    const tz = resolveTZ(el.dataset.tz);
    const use24h = el.dataset.format24 === 'true';
    const now = new Date();
    const localNow = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const period = getTimePeriod(localNow.getHours());
    const time = formatTime(localNow, use24h);
    const date = formatDate(localNow, tz);
    const dow = formatDayOfWeek(localNow, tz);

    const timeEl = el.querySelector('.wcs-time');
    const dateEl = el.querySelector('.wcs-date');
    const dowEl = el.querySelector('.wcs-dow');
    const dnEl = el.querySelector('.wcs-daynight');

    if (timeEl) timeEl.innerHTML = `${time.hm}<span class="lcw-time-colon">:</span><span class="lcw-time-sec">${time.sec}</span>${time.ampm ? ` <span style="font-size:12px;color:var(--text-muted);margin-left:4px">${time.ampm}</span>` : ''}`;
    if (dateEl) dateEl.textContent = date;
    if (dowEl) dowEl.textContent = dow;
    if (dnEl) {
      dnEl.classList.remove('is-day', 'is-night', 'is-dawn', 'is-dusk');
      dnEl.classList.add(`is-${period}`);
    }
  }

  /* Update comparison sides */
  function updateCompareSide(el) {
    const tz = resolveTZ(el.dataset.tz);
    const use24h = el.dataset.format24 === 'true';
    const now = new Date();
    const localNow = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const period = getTimePeriod(localNow.getHours());
    const time = formatTime(localNow, use24h);
    const date = formatDate(localNow, tz);

    const timeEl = el.querySelector('.lcc-time');
    const dateEl = el.querySelector('.lcc-date');
    const dnEl = el.querySelector('.lcc-daynight');
    const iconEl = el.querySelector('.lcc-daynight .lcw-daynight-icon');

    if (timeEl) timeEl.innerHTML = `${time.hm}<span class="lcw-time-colon">:</span><span class="lcw-time-sec">${time.sec}</span>${time.ampm ? ` <span style="font-size:14px;color:var(--text-muted);margin-left:4px">${time.ampm}</span>` : ''}`;
    if (dateEl) dateEl.textContent = date;
    if (dnEl) {
      dnEl.classList.remove('is-day', 'is-night', 'is-dawn', 'is-dusk');
      dnEl.classList.add(`is-${period}`);
    }
    if (iconEl) iconEl.textContent = getPeriodIcon(period);
  }

  /* Initialize all clock widgets in a container (or document) */
  function init(container = document) {
    /* Single widgets */
    container.querySelectorAll('.live-clock-widget[data-tz]').forEach(el => {
      if (intervals.has(el)) return;
      updateWidget(el);
      const id = setInterval(() => updateWidget(el), 1000);
      intervals.set(el, id);
    });

    /* Inline times */
    container.querySelectorAll('.inline-time[data-tz]').forEach(el => {
      if (intervals.has(el)) return;
      updateInline(el);
      const id = setInterval(() => updateInline(el), 1000);
      intervals.set(el, id);
    });

    /* Strip cards */
    container.querySelectorAll('.wcs-card[data-tz]').forEach(el => {
      if (intervals.has(el)) return;
      updateStripCard(el);
      const id = setInterval(() => updateStripCard(el), 1000);
      intervals.set(el, id);
    });

    /* Compare sides */
    container.querySelectorAll('.lcc-side[data-tz]').forEach(el => {
      if (intervals.has(el)) return;
      updateCompareSide(el);
      const id = setInterval(() => updateCompareSide(el), 1000);
      intervals.set(el, id);
    });

    /* Update compare diff labels */
    updateCompareDiffs(container);
  }

  function updateCompareDiffs(container = document) {
    container.querySelectorAll('.live-clock-compare').forEach(comp => {
      const sides = comp.querySelectorAll('.lcc-side[data-tz]');
      if (sides.length < 2) return;
      const tz1 = resolveTZ(sides[0].dataset.tz);
      const tz2 = resolveTZ(sides[1].dataset.tz);
      const diff1 = getRelativeDiff(tz1);
      const diff2 = getRelativeDiff(tz2);
      const totalDiff = Math.abs(diff1 - diff2);
      const hrs = Math.floor(totalDiff);
      const mins = Math.round((totalDiff - hrs) * 60);
      let diffStr = '';
      if (hrs > 0) diffStr += `${hrs}h`;
      if (mins > 0) diffStr += ` ${mins}m`;
      if (!diffStr) diffStr = '0m';

      const labelEl = comp.querySelector('.lcc-diff-label');
      const footerEl = comp.querySelector('.lcc-footer-diff');
      if (labelEl) labelEl.textContent = diffStr;
      if (footerEl) footerEl.textContent = diffStr;
    });
  }

  /* Cleanup clocks in a container (for message deletion) */
  function destroy(container = document) {
    container.querySelectorAll('.live-clock-widget[data-tz], .inline-time[data-tz], .wcs-card[data-tz], .lcc-side[data-tz]').forEach(el => {
      if (intervals.has(el)) {
        clearInterval(intervals.get(el));
        intervals.delete(el);
      }
    });
  }

  /* Auto-init on DOMContentLoaded and observe for new messages */
  function autoInit() {
    init();
    /* Observe message container for new clock widgets */
    const observer = new MutationObserver(mutations => {
      mutations.forEach(m => {
        m.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            if (node.matches && (node.matches('.live-clock-widget, .inline-time, .wcs-card, .lcc-side, .msg'))) {
              init(node);
            }
            if (node.querySelectorAll) {
              const hasClocks = node.querySelector('.live-clock-widget[data-tz], .inline-time[data-tz], .wcs-card[data-tz], .lcc-side[data-tz]');
              if (hasClocks) init(node);
            }
          }
        });
        m.removedNodes.forEach(node => {
          if (node.nodeType === 1) destroy(node);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }

  /* Expose public API */
  return { init, destroy, resolveTZ, getRelativeDiff };
})();
