// Sets `.dark` on <html> before first paint (10 §8). Preference: localStorage['applyra.theme'] ∈ system|light|dark
// (selector arrives in M0-12b); anything else = system. External file, not inline: CSP script-src 'self' (09 §9.1).
(function () {
  var pref = 'system';
  try {
    var stored = window.localStorage.getItem('applyra.theme');
    if (stored === 'light' || stored === 'dark') pref = stored;
  } catch {
    // Storage blocked (privacy mode): fall back to the system preference.
  }
  var dark =
    pref === 'dark' ||
    (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
})();
