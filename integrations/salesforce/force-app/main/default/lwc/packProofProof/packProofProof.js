import { LightningElement, api } from 'lwc';
import getCaseContext from '@salesforce/apex/PackProofController.getCaseContext';
import retrieve from '@salesforce/apex/PackProofController.retrieve';
import addInternalNoteApex from '@salesforce/apex/PackProofController.addInternalNote';
import { candidateFromValue, collectCaseCandidates } from './identifiers';
import { errorFromBody, errorFromSalesforceFailure } from './api';
import { reviewQueryFromCase } from './disputeMap';
import { receiveProof } from './lookup';
import { projectLookup } from './passportView';
import { internalNoteBody } from './comment';

export default class PackProofProof extends LightningElement {
  query = '';
  loading = false;
  error = null;
  noteBusy = false;
  noteMessage = null;
  projected = null;
  caseContext = {
    id: null,
    subject: '',
    description: '',
    type: '',
    reason: '',
    orderFieldValue: '',
    receivingFramework: 'GENERIC',
  };

  _recordId;
  _bootstrappedId;

  @api
  get recordId() {
    return this._recordId;
  }
  set recordId(value) {
    this._recordId = value;
    if (value && value !== this._bootstrappedId) {
      void this.bootstrap();
    }
  }

  get hasError() {
    return Boolean(this.error);
  }

  get showIdle() {
    return !this.loading && !this.error && !this.projected;
  }

  get isReady() {
    return this.projected?.status === 'ready';
  }

  get isAmbiguous() {
    return this.projected?.status === 'ambiguous';
  }

  get isBlocked() {
    return Boolean(this.projected) && !this.isReady && !this.isAmbiguous;
  }

  get view() {
    return this.projected?.view ?? null;
  }

  get bannerClass() {
    return this.view?.limited ? 'banner limited' : 'banner';
  }

  get verificationUrl() {
    const url = this.view?.verificationUrl;
    return typeof url === 'string' && url.startsWith('https://') ? url : null;
  }

  get inventory() {
    return this.view?.inventory ?? [];
  }

  get comparisons() {
    return this.view?.comparisons ?? [];
  }

  get hasComparisons() {
    return this.comparisons.length > 0;
  }

  get timeline() {
    return this.view?.timeline ?? [];
  }

  get hasTimeline() {
    return this.timeline.length > 0;
  }

  get review() {
    return this.view?.review ?? null;
  }

  get facts() {
    return this.view?.facts ?? [];
  }

  get sessionFacts() {
    return this.projected?.session?.facts ?? [];
  }

  get hasSessionFacts() {
    return this.sessionFacts.length > 0;
  }

  get details() {
    return this.projected?.details ?? [];
  }

  get ambiguousTransactions() {
    return this.projected?.transactions ?? [];
  }

  get noteLabel() {
    return this.noteBusy ? 'Adding note…' : 'Add internal note';
  }

  async bootstrap() {
    this._bootstrappedId = this.recordId;
    this.loading = false;
    this.error = null;
    this.projected = null;
    this.noteMessage = null;
    try {
      this.caseContext = await getCaseContext({ recordId: this.recordId });
      const candidates = collectCaseCandidates(this.caseContext);
      const first = candidates[0] ?? null;
      this.query = first?.value ?? '';
      if (first) await this.lookup(first);
    } catch (caught) {
      this.error = errorFromSalesforceFailure(caught).message;
    }
  }

  handleQueryChange(event) {
    this.query = event.target.value ?? '';
  }

  handleLookupSubmit(event) {
    event.preventDefault();
    const input = this.template.querySelector('lightning-input');
    this.query = (input?.value ?? this.query ?? '').trim();
    const candidate = this.query ? candidateFromValue(this.query, 'manual') : null;
    void this.lookup(candidate);
  }

  handlePickTransaction(event) {
    const transactionId = event.currentTarget?.dataset?.transactionId;
    if (transactionId) {
      void this.lookup(candidateFromValue(transactionId, 'ambiguous-choice'));
    }
  }

  async lookup(candidate) {
    if (!candidate) {
      this.error = 'Enter an order ID, Proof ID, or transaction ID.';
      this.projected = null;
      return;
    }
    this.query = candidate.value;
    this.loading = true;
    this.error = null;
    this.noteMessage = null;
    this.projected = null;
    try {
      const result = await receiveProof({
        candidate,
        reviewQuery: reviewQueryFromCase({
          framework: this.caseContext.receivingFramework,
          subject: this.caseContext.subject,
          description: this.caseContext.description,
          type: this.caseContext.type,
          reason: this.caseContext.reason,
        }),
        request: (path) => this.packproofGet(path),
      });
      this.projected = projectLookup(result);
    } catch (caught) {
      this.error = errorFromSalesforceFailure(caught).message;
      this.projected = null;
    } finally {
      this.loading = false;
    }
  }

  async packproofGet(path) {
    const payload = await retrieve({ path });
    if (payload?.status >= 400) {
      throw errorFromBody(payload.body, payload.status);
    }
    return payload?.body;
  }

  async addInternalNote() {
    const view = this.view;
    if (!view || !this.caseContext.id) return;
    this.noteBusy = true;
    this.noteMessage = null;
    try {
      await addInternalNoteApex({
        caseId: this.caseContext.id,
        body: internalNoteBody(view),
      });
      this.noteMessage = 'Internal note recorded on this Case. It organizes facts; it does not recommend a disposition.';
    } catch (caught) {
      this.noteMessage = errorFromSalesforceFailure(caught).message;
    } finally {
      this.noteBusy = false;
    }
  }
}
