// Named targets let each workspace retain its own URL and in-memory state.
const TAB_NAMES = Object.freeze({ learning: 'maihoc-learning', school: 'maihoc-school' });
const TAB_PATHS = Object.freeze({ learning: '/', school: '/school' });

export function registerSpaceTab(space, host = window) {
  const name = TAB_NAMES[space];
  if (!name) return false;
  host.name = name;
  return true;
}

export function openSpaceTab(space, host = window) {
  const name = TAB_NAMES[space];
  const path = TAB_PATHS[space];
  if (!name || !path) return false;

  // Keep this synchronous inside the click gesture for popup-blocker rules.
  // An empty URL reuses an existing named tab without replacing its current
  // route. A newly-created named tab starts at about:blank and is navigated
  // below to the workspace entry point.
  let target;
  try {
    target = host.open('', name);
  } catch {
    return false;
  }
  if (!target) return false;

  try {
    if (target.location.href === 'about:blank') {
      target.location.replace(path);
    }
  } catch {
    // A cross-origin/isolated named tab is already present. Its location is
    // intentionally left untouched; focusing it is still a successful reuse.
  }

  try {
    target.focus();
  } catch {
    // Focus is best-effort and may be denied by browser policy.
  }
  return true;
}
