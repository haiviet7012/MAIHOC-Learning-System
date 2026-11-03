// Stable names allow a user gesture to return to the other workspace tab.
const names = { learning: 'maihoc-learning', school: 'maihoc-school' };
const paths = { learning: '/', school: '/school' };

export function registerSpaceTab(space, host = window) {
  if (names[space]) host.name = names[space];
}

export function openSpaceTab(space, host = window) {
  if (!names[space]) return false;
  // Do not pass noopener: it forces named targets to behave like _blank.
  // Both destinations are fixed same-origin application URLs.
  const target = host.open('', names[space]);
  if (!target) return false;
  try {
    if (target.location.href === 'about:blank') target.location.replace(paths[space]);
    else if (target.location.origin !== host.location.origin) return false;
    target.focus();
    return true;
  } catch {
    return false;
  }
}
