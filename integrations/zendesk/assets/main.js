import { candidateFromValue, collectTicketCandidates } from './lib/identifiers.js';
import { reviewQueryFromTicket } from './lib/dispute-map.js';
import { errorFromZafFailure } from './lib/api.js';
import { receiveProof, zendeskPackproofRequest } from './lib/lookup.js';
import { projectLookup } from './lib/passport-view.js';
import { internalNoteBody, renderApp } from './lib/render.js';

const client = window.ZAFClient.init();

const state = {
  settings: {},
  ticket: { id: null, subject: '', description: '', tags: [], orderFieldValue: '' },
  query: '',
  loading: false,
  error: null,
  result: null,
  projected: null,
  noteBusy: false,
  noteMessage: null,
};

document.addEventListener('DOMContentLoaded', () => {
  bindRoot();
  void bootstrap();
});

function bindRoot() {
  const root = document.getElementById('app');
  root.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = document.getElementById('lookup-input');
    state.query = input?.value?.trim() ?? '';
    void lookup(state.query ? candidateFromValue(state.query, 'manual') : null);
  });
  root.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('button') : null;
    if (!target) return;
    if (target.id === 'add-note') void addInternalNote();
    if (target.id === 'insert-composer') void insertComposer();
    if (target.classList.contains('pick') && target.dataset.transactionId) {
      void lookup(candidateFromValue(target.dataset.transactionId, 'ambiguous-choice'));
    }
  });
}

async function bootstrap() {
  paint();
  try {
    const metadata = await client.metadata();
    state.settings = metadata.settings ?? {};
    const fieldPath = orderFieldPath(state.settings.order_id_field);
    const paths = ['ticket.id', 'ticket.subject', 'ticket.description', 'ticket.tags'];
    if (fieldPath) paths.push(fieldPath);
    const ticket = await client.get(paths);
    state.ticket = {
      id: ticket['ticket.id'],
      subject: ticket['ticket.subject'] ?? '',
      description: ticket['ticket.description'] ?? '',
      tags: ticket['ticket.tags'] ?? [],
      orderFieldValue: fieldPath ? ticket[fieldPath] : '',
    };
    const candidates = collectTicketCandidates(state.ticket);
    const first = candidates[0] ?? null;
    state.query = first?.value ?? '';
    paint();
    if (first) await lookup(first);
    else resize();
  } catch (caught) {
    state.error = caught instanceof Error ? caught.message : 'Unable to read this Zendesk ticket.';
    paint();
  }
}

/**
 * @param {import('./lib/identifiers.js').LookupCandidate | null} candidate
 */
async function lookup(candidate) {
  if (!candidate) {
    state.error = 'Enter an order ID, Proof ID, or transaction ID.';
    state.result = null;
    state.projected = null;
    paint();
    return;
  }
  state.query = candidate.value;
  state.loading = true;
  state.error = null;
  state.noteMessage = null;
  paint();
  try {
    const reviewQuery = reviewQueryFromTicket({
      framework: state.settings.receiving_framework,
      subject: state.ticket.subject,
      description: state.ticket.description,
      tags: state.ticket.tags,
    });
    const result = await receiveProof({
      candidate,
      reviewQuery,
      request: (path) => packproofGet(path),
    });
    state.result = result;
    state.projected = projectLookup(result);
  } catch (caught) {
    const error = errorFromZafFailure(caught);
    state.error = error.message;
    state.result = null;
    state.projected = null;
  } finally {
    state.loading = false;
    paint();
  }
}

async function packproofGet(path) {
  try {
    const payload = await client.request(zendeskPackproofRequest({
      host: state.settings.api_host,
      path,
    }));
    return payload;
  } catch (caught) {
    throw errorFromZafFailure(caught);
  }
}

async function addInternalNote() {
  const view = state.projected?.view;
  if (!view || !state.ticket.id) return;
  state.noteBusy = true;
  state.noteMessage = null;
  paint();
  try {
    await client.request({
      url: `/api/v2/tickets/${encodeURIComponent(String(state.ticket.id))}.json`,
      type: 'PUT',
      contentType: 'application/json',
      data: JSON.stringify({
        ticket: {
          comment: {
            body: internalNoteBody(view),
            public: false,
          },
        },
      }),
    });
    state.noteMessage = 'Internal note recorded on this ticket. It organizes facts; it does not recommend a disposition.';
  } catch (caught) {
    state.noteMessage = errorFromZafFailure(caught).message;
  } finally {
    state.noteBusy = false;
    paint();
  }
}

async function insertComposer() {
  const view = state.projected?.view;
  if (!view) return;
  try {
    await client.invoke('comment.appendText', `\n${internalNoteBody(view)}\n`);
    state.noteMessage = 'Inserted into the composer. Keep the reply internal unless the recipient is authorized.';
  } catch (caught) {
    state.noteMessage = errorFromZafFailure(caught).message;
  }
  paint();
}

function orderFieldPath(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (raw.startsWith('ticket.customField:')) return raw;
  const id = raw.replace(/^custom_field_/, '');
  if (!/^\d+$/.test(id)) return null;
  return `ticket.customField:custom_field_${id}`;
}

function paint() {
  renderApp(document.getElementById('app'), state);
  resize();
}

function resize() {
  const height = Math.min(Math.max(document.documentElement.scrollHeight, 360), 1200);
  void client.invoke('resize', { width: '100%', height: `${height}px` });
}
