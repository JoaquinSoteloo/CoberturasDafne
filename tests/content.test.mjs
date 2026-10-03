import test from 'node:test';
import assert from 'node:assert/strict';
import { nextStage, stageOf, stageSummary } from '../src/lib/content.ts';

test('cada contenido pasa por WhatsApp y después por Drive', () => {
  assert.equal(nextStage('pendiente'), 'whatsapp');
  assert.equal(nextStage('whatsapp'), 'drive');
  assert.equal(nextStage('drive'), 'pendiente');
  assert.equal(stageOf({ done: true }), 'drive');
  assert.equal(stageOf({ done: false, stage: 'whatsapp' }), 'whatsapp');
});

test('resumen del avance', () => {
  const items = [{ done: true, stage: 'drive' }, { done: false, stage: 'whatsapp' }, { done: false, stage: 'whatsapp' }, { done: false }];
  assert.equal(stageSummary(items), '1 de 4 en Drive · 3 por WhatsApp');
  assert.equal(stageSummary([{ done: true }, { done: true }]), '2 de 2 en Drive');
  assert.equal(stageSummary([]), '');
});
