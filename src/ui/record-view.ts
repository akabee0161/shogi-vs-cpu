function listOf(recordEl: HTMLElement): HTMLOListElement {
  const list = recordEl.querySelector<HTMLOListElement>('.record-view-list');
  if (list === null) throw new Error('record view list not found');
  return list;
}

export function createRecordViewElement(): HTMLElement {
  const details = document.createElement('details');
  details.className = 'record-view-container';

  const summary = document.createElement('summary');
  summary.textContent = 'きふ';

  const list = document.createElement('ol');
  list.className = 'record-view-list';

  details.append(summary, list);
  return details;
}

export function appendRecordEntry(recordEl: HTMLElement, text: string): void {
  const li = document.createElement('li');
  li.textContent = text;
  listOf(recordEl).appendChild(li);
}

export function clearRecordView(recordEl: HTMLElement): void {
  listOf(recordEl).replaceChildren();
}
