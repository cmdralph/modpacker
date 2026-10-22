// Applies the saved theme before first paint so the page never flashes the default theme.
// Kept as a static file (not inline) so the Content-Security-Policy can forbid inline scripts.
(function () {
  try {
    var p = JSON.parse(localStorage.getItem('modpacker:preferences:v1') || '{}');
    var root = document.documentElement;
    var theme = p.theme || 'dark';
    if (theme === 'system') theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    if (/^(dark|midnight|nether|light)$/.test(theme)) root.dataset.theme = theme;
    if (/^[a-z]+$/.test(p.accent || '')) root.dataset.accent = p.accent;
    if ([90, 100, 110, 120].indexOf(p.fontScale) >= 0) root.style.fontSize = p.fontScale + '%';
    root.classList.toggle('dark', theme !== 'light');
  } catch (e) {
    // Defaults from the markup apply.
  }
})();
