// Patch operations against a document tree.
//
// The AI returns operations, not a tree, so an edit to one node leaves every
// other node byte-identical. That property only holds if there is exactly one
// implementation of "apply an operation": the plugin validates ops before
// committing, the dashboard applies the same ops to show the result immediately,
// and the editor's own drag-and-drop goes through them too. Three callers, one
// implementation — the alternative is three subtly different trees.
//
// Every operation names a parent and an index. That is the change the old
// version needed and could not express: `addToColumn` existed because a column
// was not a node, and `move` always landed at the top level because there was
// nowhere else it could land. With a real tree, insert and move are the same
// two coordinates, and dragging a heading from one column into another is one
// operation rather than a remove and an add that lose the node's id in between.

import { accepts, locateNode, parseDocument } from './nodes.mjs';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The children list a parent id refers to, creating it if the parent is a
 * container that has never held anything.
 */
function childrenOf(doc, parentId) {
  if (parentId == null) return { list: doc.nodes, type: null };
  const hit = locateNode(doc.nodes, parentId);
  if (!hit) return null;
  if (!Array.isArray(hit.node.children)) hit.node.children = [];
  return { list: hit.node.children, type: hit.node.type };
}

function insertAt(list, node, index) {
  const at = Number.isInteger(index) && index >= 0 && index <= list.length ? index : list.length;
  list.splice(at, 0, node);
}

/**
 * Merge a patch into a node's props.
 *
 * Shallow at the top level, but arrays replace wholesale: a patch that sets
 * `items` means "these items now", and merging element-wise would make "remove
 * the third card" impossible to express. `null` deletes the key.
 */
function mergeProps(current, patch) {
  const out = { ...(current || {}) };
  for (const [key, value] of Object.entries(patch || {})) {
    if (value === null) {
      delete out[key];
      continue;
    }
    if (isObject(value) && isObject(out[key])) {
      out[key] = { ...out[key], ...value };
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** Every id in a live tree, so an insert can be checked for collisions. */
function idsIn(nodes) {
  const ids = new Set();
  const step = list => {
    for (const node of list || []) {
      if (!isObject(node)) continue;
      if (node.id) ids.add(node.id);
      if (Array.isArray(node.children)) step(node.children);
    }
  };
  step(nodes);
  return ids;
}

/** Would moving `id` into `parentId` put a node inside itself? */
function isDescendant(nodes, ancestorId, candidateId) {
  const hit = locateNode(nodes, ancestorId);
  if (!hit) return false;
  let found = false;
  const step = list => {
    for (const node of list || []) {
      if (!isObject(node)) continue;
      if (node.id === candidateId) found = true;
      if (Array.isArray(node.children)) step(node.children);
    }
  };
  step(hit.node.children);
  return found;
}

/**
 * Apply a list of operations to a document.
 *
 * Returns `{ document, applied, rejected }`. An operation naming a node that
 * does not exist, or one that would nest a row inside a row, is rejected and
 * reported rather than silently dropped: a model that hallucinated an id needs
 * to be told, and a dealer needs to know their edit only half landed.
 */
export function applyOps(raw, ops) {
  const document = parseDocument(clone(raw));
  const applied = [];
  const rejected = [];
  const reject = (op, reason) => rejected.push({ op, reason });

  for (const op of ops || []) {
    if (!isObject(op)) {
      reject(op, 'not an operation object');
      continue;
    }

    switch (op.op) {
      case 'insert': {
        const node = clone(op.node);
        if (!node || !node.type) {
          reject(op, 'insert needs a node with a type');
          break;
        }
        const target = childrenOf(document, op.parentId ?? null);
        if (!target) {
          reject(op, `parent "${op.parentId}" not found`);
          break;
        }
        if (!accepts(target.type, node.type)) {
          reject(
            op,
            `a ${node.type} cannot go inside ${target.type ? `a ${target.type}` : 'the page'}`,
          );
          break;
        }
        const taken = idsIn(document.nodes);
        if (node.id && taken.has(node.id)) {
          reject(op, `node id "${node.id}" already exists`);
          break;
        }
        insertAt(target.list, node, op.index);
        applied.push(op);
        break;
      }

      case 'move': {
        const hit = locateNode(document.nodes, op.id);
        if (!hit) {
          reject(op, `node "${op.id}" not found`);
          break;
        }
        const parentId = op.parentId ?? null;
        if (parentId === op.id || (parentId && isDescendant(document.nodes, op.id, parentId))) {
          reject(op, `"${op.id}" cannot be moved inside itself`);
          break;
        }
        const target = childrenOf(document, parentId);
        if (!target) {
          reject(op, `parent "${parentId}" not found`);
          break;
        }
        if (!accepts(target.type, hit.node.type)) {
          reject(
            op,
            `a ${hit.node.type} cannot go inside ${target.type ? `a ${target.type}` : 'the page'}`,
          );
          break;
        }
        // `index` is where the node ENDS UP, counted after it has been taken out
        // of wherever it was. Stated that way rather than as a position in the
        // list-before-the-move because the AI writes these by hand: "put it third"
        // should mean third, not third-minus-one-if-it-was-already-above-there.
        hit.list.splice(hit.index, 1);
        insertAt(target.list, hit.node, op.index);
        applied.push(op);
        break;
      }

      case 'update': {
        const hit = locateNode(document.nodes, op.id);
        if (!hit) {
          reject(op, `node "${op.id}" not found`);
          break;
        }
        hit.node.props = mergeProps(hit.node.props, op.props ?? op.patch);
        applied.push(op);
        break;
      }

      case 'remove': {
        const hit = locateNode(document.nodes, op.id);
        if (!hit) {
          reject(op, `node "${op.id}" not found`);
          break;
        }
        hit.list.splice(hit.index, 1);
        applied.push(op);
        break;
      }

      /**
       * Put a node inside a new container — the operation a builder needs for
       * "make this two columns". Expressing it as remove + insert would lose the
       * node's identity, and with it its history and anything referring to it.
       */
      case 'wrap': {
        const hit = locateNode(document.nodes, op.id);
        if (!hit) {
          reject(op, `node "${op.id}" not found`);
          break;
        }
        const wrapper = clone(op.node);
        if (!wrapper || !wrapper.type) {
          reject(op, 'wrap needs a container node');
          break;
        }
        const slot = findEmptySlot(wrapper);
        if (!slot) {
          reject(op, `"${wrapper.type}" has nowhere to put the wrapped node`);
          break;
        }
        if (!accepts(slot.type, hit.node.type)) {
          reject(op, `a ${hit.node.type} cannot go inside a ${slot.type}`);
          break;
        }
        slot.children.push(hit.node);
        hit.list.splice(hit.index, 1, wrapper);
        applied.push(op);
        break;
      }

      default:
        reject(op, `unknown operation "${op.op}"`);
    }
  }

  return { document, applied, rejected };
}

/**
 * The deepest first child of a wrapper that can hold content.
 *
 * "Wrap this in two columns" means a row whose *first column* takes the node,
 * not the row itself — the row cannot hold a heading at all.
 */
function findEmptySlot(wrapper) {
  let current = wrapper;
  while (current) {
    if (!Array.isArray(current.children)) current.children = [];
    const first = current.children[0];
    if (first && Array.isArray(first.children) && !first.children.length) {
      current = first;
      continue;
    }
    return current;
  }
  return null;
}
