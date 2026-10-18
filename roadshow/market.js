(() => {
  'use strict';
  const dialog = document.getElementById('marketDataDialog');
  const open = document.getElementById('marketEvidenceBtn');
  const tabs = Array.from(dialog.querySelectorAll('[data-evidence-tab]'));
  const select = tab => {
    for (const candidate of tabs) {
      const active = candidate === tab;
      candidate.setAttribute('aria-selected', String(active));
      candidate.tabIndex = active ? 0 : -1;
      document.getElementById(candidate.getAttribute('aria-controls')).hidden = !active;
    }
    dialog.querySelector('.evidence-scroll').scrollTop = 0;
  };
  open.addEventListener('click', () => { select(tabs[0]); dialog.showModal(); });
  for (const id of ['marketDataClose', 'marketDataReturn']) document.getElementById(id).addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    for (const detail of dialog.querySelectorAll('details[open]')) detail.open = false;
    open.focus({ preventScroll: true });
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', event => {
      let target;
      if (event.key === 'ArrowRight') target = tabs[(index + 1) % tabs.length];
      else if (event.key === 'ArrowLeft') target = tabs[(index + tabs.length - 1) % tabs.length];
      else if (event.key === 'Home') target = tabs[0];
      else if (event.key === 'End') target = tabs[tabs.length - 1];
      if (target) { event.preventDefault(); select(target); target.focus(); }
    });
  });
  window.addEventListener('hashchange', () => {
    const page = Number(document.querySelector('.slide.market-evidence').dataset.page);
    if (Number(location.hash.slice(1)) !== page && dialog.open) dialog.close();
  });
})();
