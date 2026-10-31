function isBackendRequest(pathname) {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/socket.io" ||
    pathname.startsWith("/socket.io/") ||
    pathname === "/vendor" ||
    pathname.startsWith("/vendor/")
  );
}

export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);

    if (!isBackendRequest(incoming.pathname)) {
      const response = await env.ASSETS.fetch(request);
      if (response.headers.get('content-type')?.includes('text/html')) {
        const headers = new Headers(response.headers); headers.set('Cache-Control', 'no-cache');
        return new Response(response.body, { status: response.status, headers });
      }
      return response;
    }

    const backend = String(env.BACKEND_ORIGIN || "")
      .replace(/\/+$/, "");

    if (!backend) {
      return Response.json(
        { error: "BACKEND_ORIGIN chưa được cấu hình." },
        { status: 503 }
      );
    }

    const target = new URL(
      incoming.pathname + incoming.search,
      backend
    );

    const headers = new Headers(request.headers);
    headers.delete("host");

    // Bảo toàn nguồn gốc trình duyệt khi chuyển tiếp.
    headers.set("x-forwarded-host", incoming.host);
    headers.set(
      "x-forwarded-proto",
      incoming.protocol.slice(0, -1)
    );

    const proxiedRequest = new Request(target.toString(), {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method)
        ? undefined
        : request.body,
      redirect: "manual"
    });

    return fetch(proxiedRequest);
  }
};
