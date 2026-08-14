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

  /* ---------------------------------------------------------------- init */

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-bz-hydrate]'), hydrate);
    Array.prototype.forEach.call(document.querySelectorAll('form.bz-form'), bindForm);
    bindFormCtas();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
