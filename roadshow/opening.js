// Pause only ambient motion; the question's entrance always completes.
(() => {
  const opening = document.querySelector('.opening-question');
  const toggle = document.getElementById('openingMotion');
  if (!opening || !toggle) return;
  toggle.addEventListener('click', () => {
    const paused = opening.classList.toggle('motion-paused');
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.querySelector('span').textContent = paused ? '播放动效' : '暂停动效';
  });
})();
