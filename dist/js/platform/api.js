export async function api(url, { method = "GET", body, signal } = {}) {
  const response = await fetch(url, {
    method,
    signal,
    credentials: "same-origin",
    cache: "no-store",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      data.error || `Không thể tải dữ liệu (${response.status}).`,
    );
    error.status = response.status;
    throw error;
  }
  return data;
}
