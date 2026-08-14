// The widget host.
//
// A widget is a page element backed by platform data a static build cannot
// reach: the dealer's locations, staff, opening hours, live inventory. The build
// runs on Vercel with no privileged credentials, so the data arrives by two
// routes and never by a build-time API call:
//
//   snapshot   The dashboard resolves the data when it saves the page and commits
//              it into the block's props. This is what puts real addresses and
//              phone numbers in the served markup — useful without JavaScript,
//              and extractable by answer engines.
//   hydration  The platform client script refreshes the widget in the browser
//              through the same-origin /store proxy, so the request is
//              first-party and the dealer is resolved from the hostname alone.
//
// Widget descriptors (prop schemas, which surfaces a widget is allowed on) live
// in Vendure, because plugins register them. This module owns only the markup.

import { attrs, cls, esc, image, join, tagAttrs } from './html.mjs';
import { renderForm } from './forms.mjs';

/** Widgets that install behaviour and render nothing a buyer sees. */
export const BEHAVIOUR_ONLY = new Set(['heatmaps', 'code-snippet']);

function shell(widget, config, inner, opts = {}) {
  return `<div class="${cls('bz-widget', `bz-widget--${widget}`, opts.class)}"${attrs({
    'data-bz-widget': widget,
    'data-bz-config': JSON.stringify(config || {}),
    'data-bz-hydrate': opts.hydrate === false ? null : true,
    'data-bz-region': 'widget',
  })}>${inner}</div>`;
}

/* ------------------------------------------------------------- placeholders */

function locationsMap(config, snapshot, ctx) {
  const locations = (snapshot && snapshot.locations) || [];
  const list = locations.length
    ? `<ul class="bz-loclist bz-bare">${join(
        locations.map(
          (l) =>
            `<li class="bz-loc"><span class="bz-loc__c">${esc(l.name || l.city)}</span>${
              l.streetAddress
                ? `<address class="bz-loc__a">${esc(l.streetAddress)}, ${esc(
                    l.city || '',
                  )} ${esc(l.region || '')} ${esc(l.postalCode || '')}</address>`
                : ''
            }${
              l.phone
                ? `<a class="bz-loc__p" href="tel:${esc(l.phone.replace(/[^+\d]/g, ''))}"${attrs(
                    tagAttrs('phone', 'call-location'),
                  )}>${esc(l.phone)}</a>`
                : ''
            }${l.services ? `<span class="bz-loc__s">${esc(l.services)}</span>` : ''}</li>`,
        ),
        '',
      )}</ul>`
    : `<p class="bz-widget__empty">Locations load here.</p>`;

  const map =
    config.showMap === false
      ? ''
      : `<div class="bz-map" data-bz-map role="img" aria-label="Map of our locations"></div>`;

  return shell(
    'locations-map',
    config,
    `${config.heading ? `<p class="bz-widget__h">${esc(config.heading)}</p>` : ''}${map}${list}`,
  );
}

function staff(config, snapshot) {
  const people = (snapshot && snapshot.staff) || [];
  const cards = people.map(
    (p) =>
      `<li class="bz-person">${image(p.photo, { width: 128, height: 128, placeholder: '' })}<span class="bz-person__n">${esc(
        p.name,
      )}</span>${p.title ? `<span class="bz-person__t">${esc(p.title)}</span>` : ''}${
        p.phone
          ? `<a class="bz-person__p" href="tel:${esc(p.phone.replace(/[^+\d]/g, ''))}"${attrs(
              tagAttrs('phone', 'call-staff'),
            )}>${esc(p.phone)}</a>`
          : ''
      }</li>`,
  );
  return shell(
    'staff',
    config,
    `${config.heading ? `<p class="bz-widget__h">${esc(config.heading)}</p>` : ''}${
      cards.length
        ? `<ul class="bz-people bz-bare">${join(cards, '')}</ul>`
        : '<p class="bz-widget__empty">Team members load here.</p>'
    }`,
  );
}

function faq(config, snapshot) {
  const items = (config.items && config.items.length ? config.items : (snapshot && snapshot.items)) || [];
  if (!items.length) {
    return shell('faq', config, '<p class="bz-widget__empty">Questions load here.</p>');
  }
  // FAQPage schema goes with the markup that answers the question, so the facts
  // and the structured data cannot drift apart.
  const ld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({
      '@type': 'Question',
      name: i.q,
      acceptedAnswer: { '@type': 'Answer', text: i.a },
    })),
  });
  return shell(
    'faq',
    config,
    `${config.heading ? `<p class="bz-widget__h">${esc(config.heading)}</p>` : ''}<div class="bz-faqs">${join(
      items.map(
        (i) =>
          `<details class="bz-faq"><summary${attrs(
            tagAttrs('faq', 'expand-question'),
          )}>${esc(i.q)}</summary><div class="bz-faq__a">${esc(i.a)}</div></details>`,
      ),
      '',
    )}</div><script type="application/ld+json">${ld}</script>`,
    { hydrate: false },
  );
}

function phoneNumbers(config, snapshot) {
  const numbers = (snapshot && snapshot.numbers) || [];
  return shell(
    'phone-numbers',
    config,
    numbers.length
      ? `<ul class="bz-phones bz-bare">${join(
          numbers.map(
            (n) =>
              `<li class="bz-phone"><span class="bz-phone__l">${esc(n.label)}</span><a href="tel:${esc(
                String(n.number).replace(/[^+\d]/g, ''),
              )}"${attrs(tagAttrs('phone', 'call-department'))}>${esc(n.number)}</a></li>`,
          ),
          '',
        )}</ul>`
      : '<p class="bz-widget__empty">Phone numbers load here.</p>',
  );
}

function hours(config, snapshot) {
  const rows = (snapshot && snapshot.hours) || [];
  return shell(
    'hours',
    config,
    rows.length
      ? `<table class="bz-hours"><caption>${esc(
          config.heading || 'Opening hours',
        )}</caption><tbody>${join(
          rows.map(
            (r) => `<tr><th scope="row">${esc(r.day)}</th><td>${esc(r.hours)}</td></tr>`,
          ),
          '',
        )}</tbody></table>`
      : '<p class="bz-widget__empty">Opening hours load here.</p>',
  );
}

function inventoryCarousel(config, snapshot, ctx) {
  const prefix = (ctx && ctx.storefrontPrefix) || 'store';
  const items = (snapshot && snapshot.listings) || [];
  return shell(
    'inventory-carousel',
    config,
    `${config.heading ? `<p class="bz-widget__h">${esc(config.heading)}</p>` : ''}${
      items.length
        ? `<ul class="bz-grid bz-grid--4 bz-bare">${join(
            items.map(
              (l) =>
                `<li><a class="bz-card" href="/${esc(prefix)}/${esc(l.slug)}"${attrs(
                  tagAttrs('link', 'view-listing'),
                )}>${image(l.image, { placeholder: 'Photo' })}<div class="bz-card__body"><span class="bz-card__t">${esc(
                  l.title,
                )}</span>${l.price ? `<span class="bz-card__m">${esc(l.price)}</span>` : ''}</div></a></li>`,
            ),
            '',
          )}</ul>`
        : '<p class="bz-widget__empty">Live inventory loads here.</p>'
    }<p><a class="bz-btn bz-btn--secondary" href="/${esc(prefix)}"${attrs(
      tagAttrs('cta', 'browse-inventory'),
    )}>Browse all inventory</a></p>`,
  );
}

function inventorySearch(config, snapshot, ctx) {
  const prefix = (ctx && ctx.storefrontPrefix) || 'store';
  return shell(
    'inventory-search',
    config,
    `<form class="bz-searchbar" role="search" action="/${esc(prefix)}" method="get"${attrs(
      tagAttrs('form', 'inventory-search'),
    )}><label class="bz-sr" for="bz-wsearch">Search inventory</label><input class="bz-input" id="bz-wsearch" name="q" type="search" placeholder="${esc(
      config.placeholder || 'Search inventory…',
    )}" /><button class="bz-btn bz-btn--primary" type="submit"${attrs(
      tagAttrs('cta', 'inventory-search'),
    )}>Search</button></form>`,
    { hydrate: false },
  );
}

const PLACEHOLDERS = {
  'locations-map': locationsMap,
  staff,
  faq,
  'phone-numbers': phoneNumbers,
  hours,
  'inventory-carousel': inventoryCarousel,
  'inventory-search': inventorySearch,
};

/**
 * Render a widget block. Unknown widget ids get a hydrating skeleton rather than
 * nothing: a plugin can register a widget this renderer has never heard of, and
 * a dealer site must not fail to build because of it.
 */
export function renderWidget(props, ctx, block) {
  const widget = props && props.widget;
  if (!widget) return '';

  if (BEHAVIOUR_ONLY.has(widget)) {
    return `<div class="bz-widget bz-widget--behaviour"${attrs({
      'data-bz-widget': widget,
      'data-bz-config': JSON.stringify(props.config || {}),
      hidden: true,
    })}></div>`;
  }

  const config = props.config || {};
  const snapshot = props.snapshot || null;

  if (widget === 'form') {
    const form = ((ctx && ctx.forms) || {})[config.formId];
    if (!form) {
      if (ctx && ctx.warn) ctx.warn(`Widget form "${config.formId}" is not in site/forms/.`);
      return '';
    }
    return shell('form', config, renderForm(form, ctx), { hydrate: false });
  }

  const placeholder = PLACEHOLDERS[widget];
  if (placeholder) return placeholder(config, snapshot, ctx, block);

  if (ctx && ctx.warn) {
    ctx.warn(`Widget "${widget}" has no static placeholder in this renderer version.`);
  }
  return shell(
    widget,
    config,
    `<p class="bz-widget__empty">${esc(config.heading || widget)}</p>`,
  );
}

/** Widget ids this renderer version can render statically. */
export function staticWidgetIds() {
  return [...Object.keys(PLACEHOLDERS), 'form'];
}
