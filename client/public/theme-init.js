try {
  var t = localStorage.getItem('tema');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  var dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? '#1b1d1b' : '#faf9f6');
} catch (e) { /* penyimpanan tidak tersedia */ }
