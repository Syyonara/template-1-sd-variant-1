// Form rendering. A form is defined once in `site/forms/<id>.json` and referenced
// by id from a page, so validation, consent and notification routing live in one
// place instead of being re-invented per page by whoever (or whatever) edits it.
//
// Submission is same-origin through the storefront prefix: the dealer's own
// domain proxies `/store/*` to the Remix app, which forwards to the Shop API.
// That keeps the visitor cookie first-party and means the published static site
// still needs no server runtime of its own.

import { attrs, esc, join, tagAttrs } from './html.mjs';

/** Field types the builder offers, grouped as the palette presents them. */
export const FIELD_TYPES = {
  basic: ['single_line', 'paragraph', 'email', 'phone', 'number', 'date', 'file'],
  choice: ['radio', 'checkboxes', 'dropdown'],
  identity: ['first_name', 'last_name', 'full_name'],
};

const INPUT_TYPE = {
  single_line: 'text',
  email: 'email',
  phone: 'tel',
  number: 'number',
  date: 'date',
  file: 'file',
  first_name: 'text',
  last_name: 'text',
  full_name: 'text',
};

const AUTOCOMPLETE = {
  email: 'email',
  phone: 'tel',
  first_name: 'given-name',
  last_name: 'family-name',
  full_name: 'name',
};

/** Operators each field type supports, mirrored by the dashboard's logic editor. */
export function operatorsForFieldType(type) {
  if (FIELD_TYPES.choice.includes(type)) return ['is', 'is_not'];
  if (type === 'number') return ['is', 'is_not', 'greater_than', 'less_than'];
  if (type === 'date') return ['is', 'is_not', 'before', 'after'];
  if (type === 'file') return ['is_empty', 'is_not_empty'];
  return ['is', 'is_not', 'contains', 'is_empty', 'is_not_empty'];
}

function fieldName(field) {
  return field.name || field.id;
}

function renderChoices(field, name) {
  const options = field.options || [];
  if (field.type === 'dropdown') {
    return `<select class="bz-input" id="${esc(field.id)}" name="${esc(name)}"${attrs({
      required: !!field.required,
    })}>
  <option value="">${esc(field.placeholder || 'Choose…')}</option>
${join(
  options.map((o) => `  <option value="${esc(o.value ?? o.label)}">${esc(o.label)}</option>`),
  '\n',
)}
</select>`;
  }
  const type = field.type === 'checkboxes' ? 'checkbox' : 'radio';
  const inputName = type === 'checkbox' ? `${name}[]` : name;
  return `<div class="bz-choices" role="group" aria-labelledby="${esc(field.id)}-l">${join(
    options.map(
      (o, i) =>
        `<label class="bz-choice"><input type="${type}" name="${esc(inputName)}" value="${esc(
          o.value ?? o.label,
        )}"${attrs({
          required: !!field.required && type === 'radio' && i === 0,
        })} /><span>${esc(o.label)}</span></label>`,
    ),
    '',
  )}</div>`;
}

function renderField(field) {
  const name = fieldName(field);
  const label = `<label class="bz-label" id="${esc(field.id)}-l" for="${esc(field.id)}">${esc(
    field.label,
  )}${field.required ? ' <span class="bz-req" aria-hidden="true">*</span>' : ''}</label>`;

  let control;
  if (field.type === 'paragraph') {
    control = `<textarea class="bz-input" id="${esc(field.id)}" name="${esc(name)}" rows="4"${attrs({
      required: !!field.required,
      placeholder: field.placeholder || null,
    })}></textarea>`;
  } else if (FIELD_TYPES.choice.includes(field.type)) {
    control = renderChoices(field, name);
  } else {
    control = `<input class="bz-input" id="${esc(field.id)}" name="${esc(name)}"${attrs({
      type: INPUT_TYPE[field.type] || 'text',
      required: !!field.required,
      placeholder: field.placeholder || null,
      autocomplete: AUTOCOMPLETE[field.type] || null,
      accept: field.type === 'file' ? field.accept || null : null,
    })} />`;
  }

  // Conditional logic travels as data attributes rather than generated script, so
  // one platform-shipped client handles every dealer's forms and a logic change
  // is a JSON edit rather than a code change in a dealer repo.
  const logic = field.logic && field.logic.rules && field.logic.rules.length ? field.logic : null;

  return `<div class="bz-field"${attrs({
    'data-bz-field': field.id,
    'data-bz-logic': logic ? JSON.stringify(logic) : null,
    hidden: logic ? true : null,
  })}>${label}${control}${field.help ? `<p class="bz-help">${esc(field.help)}</p>` : ''}</div>`;
}

/**
 * Render a form definition. `ctx.storefrontPrefix` decides the action path; the
 * prefix is preserved, never stripped, because the rewrite on the dealer's
 * domain forwards the whole path to the Remix mount.
 */
export function renderForm(form, ctx) {
  if (!form || !form.id) return '';
  if (form.status && form.status !== 'live' && !(ctx && ctx.includeDraftForms)) {
    if (ctx && ctx.warn) ctx.warn(`Form "${form.id}" is a draft and was not rendered.`);
    return '';
  }
  const prefix = (ctx && ctx.storefrontPrefix) || 'store';
  const fields = join((form.fields || []).map(renderField), '\n');
  const consent =
    form.consent && form.consent.enabled
      ? `<div class="bz-field bz-field--consent"><label class="bz-choice"><input type="checkbox" name="consent" value="yes"${attrs(
          { required: form.consent.required !== false },
        )} /><span>${esc(form.consent.text || 'I agree to be contacted about this enquiry.')}</span></label></div>`
      : '';

  return `<form class="bz-form" method="post" action="/${esc(prefix)}/forms/${esc(form.id)}"${attrs({
    id: `form-${form.id}`,
    'data-bz-form': form.id,
    'data-bz-success': form.successMessage || 'Thanks — we will be in touch shortly.',
    ...tagAttrs('form', form.intent || `form-${form.id}`),
  })}>
  <p class="bz-form__t">${esc(form.name || 'Contact us')}</p>
${fields}
${consent}
  <div class="bz-field bz-field--hp" aria-hidden="true"><label for="${esc(
    form.id,
  )}-hp">Leave this empty</label><input id="${esc(
    form.id,
  )}-hp" name="_hp" tabindex="-1" autocomplete="off" /></div>
  <button class="bz-btn bz-btn--primary" type="submit"${attrs(
    tagAttrs('cta', form.intent || `submit-${form.id}`),
  )}>${esc(form.submitLabel || 'Submit')}</button>
  <p class="bz-form__status" role="status" aria-live="polite"></p>
</form>`;
}
