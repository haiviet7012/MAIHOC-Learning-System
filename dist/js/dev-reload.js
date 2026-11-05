// Local preview only: refresh the page or styles as soon as source files change.
if (!navigator.webdriver && ["localhost", "127.0.0.1"].includes(location.hostname)) {
  const events = new EventSource("/__maihoc_dev_events");
  events.addEventListener("message", (event) => {
    const { type } = JSON.parse(event.data);
    if (type === "css") {
      document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
        const url = new URL(link.href);
        url.searchParams.set("_dev", Date.now().toString());
        link.href = url.href;
      });
    } else {
      location.reload();
    }
  });
}
