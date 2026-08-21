import { internalNoteBody } from './comment.js';
import { projectLookup } from './passport-view.js';

/**
 * @param {string} text
 * @returns {Text}
 */
function text(textValue) {
  return document.createTextNode(String(textValue ?? ''));
}

/**
 * @param {string} tag
 * @param {Record<string, string>} [attrs]
 * @param {(Node | string)[]} [children]
 */
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'href') node.setAttribute('href', value);
    else if (key === 'target') node.setAttribute('target', value);
    else if (key === 'rel') node.setAttribute('rel', value);
    else if (key === 'type') node.setAttribute('type', value);
    else if (key === 'placeholder') node.setAttribute('placeholder', value);
    else if (key === 'value') /** @type {HTMLInputElement} */ (node).value = value;
    else if (key === 'disabled') node.setAttribute('disabled', '');
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(typeof child === 'string' ? text(child) : child);
  return node;
}

/**
 * @param {HTMLElement} root
 * @param {object} model
 */
export function renderApp(root, model) {
  root.replaceChildren();
  root.append(
    el('header', { class: 'header' }, [
      el('p', { class: 'eyebrow' }, ['PackProof']),
      el('h1', {}, ['Proof']),
    ]),
    lookupForm(model),
  );

  if (model.error) {
    root.append(el('article', { class: 'card error' }, [
      el('h2', {}, ['Lookup failed']),
      el('p', {}, [model.error]),
    ]));
  } else if (model.loading) {
    root.append(el('article', { class: 'card' }, [el('p', { class: 'meta' }, ['Retrieving the Proof from PackProof API…'])]));
  } else if (model.projected) {
    root.append(renderProjected(model.projected, model));
  } else {
    root.append(el('article', { class: 'card' }, [
      el('p', { class: 'meta' }, ['Enter an order ID, Proof ID (PP-…), or transaction ID. The app uses PackProof Connect to receive the live Proof for this ticket.']),
    ]));
  }

  root.append(el('p', { class: 'boundary' }, [
    'PackProof records facts. This panel does not decide the ticket, refund, chargeback, or claim.',
  ]));
}

function lookupForm(model) {
  const form = el('form', { class: 'lookup', id: 'lookup-form' }, [
    el('label', { class: 'field' }, [
      el('span', {}, ['Order or Proof ID']),
      el('input', {
        id: 'lookup-input',
        type: 'text',
        placeholder: 'order-123 or PP-XXXX-XXXX-XXXX',
        value: model.query ?? '',
        autocomplete: 'off',
      }),
    ]),
    el('button', { class: 'btn', type: 'submit', ...(model.loading ? { disabled: 'true' } : {}) }, ['Receive Proof']),
  ]);
  return form;
}

function renderProjected(projected, model) {
  if (projected.status === 'ready') return renderReady(projected.view, model);
  if (projected.status === 'ambiguous') {
    const list = el('div', { class: 'stack' }, projected.transactions.map((row) => (
      el('button', { class: 'btn secondary pick', type: 'button', 'data-transaction-id': row.id }, [`${row.title} · ${row.status}`])
    )));
    return el('article', { class: 'card' }, [
      el('h2', {}, [projected.title]),
      el('p', {}, [projected.message]),
      list,
    ]);
  }
  const session = projected.session
    ? el('dl', { class: 'facts' }, factRows([
      ['Connect status', projected.session.status],
      ['Order', projected.session.orderId],
      ['Item', projected.session.itemTitle],
      ['Amount', projected.session.amount],
    ]))
    : null;
  const details = (projected.details ?? []).map((line) => el('p', { class: 'meta' }, [line]));
  return el('article', { class: 'card' }, [
    el('h2', {}, [projected.title]),
    el('p', {}, [projected.message]),
    ...details,
    session,
  ].filter(Boolean));
}

function renderReady(view, model) {
  const bannerClass = view.limited ? 'banner limited' : 'banner';
  const actions = el('div', { class: 'actions' }, [
    el('button', { class: 'btn', type: 'button', id: 'add-note', ...(model.noteBusy ? { disabled: 'true' } : {}) }, [
      model.noteBusy ? 'Adding note…' : 'Add internal note',
    ]),
    el('button', { class: 'btn secondary', type: 'button', id: 'insert-composer' }, ['Insert into composer']),
  ]);
  if (view.verificationUrl && view.verificationUrl.startsWith('https://')) {
    actions.append(el('a', { class: 'btn ghost', href: view.verificationUrl, target: '_blank', rel: 'noopener noreferrer' }, ['Open Proof']));
  }
  const inventory = el('div', { class: 'chips' }, view.inventory.map((entry) => (
    el('span', { class: entry.present ? 'chip present' : 'chip' }, [`${entry.label} · ${entry.stateLabel}`])
  )));
  const comparisons = view.comparisons.length
    ? el('article', { class: 'card' }, [
      el('h2', {}, ['Expected ↔ observed']),
      el('p', { class: 'meta' }, [view.comparisonFootnote]),
      el('ul', { class: 'plain' }, view.comparisons.map((row) => (
        el('li', {}, [`${row.attribute}: ${row.result}`])
      ))),
    ])
    : null;
  const review = view.review
    ? el('article', { class: 'card' }, [
      el('h2', {}, ['Review overlay']),
      el('p', {}, [`${view.review.framework} · ${view.review.category}`]),
      el('p', { class: 'meta' }, [view.reviewFootnote]),
      el('ul', { class: 'plain' }, view.review.relevance.map((row) => (
        el('li', {}, [`${row.category}: ${row.stateLabel}`])
      ))),
    ])
    : null;
  const timeline = view.timeline.length
    ? el('article', { class: 'card' }, [
      el('h2', {}, ['Recent timeline']),
      el('ul', { class: 'plain' }, view.timeline.map((event) => (
        el('li', {}, [`${event.occurredAt} — ${event.title}`])
      ))),
    ])
    : null;

  const stack = el('div', { class: 'stack' }, [
    el('article', { class: 'card' }, [
      el('div', { class: bannerClass }, [view.banner.replaceAll('_', ' ')]),
      el('h2', {}, [view.displayId]),
      el('p', {}, [view.summary]),
      el('p', { class: 'meta' }, [view.meaning]),
      actions,
      model.noteMessage ? el('p', { class: 'meta' }, [model.noteMessage]) : '',
    ]),
    el('article', { class: 'card' }, [
      el('h2', {}, ['Transaction']),
      el('dl', { class: 'facts' }, factRows([
        ['Order', view.orderId],
        ['Platform', view.platform],
        ['Item', view.itemTitle],
        ['Amount', view.amount],
        ['Packing', view.packing],
        ['Seal', view.seal],
        ['Label', view.label],
        ['Tracking observed', view.trackingObserved],
      ])),
    ]),
    el('article', { class: 'card' }, [
      el('h2', {}, ['Evidence available']),
      el('p', { class: 'meta' }, ['Presence labels only. Missing evidence is not a finding of fault.']),
      inventory,
    ]),
    comparisons,
    review,
    timeline,
    el('details', { class: 'card limitations' }, [
      el('summary', {}, ['Limitations']),
      el('p', {}, [view.disclaimer]),
      el('p', { class: 'meta' }, [view.boundary]),
    ]),
  ].filter(Boolean));
  return stack;
}

function factRows(pairs) {
  const nodes = [];
  for (const [label, value] of pairs) {
    nodes.push(el('dt', {}, [label]), el('dd', {}, [value]));
  }
  return nodes;
}

export { internalNoteBody };
