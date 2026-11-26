(() => {
  const root = document.documentElement;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  const restoreTheme = () => {
    let theme;
    try { theme = localStorage.getItem('theme'); } catch { /* Storage may be disabled. */ }
    root.classList.toggle('dark', theme === 'dark' || (theme === 'system' && systemTheme.matches));
  };
  const syncChrome = () => {
    themeColor?.setAttribute('content', root.classList.contains('dark') ? '#101d29' : '#eff7fa');
  };
  restoreTheme();
  syncChrome();
  new MutationObserver(syncChrome).observe(root, { attributes: true, attributeFilter: ['class'] });
  systemTheme.addEventListener('change', restoreTheme);

  let failed = false;
  const renderStatus = () => {
    const shell = document.getElementById('riana-startup');
    if (!shell) return;
    shell.querySelector('[role="status"]').textContent = failed
      ? (navigator.onLine ? 'RIANA CIMS could not start.' : 'You’re offline. Reconnect to retry startup.')
      : (navigator.onLine ? 'Starting application…' : 'Opening RIANA CIMS offline…');
    shell.querySelector('[role="progressbar"]').hidden = failed;
    shell.querySelector('button').hidden = !failed;
  };
  const reportFailure = () => {
    failed = true;
    renderStatus();
  };
  window.addEventListener('error', (event) => {
    if (event.target instanceof HTMLScriptElement && event.target.type === 'module') reportFailure();
    if (event instanceof ErrorEvent && event.filename.startsWith(location.origin + '/')) reportFailure();
  }, true);
  window.addEventListener('vite:preloadError', reportFailure);
  window.addEventListener('online', renderStatus);
  window.addEventListener('offline', renderStatus);
  document.addEventListener('DOMContentLoaded', () => {
    renderStatus();
    document.querySelector('#riana-startup button')?.addEventListener('click', () => location.reload());
  }, { once: true });
})();
