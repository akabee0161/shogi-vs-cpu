import { describe, expect, it } from 'vitest';
import { createStatusElement, setStatusText } from './status-view';

describe('status-view', () => {
  it('setStatusText でテキストが表示される', () => {
    const el = createStatusElement();
    setStatusText(el, 'かんがえちゅう');
    expect(el.textContent).toBe('かんがえちゅう');
  });
});
