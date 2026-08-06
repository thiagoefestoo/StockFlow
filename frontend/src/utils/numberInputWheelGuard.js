let registered = false;

export function registerNumberInputWheelGuard() {
  if (registered || typeof document === 'undefined') return;
  registered = true;

  document.addEventListener('wheel', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'number') return;
    if (document.activeElement !== target) return;

    event.preventDefault();
    target.blur();
  }, { passive: false });
}
