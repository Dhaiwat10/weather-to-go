import assert from 'node:assert/strict';
import test from 'node:test';
import { getWidgetPresentation } from './widget.ts';

test('future rain is shown as a sequence beside a clear current condition', () => {
  assert.deepEqual(getWidgetPresentation({
    condition: 'Clear night',
    weatherCode: 0,
    primaryTitle: 'Take an umbrella',
    primaryDetail: 'Rain is likely later tonight.',
    primaryKind: 'umbrella',
  }), {
    condition: 'Clear for now',
    primaryTitle: 'Rain tonight',
  });
});

test('current rain keeps the immediate umbrella instruction', () => {
  assert.deepEqual(getWidgetPresentation({
    condition: 'Rain',
    weatherCode: 61,
    primaryTitle: 'Take an umbrella',
    primaryDetail: 'Expect wet conditions over the next few hours.',
    primaryKind: 'umbrella',
  }), {
    condition: 'Rain',
    primaryTitle: 'Take an umbrella',
  });
});

test('lower-confidence future rain keeps its confidence and timing', () => {
  assert.deepEqual(getWidgetPresentation({
    condition: 'Partly cloudy',
    weatherCode: 2,
    primaryTitle: 'Rain is possible',
    primaryDetail: 'Rain is possible later this morning.',
    primaryKind: 'rain',
  }), {
    condition: 'Dry for now',
    primaryTitle: 'Rain possible this morning',
  });
});
