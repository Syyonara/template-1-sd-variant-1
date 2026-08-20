/* Platform widget + form client. Zero dependencies, ~one job each.
 *
 * Everything here is progressive: the served markup already carries the facts
 * (addresses, phone numbers, questions and answers came from the snapshot the
 * dashboard committed), so this script refreshes and activates rather than
 * populates. With JavaScript off, the page is still complete.
 *
 * Every request goes to the same-origin storefront prefix on the dealer's own
 * domain, which the dealer's vercel.json rewrites to the Remix app. That keeps
 * the visitor cookie first-party, and the dealer is resolved from the request
 * hostname — no client-supplied value ever names a channel.
 *
 * Platform-owned: this file is not in the editor's writable path set. */
(function () {
  'use strict';

  var PREFIX = (function () {
    var el = document.querySelector('[data-bz-prefix]');
    return (el && el.getAttribute('data-bz-prefix')) || 'store';
  })();
  var API = '/' + PREFIX;

  function json(res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  function text(value) {
    return document.createTextNode(value == null ? '' : String(value));
  }

  function el(tag, className, content) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.appendChild(text(content));
    return node;
  }

  /* ------------------------------------------------------------- widgets */

  function readConfig(node) {
    try {
      return JSON.parse(node.getAttribute('data-bz-config') || '{}');
    } catch (e) {
      return {};
    }
  }

  /** OpenStreetMap embed built from the snapshot's coordinates — no API key, no SDK. */
  function mountMap(node, locations) {
    var target = node.querySelector('[data-bz-map]');
    if (!target || target.dataset.bzMounted) return;
    var points = (locations || []).filter(function (l) {
      return l.latitude != null && l.longitude != null;
    });
    if (!points.length) return;

    var lats = points.map(function (p) { return Number(p.latitude); });
    var lons = points.map(function (p) { return Number(p.longitude); });
    var pad = 0.08;
    var bbox = [
      Math.min.apply(null, lons) - pad,
      Math.min.apply(null, lats) - pad,
      Math.max.apply(null, lons) + pad,
      Math.max.apply(null, lats) + pad,
    ].join(',');

    var frame = document.createElement('iframe');
    frame.src =
      'https://www.openstreetmap.org/export/embed.html?bbox=' +
      encodeURIComponent(bbox) +
      '&layer=mapnik' +
      (points.length === 1
        ? '&marker=' + encodeURIComponent(points[0].latitude + ',' + points[0].longitude)
        : '');
    frame.title = 'Map of our locations';
    frame.loading = 'lazy';
    frame.style.cssText = 'width:100%;height:100%;border:0;display:block';
    frame.setAttribute('referrerpolicy', 'no-referrer');
    target.textContent = '';
    target.removeAttribute('role');
    target.removeAttribute('aria-label');
    target.appendChild(frame);
    target.dataset.bzMounted = '1';
  }

  function renderListings(node, listings) {
    var list = node.querySelector('ul');
    if (!list || !listings || !listings.length) return;
    list.textContent = '';
    listings.forEach(function (l) {
      var li = document.createElement('li');
      var a = el('a', 'bz-card');
      a.href = API + '/' + l.slug;
      a.setAttribute('data-bz-el', 'link');
      a.setAttribute('data-bz-intent', 'view-listing');
      if (l.image && l.image.src) {
        var img = document.createElement('img');
        img.src = l.image.src;
        img.alt = l.image.alt || l.title || '';
        img.loading = 'lazy';
        img.width = l.image.width || 600;
        img.height = l.image.height || 400;
        a.appendChild(img);
      }
      var body = el('div', 'bz-card__body');
      body.appendChild(el('span', 'bz-card__t', l.title));
      if (l.price) body.appendChild(el('span', 'bz-card__m', l.price));
      a.appendChild(body);
      li.appendChild(a);
      list.appendChild(li);
    });
  }

  function hydrate(node) {
    var widget = node.getAttribute('data-bz-widget');
    var config = readConfig(node);

    fetch(API + '/widgets/' + encodeURIComponent(widget), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ config: config }),
    })
      .then(json)
      .then(function (data) {
        if (!data || data.error) return;
        if (widget === 'locations-map') mountMap(node, data.locations);
        if (widget === 'inventory-carousel') renderListings(node, data.listings);
        node.setAttribute('data-bz-hydrated', '1');
      })
      .catch(function () {
        // A failed refresh leaves the committed snapshot on screen, which is the
        // correct outcome: stale facts beat an empty section.
      });
  }

  /* --------------------------------------------------------------- forms */

  function fieldValue(form, fieldId) {
    var wrap = form.querySelector('[data-bz-field="' + fieldId + '"]');
    if (!wrap) return '';
    var checked = wrap.querySelectorAll('input[type=checkbox]:checked, input[type=radio]:checked');
    if (checked.length) {
      return Array.prototype.map
        .call(checked, function (c) { return c.value; })
        .join(',');
    }
    var input = wrap.querySelector('input, select, textarea');
    return input ? input.value : '';
  }

  var OPERATORS = {
    is: function (a, b) { return String(a) === String(b); },
    is_not: function (a, b) { return String(a) !== String(b); },
    contains: function (a, b) { return String(a).toLowerCase().indexOf(String(b).toLowerCase()) > -1; },
    greater_than: function (a, b) { return Number(a) > Number(b); },
    less_than: function (a, b) { return Number(a) < Number(b); },
    before: function (a, b) { return String(a) < String(b); },
    after: function (a, b) { return String(a) > String(b); },
    is_empty: function (a) { return !String(a).trim(); },
    is_not_empty: function (a) { return !!String(a).trim(); },
  };

  /** Conditional logic travels as JSON on the field, so one client serves every dealer. */
  function applyLogic(form) {
    var fields = form.querySelectorAll('[data-bz-logic]');
    Array.prototype.forEach.call(fields, function (wrap) {
      var logic;
      try {
        logic = JSON.parse(wrap.getAttribute('data-bz-logic'));
      } catch (e) {
        return;
      }
      var rules = (logic && logic.rules) || [];
      if (!rules.length) return;
      var results = rules.map(function (r) {
        var op = OPERATORS[r.operator];
        return op ? !!op(fieldValue(form, r.fieldId), r.value) : false;
      });
      var pass =
        logic.logic === 'OR'
          ? results.some(Boolean)
          : results.every(Boolean);
      var show = logic.action === 'hide' ? !pass : pass;
      wrap.hidden = !show;
      // A hidden required field would block submission with no visible cause.
      Array.prototype.forEach.call(wrap.querySelectorAll('[required]'), function (input) {
        input.disabled = !show;
      });
    });
  }

  function submitForm(form) {
    var status = form.querySelector('.bz-form__status');
    var button = form.querySelector('button[type=submit]');
    var data = new FormData(form);
    if (button) button.disabled = true;
    if (status) {
      status.removeAttribute('data-state');
      status.textContent = 'Sending…';
    }

    fetch(form.getAttribute('action'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
      body: data,
    })
      .then(json)
      .then(function (res) {
        if (res && res.ok) {
          form.setAttribute('data-state', 'sent');
          if (status) {
            status.setAttribute('data-state', 'ok');
            status.textContent = form.getAttribute('data-bz-success') || 'Thanks — we will be in touch.';
          }
          return;
        }
        throw new Error((res && res.message) || 'Submission failed');
      })
      .catch(function (err) {
        if (button) button.disabled = false;
        if (status) {
          status.setAttribute('data-state', 'error');
          status.textContent = err.message || 'Something went wrong. Please try again.';
        }
      });
  }

  function bindForm(form) {
    applyLogic(form);
    form.addEventListener('input', function () { applyLogic(form); });
    form.addEventListener('change', function () { applyLogic(form); });
    form.addEventListener('submit', function (event) {
      // Let the browser enforce validation first; only then take over the POST so
      // a non-JS submit still reaches the same endpoint.
      if (!form.checkValidity()) return;
      event.preventDefault();
      submitForm(form);
    });
  }

  /** A library CTA whose destination is a form scrolls to and focuses that form. */
  function bindFormCtas() {
    Array.prototype.forEach.call(document.querySelectorAll('a[data-bz-form]'), function (link) {
      link.addEventListener('click', function (event) {
        var id = link.getAttribute('data-bz-form');
        var form = document.getElementById('form-' + id);
        if (!form) return;
        event.preventDefault();
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        var first = form.querySelector('input:not([type=hidden]), select, textarea');
        if (first) first.focus({ preventScroll: true });
      });
    });
  }

  /* ----------------------------------------------------------------- nav */

  /** The mobile menu button, and dropdowns on touch, where there is no hover. */
  function bindMenus() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-bz-collapse]'), function (wrap) {
      var toggle = wrap.querySelector('.bz-menu-toggle');
      if (!toggle) return;
      toggle.addEventListener('click', function () {
        var open = wrap.hasAttribute('data-open');
        if (open) wrap.removeAttribute('data-open');
        else wrap.setAttribute('data-open', '');
        toggle.setAttribute('aria-expanded', String(!open));
      });
    });

    // A parent with a submenu is a link *and* a disclosure. On a pointer device
    // hover opens it and the link still works; on touch there is no hover, so
    // the first tap opens and the second follows.
    if (!window.matchMedia || !window.matchMedia('(hover: none)').matches) return;
    Array.prototype.forEach.call(document.querySelectorAll('.bz-navitem--has-sub'), function (item) {
      var link = item.querySelector(':scope > a');
      if (!link) return;
      link.addEventListener('click', function (event) {
        if (item.hasAttribute('data-open')) return;
        event.preventDefault();
        item.setAttribute('data-open', '');
      });
    });
  }

  /* ---------------------------------------------------------- behaviours */

  /* Eight behaviours behind one markup contract.
   *
   * A design handoff needs a carousel, a filter bar, a mega menu, a mobile
   * drawer. Shipping a widget per design would mean a component library that
   * grows with every dealer and an accessibility bug fixed once per copy. So
   * the split is: appearance belongs to whoever authored the markup — a
   * platform block, a dealer's custom widget, an AI import — and behaviour
   * belongs here, written once.
   *
   * A node opts in with `data-bz-behavior="carousel"` (space-separated for more
   * than one) and marks its moving pieces with `data-bz-part="track|slide|…"`.
   * Options ride along as JSON in `data-bz-behavior-options`. Nothing else is
   * required, and none of it is a class name, so restyling can never break the
   * wiring.
   *
   * Every behaviour is progressive: the markup renders complete and readable
   * with JavaScript off, and blocks.css gives dropdowns and drawers a
   * hover/focus-within fallback so a keyboard still reaches them. */

  function behaviourOptions(node) {
    try {
      return JSON.parse(node.getAttribute('data-bz-behavior-options') || '{}');
    } catch (e) {
      return {};
    }
  }

  /**
   * Parts belong to their *nearest* behaviour root.
   *
   * Without this, a rotator inside a carousel slide would steal the carousel's
   * prev/next buttons — and nesting behaviours is normal in real designs.
   */
  // `~=` rather than `=`: data-bz-part holds a space-separated list, so one
  // element can play more than one role. A drilldown needs exactly that — the
  // state button in a region/state/city nav is an `item` (hidden when its region
  // is not chosen) and a `control` (choosing it filters the cities) at the same
  // time. Matching the whole attribute made that shape impossible to express.
  function parts(root, name) {
    return Array.prototype.filter.call(
      root.querySelectorAll('[data-bz-part~="' + name + '"]'),
      function (node) {
        return node.closest('[data-bz-behavior]') === root;
      },
    );
  }

  function part(root, name) {
    return parts(root, name)[0] || null;
  }

  var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function scrollMode() {
    return REDUCED ? 'auto' : 'smooth';
  }

  function emit(node, name, detail) {
    node.dispatchEvent(new CustomEvent('bz:' + name, { bubbles: true, detail: detail || {} }));
  }

  function setFlag(node, attribute, on) {
    if (on) node.setAttribute(attribute, '');
    else node.removeAttribute(attribute);
  }

  function tokens(value) {
    return String(value || '')
      .split(/[,\s]+/)
      .filter(Boolean)
      .map(function (v) { return v.toLowerCase(); });
  }

  /* -- carousel: a scroll-snap rail with arrows, dots and keyboard support -- */

  function carousel(root) {
    var opts = behaviourOptions(root);
    var track = part(root, 'track') || root;
    var slides = parts(root, 'slide');
    if (!slides.length) return;

    root.setAttribute('data-bz-carousel', '');
    track.setAttribute('data-bz-track', '');
    // A scrollable region has to be reachable and announced, or arrow keys and
    // screen readers have nothing to hold on to.
    if (!track.hasAttribute('tabindex')) track.setAttribute('tabindex', '0');
    if (!track.hasAttribute('role')) track.setAttribute('role', 'group');
    if (!track.hasAttribute('aria-label')) track.setAttribute('aria-label', opts.label || 'Carousel');

    var prev = part(root, 'prev');
    var next = part(root, 'next');
    var dotsHost = part(root, 'dots');
    var perMove = Number(opts.perMove) > 0 ? Number(opts.perMove) : 1;

    function stride() {
      if (slides.length > 1) {
        var delta = Math.abs(slides[1].offsetLeft - slides[0].offsetLeft);
        if (delta > 1) return delta;
      }
      return slides[0].offsetWidth || track.clientWidth;
    }

    function index() {
      var width = stride();
      return width ? Math.round(track.scrollLeft / width) : 0;
    }

    var dots = [];
    if (dotsHost && !dotsHost.children.length) {
      slides.forEach(function (slide, i) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'bz-dot';
        dot.setAttribute('data-bz-part', 'dot');
        dot.setAttribute('aria-label', 'Go to item ' + (i + 1));
        dot.addEventListener('click', function () {
          track.scrollTo({ left: slide.offsetLeft - track.offsetLeft, behavior: scrollMode() });
        });
        dotsHost.appendChild(dot);
        dots.push(dot);
      });
    } else if (dotsHost) {
      dots = parts(root, 'dot');
    }

    function sync() {
      var current = index();
      var start = track.scrollLeft <= 2;
      var end = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
      // Disabled rather than hidden: buttons that vanish shift the layout, and
      // a control that disappears mid-interaction loses keyboard focus.
      if (prev) prev.disabled = start;
      if (next) next.disabled = end;
      setFlag(root, 'data-bz-at-start', start);
      setFlag(root, 'data-bz-at-end', end);
      dots.forEach(function (dot, i) {
        dot.setAttribute('aria-current', String(i === current));
      });
    }

    function go(direction) {
      track.scrollBy({ left: direction * stride() * perMove, behavior: scrollMode() });
    }

    if (prev) prev.addEventListener('click', function () { go(-1); });
    if (next) next.addEventListener('click', function () { go(1); });

    track.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowRight') { event.preventDefault(); go(1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1); }
    });

    var frame = null;
    track.addEventListener(
      'scroll',
      function () {
        if (frame) return;
        frame = window.requestAnimationFrame(function () {
          frame = null;
          sync();
        });
      },
      { passive: true },
    );
    window.addEventListener('resize', sync, { passive: true });
    sync();
  }

  /* -- filter: any number of facets over any number of items, with a count -- */

  function filterBehaviour(root) {
    var opts = behaviourOptions(root);
    var controls = parts(root, 'control');
    var items = parts(root, 'item');
    var countHost = part(root, 'count');
    var emptyHost = part(root, 'empty');
    if (!controls.length || !items.length) return;

    var matchAny = opts.match === 'any';
    var state = {};

    function itemValues(item, facet) {
      return tokens(item.getAttribute('data-' + facet));
    }

    function matches(item) {
      var active = Object.keys(state).filter(function (facet) { return state[facet]; });
      if (!active.length) return true;
      var results = active.map(function (facet) {
        return itemValues(item, facet).indexOf(state[facet]) > -1;
      });
      return matchAny ? results.some(Boolean) : results.every(Boolean);
    }

    function apply() {
      var shown = 0;
      items.forEach(function (item) {
        var visible = matches(item);
        item.hidden = !visible;
        if (visible) shown += 1;
      });
      if (countHost) {
        var template = countHost.getAttribute('data-bz-count-template');
        countHost.textContent = template ? template.replace('{n}', String(shown)) : String(shown);
      }
      if (emptyHost) emptyHost.hidden = shown > 0;
      controls.forEach(function (control) {
        var facet = control.getAttribute('data-bz-facet') || 'tag';
        var value = (control.getAttribute('data-bz-value') || '').toLowerCase();
        var isReset = !value || value === 'all';
        var on = isReset ? !state[facet] : state[facet] === value;
        control.setAttribute('aria-pressed', String(on));
        setFlag(control, 'data-bz-active', on);
      });
      emit(root, 'filter', { state: state, shown: shown, total: items.length });
    }

    controls.forEach(function (control) {
      if (control.tagName === 'BUTTON' && !control.getAttribute('type')) control.type = 'button';
      control.addEventListener('click', function () {
        var facet = control.getAttribute('data-bz-facet') || 'tag';
        var value = (control.getAttribute('data-bz-value') || '').toLowerCase();
        // An "all" chip clears its facet; clicking the active chip again also
        // clears it, which is what people expect from a toggle.
        if (!value || value === 'all' || state[facet] === value) delete state[facet];
        else state[facet] = value;
        apply();
      });
    });

    apply();
  }

  /* ------ dropdown: one or many panels, for nav flyouts and mega menus ----- */

  function dropdown(root) {
    var opts = behaviourOptions(root);
    var triggers = parts(root, 'trigger');
    var panels = parts(root, 'panel');
    if (!triggers.length || !panels.length) return;

    root.setAttribute('data-bz-dropdown', '');
    var hoverable = opts.trigger === 'hover' && window.matchMedia && !window.matchMedia('(hover: none)').matches;
    var open = null;

    function panelNamed(name) {
      if (!name) return panels[0];
      return (
        panels.filter(function (p) { return p.getAttribute('data-bz-panel') === name; })[0] || panels[0]
      );
    }

    function close() {
      if (!open) return;
      setFlag(open.panel, 'data-open', false);
      open.trigger.setAttribute('aria-expanded', 'false');
      setFlag(root, 'data-bz-open', false);
      open = null;
    }

    function show(trigger) {
      var panel = panelNamed(trigger.getAttribute('data-bz-target'));
      if (!panel) return;
      if (open && open.panel === panel) return close();
      close();
      setFlag(panel, 'data-open', true);
      trigger.setAttribute('aria-expanded', 'true');
      setFlag(root, 'data-bz-open', true);
      open = { trigger: trigger, panel: panel };
    }

    triggers.forEach(function (trigger, i) {
      if (trigger.tagName === 'BUTTON' && !trigger.getAttribute('type')) trigger.type = 'button';
      var panel = panelNamed(trigger.getAttribute('data-bz-target'));
      if (panel) {
        if (!panel.id) panel.id = 'bz-panel-' + (root.id || 'x') + '-' + i;
        trigger.setAttribute('aria-controls', panel.id);
        trigger.setAttribute('aria-haspopup', 'true');
      }
      if (!trigger.hasAttribute('aria-expanded')) trigger.setAttribute('aria-expanded', 'false');

      trigger.addEventListener('click', function (event) {
        event.preventDefault();
        show(trigger);
      });
      if (hoverable) {
        trigger.addEventListener('mouseenter', function () { show(trigger); });
      }
    });

    if (hoverable) {
      root.addEventListener('mouseleave', close);
    }

    // Escape returns focus to the trigger that opened the panel — losing focus
    // to the top of the document is the classic keyboard-user complaint.
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || !open) return;
      var trigger = open.trigger;
      close();
      trigger.focus();
    });

    if (opts.closeOnOutside !== false) {
      document.addEventListener('click', function (event) {
        if (!open || root.contains(event.target)) return;
        close();
      });
    }
  }

  /* ---------------- drawer: the mobile nav and other off-canvas ------------ */

  function drawer(root) {
    var opts = behaviourOptions(root);
    var toggle = part(root, 'toggle');
    var panel = part(root, 'panel');
    if (!toggle || !panel) return;

    root.setAttribute('data-bz-drawer', '');
    if (!panel.id) panel.id = 'bz-drawer-' + Math.random().toString(36).slice(2, 8);
    toggle.setAttribute('aria-controls', panel.id);
    if (toggle.tagName === 'BUTTON' && !toggle.getAttribute('type')) toggle.type = 'button';

    function set(open) {
      setFlag(root, 'data-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      if (opts.lockScroll) document.documentElement.style.overflow = open ? 'hidden' : '';
    }

    set(false);
    toggle.addEventListener('click', function () {
      set(!root.hasAttribute('data-open'));
    });

    parts(root, 'close').forEach(function (button) {
      button.addEventListener('click', function () { set(false); });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && root.hasAttribute('data-open')) {
        set(false);
        toggle.focus();
      }
    });

    // Reaching desktop width with the drawer still open leaves an open panel
    // over a nav that is now visible anyway.
    var wide = window.matchMedia && window.matchMedia('(min-width: ' + (opts.until || 1101) + 'px)');
    if (wide && wide.addEventListener) {
      wide.addEventListener('change', function (event) {
        if (event.matches) set(false);
      });
    }
  }

  /* ------- rotator: one item at a time, for testimonials and quotes ------- */

  function rotator(root) {
    var opts = behaviourOptions(root);
    var slides = parts(root, 'slide');
    if (slides.length < 2) return;

    root.setAttribute('data-bz-rotator', '');
    var live = part(root, 'live') || root;
    live.setAttribute('aria-live', 'polite');

    var dotsHost = part(root, 'dots');
    var dots = [];
    var current = 0;

    function show(next) {
      current = (next + slides.length) % slides.length;
      slides.forEach(function (slide, i) {
        slide.hidden = i !== current;
      });
      dots.forEach(function (dot, i) {
        dot.setAttribute('aria-current', String(i === current));
      });
    }

    if (dotsHost && !dotsHost.children.length) {
      slides.forEach(function (_slide, i) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'bz-dot';
        dot.setAttribute('aria-label', 'Show item ' + (i + 1));
        dot.addEventListener('click', function () { show(i); stop(); });
        dotsHost.appendChild(dot);
        dots.push(dot);
      });
    }

    var prev = part(root, 'prev');
    var next = part(root, 'next');
    if (prev) prev.addEventListener('click', function () { show(current - 1); stop(); });
    if (next) next.addEventListener('click', function () { show(current + 1); stop(); });

    var timer = null;
    function stop() {
      if (timer) window.clearInterval(timer);
      timer = null;
    }
    function start() {
      // Autoplay is opt-in, and never runs for someone who asked for less
      // motion or while the tab is in the background.
      var every = Number(opts.autoplay);
      if (!every || REDUCED) return;
      stop();
      timer = window.setInterval(function () {
        if (!document.hidden) show(current + 1);
      }, Math.max(2000, every));
    }

    root.addEventListener('mouseenter', stop);
    root.addEventListener('focusin', stop);
    root.addEventListener('mouseleave', start);

    show(0);
    start();
  }

  /* ------ scrollstate: back-to-top, shrinking headers, reveal-on-scroll ---- */

  function scrollstate(root) {
    var opts = behaviourOptions(root);
    var after = Number(opts.after) >= 0 ? Number(opts.after) : 400;
    var frame = null;

    function apply() {
      setFlag(root, 'data-bz-scrolled', (window.scrollY || window.pageYOffset || 0) > after);
    }

    window.addEventListener(
      'scroll',
      function () {
        if (frame) return;
        frame = window.requestAnimationFrame(function () {
          frame = null;
          apply();
        });
      },
      { passive: true },
    );

    parts(root, 'totop').forEach(function (button) {
      if (button.tagName === 'BUTTON' && !button.getAttribute('type')) button.type = 'button';
      button.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: scrollMode() });
      });
    });

    apply();
  }

  /* --- dependentselect: a second select whose options depend on the first -- */

  function dependentselect(root) {
    var parents = parts(root, 'parent');
    var children = parts(root, 'child');
    if (!parents.length || !children.length) return;

    children.forEach(function (child) {
      // The full option list has to be kept in hand: filtering by removal is
      // destructive, and the visitor may change the parent back again.
      child._bzOptions = Array.prototype.slice.call(child.options);
    });

    function refresh(parent) {
      var group = parent.getAttribute('data-bz-controls');
      var value = (parent.value || '').toLowerCase();
      children
        .filter(function (child) { return !group || child.getAttribute('data-bz-group') === group; })
        .forEach(function (child) {
          var kept = child._bzOptions.filter(function (option) {
            var when = option.getAttribute('data-bz-when');
            if (!when) return true;
            return !value ? false : tokens(when).indexOf(value) > -1;
          });
          var previous = child.value;
          child.textContent = '';
          kept.forEach(function (option) { child.appendChild(option); });
          child.disabled = kept.length <= 1 && !value;
          var stillThere = kept.some(function (option) { return option.value === previous; });
          child.value = stillThere ? previous : kept.length ? kept[0].value : '';
          emit(child, 'dependentchange', { value: child.value });
        });
    }

    parents.forEach(function (parent) {
      parent.addEventListener('change', function () { refresh(parent); });
      refresh(parent);
    });
  }

  /* -- mapsync: bridge filter state to a map in an iframe, both directions -- */

  function mapsync(root) {
    var opts = behaviourOptions(root);
    var frame = part(root, 'frame') || root.querySelector('iframe');
    if (!frame) return;

    // postMessage rather than reaching into contentWindow: the map may be
    // served from another origin, where a direct function call is blocked.
    var origin = (function () {
      try {
        return new URL(frame.getAttribute('src') || '', window.location.href).origin;
      } catch (e) {
        return window.location.origin;
      }
    })();

    var source = opts.source ? document.querySelector(opts.source) : null;
    var ready = false;
    var pending = null;

    function post(payload) {
      if (!ready) {
        pending = payload;
        return;
      }
      try {
        frame.contentWindow.postMessage(payload, origin);
      } catch (e) {
        /* A map that refuses the message is not a reason to break the page. */
      }
    }

    frame.addEventListener('load', function () {
      ready = true;
      if (pending) {
        post(pending);
        pending = null;
      }
    });

    document.addEventListener('bz:filter', function (event) {
      if (source && event.target !== source) return;
      post({ type: opts.message || 'bz:filter', detail: event.detail });
    });

    // The map talks back — a clicked pin selects that item in the page.
    window.addEventListener('message', function (event) {
      if (event.origin !== origin || !event.data || typeof event.data !== 'object') return;
      if (event.data.type !== 'bz:select') return;
      emit(root, 'mapselect', event.data);
    });
  }

  var BEHAVIOURS = {
    carousel: carousel,
    filter: filterBehaviour,
    dropdown: dropdown,
    drawer: drawer,
    rotator: rotator,
    scrollstate: scrollstate,
    dependentselect: dependentselect,
    mapsync: mapsync,
  };

  /**
   * Bind every behaviour inside `scope`, once.
   *
   * Exposed on `window.BuzzNerd` so the editor canvas and anything that injects
   * markup after load can activate it without a reload — an imported section
   * has to come alive in the builder, not only on the published page.
   */
  function initBehaviours(scope) {
    var host = scope || document;
    Array.prototype.forEach.call(host.querySelectorAll('[data-bz-behavior]'), function (root) {
      if (root.hasAttribute('data-bz-bound')) return;
      var bound = [];
      (root.getAttribute('data-bz-behavior') || '')
        .split(/\s+/)
        .filter(Boolean)
        .forEach(function (name) {
          var fn = BEHAVIOURS[name];
          if (!fn) return;
          try {
            fn(root);
            bound.push(name);
          } catch (error) {
            // One malformed section must not take the rest of the page with it.
            if (window.console) window.console.warn('[buzznerd] behaviour "' + name + '" failed', error);
          }
        });
      if (bound.length) root.setAttribute('data-bz-bound', bound.join(' '));
    });
  }

  /* ---------------------------------------------------------------- init */

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-bz-hydrate]'), hydrate);
    Array.prototype.forEach.call(document.querySelectorAll('form.bz-form'), bindForm);
    bindFormCtas();
    bindMenus();
    initBehaviours(document);
  }

  window.BuzzNerd = window.BuzzNerd || {};
  window.BuzzNerd.initBehaviours = initBehaviours;
  window.BuzzNerd.behaviours = Object.keys(BEHAVIOURS);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
