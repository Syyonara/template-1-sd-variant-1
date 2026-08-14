// Patch operations against a page's block list.
//
// The AI returns operations, not a tree, so an edit to one block leaves every
// other block byte-identical. That property only holds if there is exactly one
// implementation of "apply an operation" — the plugin applies ops server-side
// before committing, and the dashboard applies the same ops to show the result
// immediately. Two implementations would diverge on the first edge case.

import { parsePage } from './page.mjs';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

/** Find a block by id anywhere in the tree, with the list that holds it. */
function locate(blocks, id) {
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!block || typeof block !== 'object') continue;
    if (block.id === id) return { list: blocks, index: i, block };
    const cols = block.props && block.props.columns;
    if (Array.isArray(cols)) {
      for (const col of cols) {
        if (!Array.isArray(col)) continue;
        const hit = locate(col, id);
        if (hit) return hit;
      }
    }
  }
  return null;
}

function insert(list, block, afterId) {
  if (afterId == null) {
    list.unshift(block);
    return;
  }
  const at = list.findIndex((b) => b && b.id === afterId);
  if (at === -1) list.push(block);
  else list.splice(at + 1, 0, block);
}

/**
 * Merge a patch into a block's props.
 *
 * Shallow by design at the top level, but arrays replace wholesale: a patch that
 * sets `items` means "these items now", and merging arrays element-wise would
 * make "remove the third card" impossible to express.
 */
function mergeProps(current, patch) {
  const out = { ...(current || {}) };
  for (const [key, value] of Object.entries(patch || {})) {
    if (value === null) {
      delete out[key];
      continue;
    }
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      out[key] &&
      typeof out[key] === 'object' &&
      !Array.isArray(out[key])
    ) {
      out[key] = { ...out[key], ...value };
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * Apply a list of operations to a page.
 *
 * Returns `{ page, applied, rejected }`. An operation naming a block that does
 * not exist is rejected and reported rather than silently dropped — a model that
 * hallucinated an id needs to be told, and the dealer needs to know their edit
 * only half landed.
 */
export function applyOps(pageJson, ops) {
  const page = clone(parsePage(pageJson));
  const applied = [];
  const rejected = [];
  const reject = (op, why) => rejected.push({ op, reason: why });

  for (const op of ops || []) {
    if (!op || typeof op !== 'object') {
      reject(op, 'not an operation object');
      continue;
    }
    switch (op.op) {
      case 'add': {
        if (!op.block || !op.block.id || !op.block.type) {
          reject(op, 'add needs a block with an id and a type');
          break;
        }
        if (locate(page.blocks, op.block.id)) {
          reject(op, `block id "${op.block.id}" already exists`);
          break;
        }
        insert(page.blocks, clone(op.block), op.afterId ?? null);
        applied.push(op);
        break;
      }
      case 'addToColumn': {
        const row = locate(page.blocks, op.rowId);
        if (!row) {
          reject(op, `row "${op.rowId}" not found`);
          break;
        }
        const cols = row.block.props && row.block.props.columns;
        const index = Number(op.columnIndex) || 0;
        if (!Array.isArray(cols) || !Array.isArray(cols[index])) {
          reject(op, `row "${op.rowId}" has no column ${index}`);
          break;
        }
        if (!op.block || !op.block.id) {
          reject(op, 'addToColumn needs a block with an id');
          break;
        }
        if (locate(page.blocks, op.block.id)) {
          reject(op, `block id "${op.block.id}" already exists`);
          break;
        }
        insert(cols[index], clone(op.block), op.afterId ?? null);
        applied.push(op);
        break;
      }
      case 'update': {
        const hit = locate(page.blocks, op.id);
        if (!hit) {
          reject(op, `block "${op.id}" not found`);
          break;
        }
        hit.block.props = mergeProps(hit.block.props, op.patch);
        applied.push(op);
        break;
      }
      case 'remove': {
        const hit = locate(page.blocks, op.id);
        if (!hit) {
          reject(op, `block "${op.id}" not found`);
          break;
        }
        hit.list.splice(hit.index, 1);
        applied.push(op);
        break;
      }
      case 'move': {
        const hit = locate(page.blocks, op.id);
        if (!hit) {
          reject(op, `block "${op.id}" not found`);
          break;
        }
        const [moved] = hit.list.splice(hit.index, 1);
        // A move always lands at the top level: moving a block into or out of a
        // column changes what it is allowed to be, so that is an explicit
        // remove + add rather than a silent reparent.
        insert(page.blocks, moved, op.afterId ?? null);
        applied.push(op);
        break;
      }
      default:
        reject(op, `unknown operation "${op.op}"`);
    }
  }
  return { page, applied, rejected };
}
