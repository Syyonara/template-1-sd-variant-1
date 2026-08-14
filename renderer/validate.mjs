// Validation of page JSON against the block schemas.
//
// Deliberately not a general JSON Schema engine: it understands exactly the
// keywords the block schemas use, which keeps the renderer dependency-free and
// keeps the failure messages specific enough to hand back to a model for a retry.
// If a schema starts using a keyword this does not implement, `unsupported` is
// reported rather than silently passing.

import { getBlock, CONTENT_BLOCK_TYPES, SECTION_BLOCK_TYPES } from './blocks.mjs';
import { parsePage } from './page.mjs';

const KNOWN_KEYWORDS = new Set([
  'type',
  'description',
  'properties',
  'required',
  'items',
  'enum',
  'default',
  'minimum',
  'maximum',
  'minItems',
  'maxItems',
  '$ref',
]);

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  if (typeof value === 'number') return 'number';
  return typeof value;
}

function typeMatches(expected, value) {
  const actual = typeOf(value);
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  if (expected === 'object') return actual === 'object';
  return actual === expected;
}

function check(schema, value, path, errors) {
  if (!schema) return;

  for (const key of Object.keys(schema)) {
    if (!KNOWN_KEYWORDS.has(key)) {
      errors.push({ path, message: `schema uses unsupported keyword "${key}"`, unsupported: true });
    }
  }

  // `$ref` is only ever the content-block reference used by `row.columns`.
  if (schema.$ref) {
    if (schema.$ref !== '#/definitions/contentBlock') {
      errors.push({ path, message: `unsupported $ref ${schema.$ref}` , unsupported: true });
      return;
    }
    checkBlock(value, path, errors, 1);
    return;
  }

  if (value === undefined || value === null) return;

  if (schema.type && !typeMatches(schema.type, value)) {
    errors.push({ path, message: `expected ${schema.type}, got ${typeOf(value)}` });
    return;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push({ path, message: `must be one of ${schema.enum.join(', ')}` });
  }
  if (typeof schema.minimum === 'number' && value < schema.minimum) {
    errors.push({ path, message: `must be >= ${schema.minimum}` });
  }
  if (typeof schema.maximum === 'number' && value > schema.maximum) {
    errors.push({ path, message: `must be <= ${schema.maximum}` });
  }

  if (schema.type === 'array') {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      errors.push({ path, message: `needs at least ${schema.minItems} item(s)` });
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      errors.push({ path, message: `allows at most ${schema.maxItems} item(s)` });
    }
    if (schema.items) {
      value.forEach((item, i) => check(schema.items, item, `${path}[${i}]`, errors));
    }
  }

  if (schema.type === 'object' && schema.properties) {
    for (const req of schema.required || []) {
      const v = value[req];
      if (v === undefined || v === null || v === '') {
        errors.push({ path: `${path}.${req}`, message: 'is required' });
      }
    }
    for (const [key, propValue] of Object.entries(value)) {
      const propSchema = schema.properties[key];
      if (!propSchema) {
        // Unknown props are dropped rather than rejected: a newer editor writing a
        // prop this renderer version does not know must not fail the dealer's build.
        errors.push({ path: `${path}.${key}`, message: 'unknown property (will be ignored)', warning: true });
        continue;
      }
      check(propSchema, propValue, `${path}.${key}`, errors);
    }
  }
}

function checkBlock(block, path, errors, depth) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    errors.push({ path, message: 'block must be an object' });
    return;
  }
  if (!block.id || typeof block.id !== 'string') {
    errors.push({ path: `${path}.id`, message: 'every block needs a short stable string id' });
  }
  const def = getBlock(block.type);
  if (!def) {
    errors.push({
      path: `${path}.type`,
      message: `unknown block type "${block.type}". Sections: ${SECTION_BLOCK_TYPES.join(
        ', ',
      )}. Content: ${CONTENT_BLOCK_TYPES.join(', ')}.`,
    });
    return;
  }
  if (depth > 0 && def.category === 'section') {
    errors.push({
      path: `${path}.type`,
      message: `"${block.type}" is a section block and must be top-level, never inside a column`,
    });
  }
  check(def.schema, block.props || {}, `${path}.props`, errors);
}

/** Validate one block. Returns `{ valid, errors, warnings }`. */
export function validateBlock(block, depth = 0) {
  const all = [];
  checkBlock(block, 'block', all, depth);
  return split(all);
}

/** Validate a whole page's block list, including duplicate ids. */
export function validatePage(pageJson) {
  const page = parsePage(pageJson);
  const all = [];
  const seen = new Set();

  const walk = (blocks, path, depth) => {
    blocks.forEach((block, i) => {
      const at = `${path}[${i}]`;
      checkBlock(block, at, all, depth);
      if (block && block.id) {
        if (seen.has(block.id)) {
          all.push({ path: `${at}.id`, message: `duplicate block id "${block.id}"` });
        }
        seen.add(block.id);
      }
      const cols = block && block.props && block.props.columns;
      if (Array.isArray(cols)) {
        cols.forEach((col, c) => walk(Array.isArray(col) ? col : [], `${at}.columns[${c}]`, depth + 1));
      }
    });
  };
  walk(page.blocks, 'blocks', 0);
  return split(all);
}

function split(all) {
  const warnings = all.filter((e) => e.warning);
  const errors = all.filter((e) => !e.warning);
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    message: errors.map((e) => `${e.path}: ${e.message}`).join('; '),
  };
}
