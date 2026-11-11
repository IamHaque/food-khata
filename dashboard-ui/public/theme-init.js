(function() {
  try {
    var legacy = localStorage.getItem('food-khata-v2-theme');
    if (legacy !== null) {
      var migrated = legacy.indexOf('dark') !== -1 ? 'dark' : 'light';
      localStorage.removeItem('food-khata-v2-theme');
      localStorage.setItem('food-khata-mode', migrated);
    }
    var mode = localStorage.getItem('food-khata-mode') || 'system';
    var accent = localStorage.getItem('food-khata-accent') || 'emerald';
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var isDark = mode === 'dark' || (mode === 'system' && prefersDark);
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    document.documentElement.setAttribute('data-accent', accent);
    document.documentElement.dataset.v2theme = isDark ? 'dark' : 'light';
  } catch (e) {
    /* localStorage may be unavailable */
  }
})();
