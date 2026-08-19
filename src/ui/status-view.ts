export function createStatusElement(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'status-view';
  el.setAttribute('role', 'status');
  return el;
}

export function setStatusText(statusEl: HTMLElement, text: string): void {
  statusEl.textContent = text;
}
