import { describe, expect, it } from 'vitest';
import { appendRecordEntry, clearRecordView, createRecordViewElement } from './record-view';

describe('record-view', () => {
  it('appendRecordEntry で項目が末尾に追加される', () => {
    const el = createRecordViewElement();
    appendRecordEntry(el, '▲7六歩');
    appendRecordEntry(el, '△3四歩');
    const items = [...el.querySelectorAll('li')].map((li) => li.textContent);
    expect(items).toEqual(['▲7六歩', '△3四歩']);
  });

  it('clearRecordView で全項目が消える', () => {
    const el = createRecordViewElement();
    appendRecordEntry(el, '▲7六歩');
    clearRecordView(el);
    expect(el.querySelectorAll('li')).toHaveLength(0);
  });
});
