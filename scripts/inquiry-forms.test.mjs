import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { communication, submissionSettings, contactChannels, cvMaxBytes } from '../src/data/communication.js';
const source = readFileSync(new URL('../src/scripts/inquiry-forms.js', import.meta.url), 'utf8');

class Field {
  constructor(value = '') { this.value = value; this.files = []; this.dataset = {}; this.events = {}; this.attributes = {}; this.error = ''; }
  addEventListener(type, fn) { this.events[type] = fn; }
  emit(type, event = {}) { this.events[type]?.(event); }
  setCustomValidity(error) { this.error = error; }
  setAttribute(key, value) { this.attributes[key] = value; }
}
function setup(ready = false, hasCV = true) {
  const name = new Field('Example Visitor'), message = new Field('Example message'), cv = new Field(), feedback = new Field(), status = new Field();
  const form = new Field(); form.dataset = { ready: String(ready), cvMaxBytes: String(cvMaxBytes) };
  form.querySelectorAll = () => [name, message];
  form.querySelector = selector => ({ '[data-cv]': hasCV ? cv : null, '[data-cv-feedback]': feedback, '[data-form-status]': status })[selector];
  form.checkValidity = () => ![name, message, cv].some(field => field.error) && (!hasCV || cv.files.length > 0);
  form.reportValidity = () => { form.reported = true; };
  runInNewContext(source, { document: { querySelectorAll: () => [form] } });
  const submit = () => { let prevented = false; form.emit('submit', { preventDefault: () => { prevented = true; } }); return prevented; };
  return { form, name, message, cv, feedback, status, submit };
}
const pdf = (size = 1024, name = 'resume.pdf', type = 'application/pdf') => ({ name, size, type });

test('without a configured service both forms remain disabled', () => {
  for (const kind of ['contact', 'join']) assert.deepEqual(submissionSettings(kind), { action: undefined, ready: false, method: 'dialog' });
  assert.deepEqual(contactChannels(), { email: '', socials: [], privacyUrl: undefined });
});
test('an explicit HTTPS endpoint enables only its own form', () => {
  const configured = { ...communication, contactAction: 'https://example.com/contact' };
  assert.equal(submissionSettings('contact', configured).method, 'post');
  assert.equal(submissionSettings('contact', configured).action, configured.contactAction);
  assert.equal(submissionSettings('join', configured).ready, false);
  for (const value of ['http://example.com/send', 'javascript:alert(1)', 'https://user:password@example.com/send', '/send']) {
    assert.throws(() => submissionSettings('join', { ...communication, joinAction: value }));
  }
  assert.throws(() => contactChannels({ ...communication, socials: [{ label: 'Social', url: 'javascript:alert(1)' }] }));
});
test('preview attempts preserve input and explicitly report that nothing was sent', () => {
  const { cv, message, status, submit } = setup(); cv.files = [pdf()];
  assert.equal(submit(), true); assert.equal(message.value, 'Example message');
  assert.match(status.textContent, /Nothing has been sent/);
});
test('resumes must be PDFs; errors are correctable and filenames are rendered as text', () => {
  const { cv, feedback } = setup();
  for (const file of [pdf(1024, 'resume.docx'), pdf(1024, 'resume.pdf', 'text/html')]) {
    cv.files = [file]; cv.emit('change'); assert.match(cv.error, /PDF/); assert.equal(feedback.dataset.error, 'true');
  }
  cv.files = [pdf(1024, '<img onerror=x>.PDF', '')]; cv.emit('change');
  assert.equal(cv.error, ''); assert.match(feedback.textContent, /<img onerror=x>/); assert.equal(feedback.innerHTML, undefined);
});
test('size checks, empty files and selection cancellation', () => {
  const { cv, feedback } = setup();
  for (const size of [0, cvMaxBytes + 1]) { cv.files = [pdf(size)]; cv.emit('change'); assert(cv.error); }
  cv.files = [pdf(cvMaxBytes)]; cv.emit('change'); assert.equal(cv.error, '');
  cv.files = []; cv.emit('change'); assert.equal(cv.error, ''); assert.equal(feedback.textContent, ''); assert.equal(cv.attributes['aria-invalid'], 'false');
});
test('whitespace-only messages block POST and can be corrected', () => {
  const { cv, message, form, submit } = setup(true); cv.files = [pdf()]; message.value = '  \n ';
  assert.equal(submit(), true); assert.equal(form.reported, true);
  message.value = 'A real message'; message.emit('input'); assert.equal(message.error, ''); assert.equal(submit(), false);
});
test('invalid or missing PDFs also block a connected form', () => {
  const { cv, form, submit } = setup(true); cv.files = [pdf(cvMaxBytes + 1)];
  assert.equal(submit(), true); assert.equal(form.reported, true);
  cv.files = []; assert.equal(submit(), true);
});
test('valid connected forms submit without a false success message', () => {
  const { cv, status, submit } = setup(true); cv.files = [pdf()];
  assert.equal(submit(), false); assert.equal(status.textContent, undefined); assert.equal(cv.files.length, 1);
});

test('Contact can submit a valid message without a resume field', () => {
  const { message, submit } = setup(true, false);
  assert.equal(submit(), false);
  message.value = '   ';
  assert.equal(submit(), true);
});

test('public endpoints reject control characters', () => {
  for (const value of ['https://exa\nmple.com/send', 'https://example.com/%0Dsend', 'https://example.com/?x=%00']) {
    assert.throws(() => submissionSettings('contact', { ...communication, contactAction: value }), /Control characters/);
  }
  assert.throws(() => contactChannels({ ...communication, email: 'hello@example.com%0aBcc:other@example.com' }));
  assert.deepEqual(contactChannels({ ...communication, email: 'hello@example.com' }).email, 'hello@example.com');
});
