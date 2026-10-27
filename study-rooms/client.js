const STUN_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];
const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const api = async (url, options = {}) => {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Yêu cầu thất bại (HTTP ${response.status}).`);
  return data;
};
const post = (url, body) => api(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function mountStudyRooms(container, user) {
  let disposed = false;
  let pollTimer = null;
  let roomRefreshTimer = null;
  let lastEventId = 0;
  let currentRoom = null;
  let participant = null;
  let participantToken = null;
  let localStream = null;
  let micOn = false;
  let cameraOn = false;
  let handRaised = false;
  let members = [];
  const peers = new Map();
  let processingPoll = false;
  let sendBusy = false;

  const showError = message => {
    const node = container.querySelector("[data-room-error]");
    if (node) { node.textContent = message; node.hidden = false; }
  };
  const clearError = () => {
    const node = container.querySelector("[data-room-error]");
    if (node) { node.textContent = ""; node.hidden = true; }
  };
  const roomUrl = (id, suffix = "") => `/api/study-rooms/${encodeURIComponent(id)}${suffix}`;
  async function loadRooms() {
    try {
      const data = await api("/api/study-rooms");
      if (disposed || currentRoom) return;
      drawLobby(data.rooms || [], Boolean(data.isAdmin));
    } catch (error) {
      if (!disposed) {
        container.innerHTML = `<section class="study-room-lobby"><header class="study-room-heading"><div><p class="eyebrow">MAI HỌC · HỌC CÙNG NHAU</p><h1>Phòng tự học</h1><p class="muted">Bạn cần đăng nhập để xem hoặc tham gia phòng học.</p></div></header><div class="study-room-error">${escapeHtml(error.message)}</div><button class="button primary" data-room-login>Đăng nhập</button></section>`;
      }
    }
  }
  function drawLobby(rooms, _isAdmin) {
    if (disposed) return;
    container.innerHTML = `
      <section class="study-room-lobby">
        <header class="study-room-heading">
          <div><p class="eyebrow">MAI HỌC · HỌC CÙNG NHAU</p><h1>Phòng tự học</h1><p class="muted">Tạo phòng riêng cho bạn bè hoặc tham gia phòng đang mở. Tối đa 12 học viên mỗi phòng.</p></div>
          <button type="button" class="button primary" data-room-create-toggle aria-expanded="false">＋ Tạo phòng</button>
        </header>
        <div class="study-room-create-panel" data-room-create-panel hidden>
          <form data-room-create-form>
            <label>Tên phòng<input name="name" maxlength="60" minlength="3" required placeholder="Ví dụ: Ôn Toán cùng nhóm bạn"></label>
            <label>Mật khẩu phòng <span class="muted tiny">(để trống nếu muốn mọi người đều có thể vào)</span><input name="password" type="password" maxlength="72" autocomplete="new-password" placeholder="Không bắt buộc"></label>
            <div class="study-room-form-actions"><button type="button" class="button secondary" data-room-create-cancel>Hủy</button><button class="button primary" type="submit">Tạo phòng</button></div>
          </form>
        </div>
        <div class="study-room-toolbar"><h2>Phòng đang hoạt động</h2><button type="button" class="button secondary small" data-room-refresh>↻ Làm mới</button></div>
        <div class="study-room-grid" data-room-grid>${rooms.length ? rooms.map(roomCard).join("") : '<div class="study-room-empty"><div class="study-room-empty-icon">▣</div><h3>Chưa có phòng nào</h3><p class="muted">Hãy tạo phòng đầu tiên và mời bạn bè tham gia.</p></div>'}</div>
        <p class="study-room-error" data-room-error hidden></p>
        <p class="study-room-privacy-note">Camera và microphone chỉ bật khi bạn cho phép trên trình duyệt. Phòng có Admin giám sát sẽ hiển thị thông báo cho người tham gia.</p>
      </section>`;
    const createPanel = container.querySelector("[data-room-create-panel]");
    const createButton = container.querySelector("[data-room-create-toggle]");
    createButton?.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      if (!createPanel) return;
      createPanel.hidden = !createPanel.hidden;
      createButton.setAttribute("aria-expanded", String(!createPanel.hidden));
      clearError();
      if (!createPanel.hidden) createPanel.querySelector('input[name="name"]')?.focus();
    });
    container.querySelector("[data-room-create-cancel]")?.addEventListener("click", event => {
      event.preventDefault();
      if (createPanel) createPanel.hidden = true;
      createButton?.setAttribute("aria-expanded", "false");
    });
    container.querySelector("[data-room-refresh]")?.addEventListener("click", event => {
      event.preventDefault();
      void loadRooms();
    });
    container.querySelector("[data-room-create-form]")?.addEventListener("submit", event => {
      event.preventDefault();
      event.stopPropagation();
    });
  }
  function roomCard(room) {
    return `<article class="study-room-card">
      <div class="study-room-card-top"><span class="study-room-lock">${room.hasPassword ? "🔒 Phòng có mật khẩu" : "🌐 Phòng mở"}</span><span class="study-room-count">${room.participantCount}/${room.maxParticipants} người</span></div>
      <h3>${escapeHtml(room.name)}</h3><p class="muted">Người tạo: ${escapeHtml(room.creatorName)}</p>
      <div class="study-room-card-bottom"><span class="study-room-roomid">Mã phòng <strong>${escapeHtml(room.id)}</strong></span>
      <button class="button primary small" data-room-join="${escapeHtml(room.id)}" ${room.isFull ? "disabled" : ""}>${room.isFull ? "Đã đủ người" : "Tham gia"}</button>
      ${isAdminButton(room)}</div>
      ${room.adminObserving ? '<p class="study-room-admin-notice">Admin đang giám sát phòng này.</p>' : ""}</article>`;
  }
  function isAdminButton(room) {
    return user?.role === "admin" && Number(user.adminLevel) >= 1
      ? `<button class="button secondary small" data-room-monitor="${escapeHtml(room.id)}">Giám sát</button>` : "";
  }
  async function enterRoom(roomId, password = "", monitor = false) {
    clearError();
    try {
      const joined = await post(roomUrl(roomId, "/join"), { password, monitor });
      currentRoom = joined.room;
      participant = joined.participant;
      participantToken = joined.participantToken;
      members = joined.members || [];
      lastEventId = Number(joined.lastEventId) || 0;
      renderRoom(joined.messages || []);
      // Start room heartbeats before the browser opens the device permission prompt.
      poll();
      await startMedia();
      await syncLocalTracksToPeers();
      await sendEvent("media-state", { micOn, cameraOn });
      await refreshMembersAndConnect();
    } catch (error) { showError(error.message); }
  }
  async function startMedia() {
    // Admin observers join in receive-only mode unless they explicitly enable a device.
    if (participant?.isAdminObserver) {
      localStream = null;
      micOn = false;
      cameraOn = false;
      updateMediaButtons();
      renderMemberList();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      showError("Trình duyệt không hỗ trợ camera/microphone hoặc trang chưa chạy trên HTTPS/localhost.");
      return;
    }
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: "user" } });
      micOn = true; cameraOn = true;
    } catch {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        micOn = true; cameraOn = false;
        showError("Không mở được camera; bạn đã vào phòng bằng microphone. Hãy kiểm tra quyền camera của trình duyệt.");
      } catch {
        localStream = null; micOn = false; cameraOn = false;
        showError("Bạn đã vào phòng nhưng chưa bật camera/microphone. Hãy kiểm tra quyền truy cập thiết bị.");
      }
    }
    if (localStream) {
      for (const track of localStream.getTracks()) track.enabled = track.kind === "audio" ? micOn : cameraOn;
      const video = container.querySelector("[data-local-video]");
      if (video) video.srcObject = localStream;
    }
    updateMediaButtons();
    renderMemberList();
  }
  function renderRoom(messages = []) {
    container.innerHTML = `
      <section class="study-room-live">
        <header class="study-room-live-head">
          <div><p class="eyebrow">PHÒNG TỰ HỌC · MÃ ${escapeHtml(currentRoom.id)}</p><h1>${escapeHtml(currentRoom.name)}</h1><p class="muted" data-room-live-count>Đang kết nối người tham gia…</p></div>
          <div class="study-room-live-head-actions"><button class="button secondary small" data-room-copy>⧉ Sao chép mã phòng</button><button class="button secondary small" data-room-leave>Rời phòng</button></div>
        </header>
        <p class="study-room-error" data-room-error hidden></p>
        <p class="study-room-admin-banner" data-room-admin-banner hidden>Admin đang giám sát phòng này. Người tham gia được thông báo khi Admin tham gia.</p>
        <div class="study-room-workspace">
          <div class="study-room-stage">
            <div class="study-room-video-grid" data-video-grid>
              <article class="study-room-video-tile is-local"><video data-local-video autoplay playsinline muted></video><div class="study-room-video-label">${escapeHtml(user?.name || "Bạn")} <span>(Bạn)</span></div><div class="study-room-camera-off" data-local-placeholder hidden>📷 Camera đang tắt</div></article>
            </div>
            <div class="study-room-controls">
              <button class="study-room-control" data-room-mic aria-pressed="true" title="Bật/tắt microphone">🎙️ <span>Tắt mic</span></button>
              <button class="study-room-control" data-room-camera aria-pressed="true" title="Bật/tắt camera">📹 <span>Tắt camera</span></button>
              <button class="study-room-control" data-room-hand aria-pressed="false" title="Giơ tay">✋ <span>Giơ tay</span></button>
              <button class="study-room-control danger" data-room-leave>⏻ <span>Rời phòng</span></button>
            </div>
            <div class="study-room-participant-panel"><h3>Người tham gia <span data-room-member-count></span></h3><div data-room-members></div></div>
          </div>
          <aside class="study-room-chat">
            <div class="study-room-chat-heading"><h2>Chat phòng học</h2><span>Realtime</span></div>
            <div class="study-room-chat-messages" data-room-chat aria-live="polite"></div>
            <form class="study-room-chat-form" data-room-chat-form>
              <textarea name="message" rows="2" maxlength="2000" placeholder="Nhập tin nhắn…" aria-label="Tin nhắn"></textarea>
              <div class="study-room-chat-tools"><label class="study-room-image-button" title="Gửi ảnh">▧ Ảnh<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-room-image hidden></label><button type="submit" class="button primary small">Gửi ➤</button></div>
            </form>
          </aside>
        </div>
      </section>`;
    const chat = container.querySelector("[data-room-chat]");
    for (const message of messages) appendMessage(message);
    const localVideo = container.querySelector("[data-local-video]");
    if (localStream && localVideo) localVideo.srcObject = localStream;
    renderMemberList();
  }
  function appendMessage(message) {
    const target = container.querySelector("[data-room-chat]");
    if (!target || !message) return;
    const isSelf = message.participantId === participant?.participantId;
    const article = document.createElement("article");
    article.className = "study-room-message" + (isSelf ? " is-self" : "");
    const admin = message.isAdminObserver ? '<span class="study-room-admin-chip">Admin · Giám sát</span>' : "";
    article.innerHTML = `<div class="study-room-message-meta"><strong>${escapeHtml(message.name || "Người tham gia")}</strong>${admin}<time>${new Date(message.createdAt || Date.now()).toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"})}</time></div>${message.text ? `<p>${escapeHtml(message.text)}</p>` : ""}${message.image ? `<a href="${message.image}" target="_blank" rel="noopener" class="study-room-chat-image-link"><img src="${message.image}" alt="Ảnh được gửi trong phòng học" loading="lazy"></a>` : ""}`;
    target.append(article);
    target.scrollTop = target.scrollHeight;
  }
  function renderMemberList() {
    const list = container.querySelector("[data-room-members]");
    const count = container.querySelector("[data-room-member-count]");
    const label = container.querySelector("[data-room-live-count]");
    const banner = container.querySelector("[data-room-admin-banner]");
    if (!list) return;
    const students = members.filter(member => !member.isAdminObserver);
    const admins = members.filter(member => member.isAdminObserver);
    if (count) count.textContent = `(${students.length}/12)`;
    if (label) label.textContent = `${students.length}/12 học viên${admins.length ? " · Có Admin giám sát" : ""}`;
    if (banner) banner.hidden = admins.length === 0;
    list.innerHTML = members.map(member => `<div class="study-room-member ${member.handRaised ? "is-raised" : ""}">
      <span class="study-room-avatar">${escapeHtml((member.name||"?").slice(0,1).toLocaleUpperCase("vi"))}</span>
      <span class="study-room-member-name">${escapeHtml(member.name)}${member.participantId === participant?.participantId ? " (Bạn)" : ""}${member.isAdminObserver ? '<small class="study-room-admin-chip">Admin đang giám sát</small>' : ""}</span>
      <span class="study-room-member-status">${member.handRaised ? "✋" : ""} ${member.micOn ? "🎙️" : "🔇"} ${member.cameraOn ? "📹" : "▧"}</span>
    </div>`).join("");
    syncRemoteVideoTiles();
  }
  function syncRemoteVideoTiles() {
    const grid = container.querySelector("[data-video-grid]");
    if (!grid) return;
    const local = grid.querySelector(".is-local");
    for (const member of members) {
      if (member.participantId === participant?.participantId) continue;
      let tile = grid.querySelector(`[data-video-member="${member.participantId}"]`);
      if (!tile) {
        tile = document.createElement("article");
        tile.className = "study-room-video-tile";
        tile.dataset.videoMember = member.participantId;
        tile.innerHTML = `<video autoplay playsinline></video><div class="study-room-video-label"></div><div class="study-room-camera-off" hidden>📷 Camera đang tắt</div>`;
        grid.append(tile);
      }
      tile.querySelector(".study-room-video-label").textContent = member.name + (member.isAdminObserver ? " · Admin giám sát" : "") + (member.handRaised ? " · ✋" : "");
      const video = tile.querySelector("video");
      const stream = peers.get(member.participantId)?.stream;
      if (stream && video.srcObject !== stream) video.srcObject = stream;
      const cameraOff = tile.querySelector(".study-room-camera-off");
      if (cameraOff) cameraOff.hidden = member.cameraOn;
    }
    for (const tile of [...grid.querySelectorAll("[data-video-member]")]) {
      if (!members.some(member => member.participantId === tile.dataset.videoMember)) tile.remove();
    }
    if (local) {
      const placeholder = local.querySelector("[data-local-placeholder]");
      if (placeholder) placeholder.hidden = cameraOn;
      local.classList.toggle("is-camera-off", !cameraOn);
    }
  }
  function updateMediaButtons() {
    const mic = container.querySelector("[data-room-mic]");
    const camera = container.querySelector("[data-room-camera]");
    const hand = container.querySelector("[data-room-hand]");
    if (mic) { mic.classList.toggle("is-off", !micOn); mic.setAttribute("aria-pressed", String(micOn)); mic.innerHTML = `${micOn ? "🎙️" : "🔇"} <span>${micOn ? "Tắt mic" : "Bật mic"}</span>`; }
    if (camera) { camera.classList.toggle("is-off", !cameraOn); camera.setAttribute("aria-pressed", String(cameraOn)); camera.innerHTML = `${cameraOn ? "📹" : "📷"} <span>${cameraOn ? "Tắt camera" : "Bật camera"}</span>`; }
    if (hand) { hand.classList.toggle("is-raised", handRaised); hand.setAttribute("aria-pressed", String(handRaised)); hand.innerHTML = `${handRaised ? "✋" : "🖐️"} <span>${handRaised ? "Hạ tay" : "Giơ tay"}</span>`; }
    syncRemoteVideoTiles();
  }
  async function sendEvent(type, payload = {}, targetParticipantId = null) {
    if (!currentRoom || !participantToken) throw new Error("Bạn chưa tham gia phòng.");
    return post(roomUrl(currentRoom.id, "/events"), { token: participantToken, type, payload, targetParticipantId });
  }
  function closePeer(participantId) {
    const peer = peers.get(participantId);
    if (peer?.pc) peer.pc.close();
    peers.delete(participantId);
    syncRemoteVideoTiles();
  }
  function ensurePeer(member) {
    if (!member || member.participantId === participant?.participantId || peers.has(member.participantId)) return peers.get(member?.participantId);
    const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
    const entry = { pc, stream: new MediaStream() };
    peers.set(member.participantId, entry);
    const localTracks = localStream?.getTracks() || [];
    for (const track of localTracks) pc.addTrack(track, localStream);
    // Reserve both media kinds up front so users who joined without a camera or
    // microphone can enable the device later without renegotiating the room.
    if (!localTracks.some(track => track.kind === "audio")) pc.addTransceiver("audio", { direction: "sendrecv" });
    if (!localTracks.some(track => track.kind === "video")) pc.addTransceiver("video", { direction: "sendrecv" });
    pc.ontrack = event => {
      const incoming = event.streams?.[0];
      if (incoming) entry.stream = incoming;
      else entry.stream.addTrack(event.track);
      syncRemoteVideoTiles();
    };
    pc.onicecandidate = event => {
      if (event.candidate && !disposed) sendEvent("signal-ice", { candidate: event.candidate }, member.participantId).catch(() => {});
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(pc.connectionState)) closePeer(member.participantId);
    };
    return entry;
  }
  async function syncLocalTracksToPeers() {
    for (const entry of peers.values()) {
      for (const track of localStream?.getTracks() || []) {
        const sender = entry.pc.getSenders().find(item => item.track?.kind === track.kind)
          || entry.pc.getTransceivers().find(item => item.receiver.track.kind === track.kind)?.sender;
        if (sender && sender.track !== track) {
          try { await sender.replaceTrack(track); }
          catch (error) { console.warn("Could not attach local media track:", error.message); }
        }
      }
    }
  }
  async function refreshMembersAndConnect() {
    renderMemberList();
    for (const member of members) {
      if (member.participantId === participant?.participantId || (member.isAdminObserver && participant?.isAdminObserver)) continue;
      const entry = ensurePeer(member);
      if (entry && participant.participantId.localeCompare(member.participantId) < 0 && entry.pc.signalingState === "stable" && entry.pc.remoteDescription === null) {
        try {
          const offer = await entry.pc.createOffer();
          await entry.pc.setLocalDescription(offer);
          await sendEvent("signal-offer", { description: entry.pc.localDescription }, member.participantId);
        } catch (error) { console.warn("WebRTC offer failed:", error.message); }
      }
    }
  }
  async function processEvents(events) {
    for (const event of events) {
      lastEventId = Math.max(lastEventId, Number(event.id) || 0);
      if (event.fromParticipantId === participant?.participantId && ["hand", "media-state", "signal-offer", "signal-answer", "signal-ice"].includes(event.type)) continue;
      if (event.type === "chat") appendMessage(event.payload);
      else if (event.type === "participant-joined") {
        if (!members.some(member => member.participantId === event.payload.member.participantId)) members.push(event.payload.member);
      } else if (event.type === "participant-left") {
        members = members.filter(member => member.participantId !== event.payload.participantId);
        closePeer(event.payload.participantId);
      } else if (event.type === "hand") {
        members = members.map(member => member.participantId === event.payload.participantId ? { ...member, handRaised: event.payload.raised } : member);
      } else if (event.type === "media-state") {
        members = members.map(member => member.participantId === event.payload.participantId ? { ...member, micOn: event.payload.micOn, cameraOn: event.payload.cameraOn } : member);
      } else if (event.type === "signal-offer") {
        const from = members.find(member => member.participantId === event.fromParticipantId);
        if (!from || !event.payload?.description) continue;
        const peer = ensurePeer(from);
        try {
          await peer.pc.setRemoteDescription(event.payload.description);
          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          await sendEvent("signal-answer", { description: peer.pc.localDescription }, from.participantId);
        } catch (error) { console.warn("WebRTC answer failed:", error.message); }
      } else if (event.type === "signal-answer") {
        const from = members.find(member => member.participantId === event.fromParticipantId);
        const peer = peers.get(from?.participantId);
        if (peer && event.payload?.description) {
          try { await peer.pc.setRemoteDescription(event.payload.description); } catch (error) { console.warn("Could not apply WebRTC answer:", error.message); }
        }
      } else if (event.type === "signal-ice") {
        const from = members.find(member => member.participantId === event.fromParticipantId);
        const peer = peers.get(from?.participantId);
        if (peer && event.payload?.candidate) {
          try { await peer.pc.addIceCandidate(event.payload.candidate); } catch (error) { console.warn("Could not add ICE candidate:", error.message); }
        }
      } else if (event.type === "room-closed") {
        showError(event.payload?.message || "Phòng đã đóng.");
        await leaveRoom(false);
        await loadRooms();
        return;
      }
    }
  }
  async function poll() {
    if (disposed || !currentRoom || processingPoll) return;
    processingPoll = true;
    try {
      const data = await api(roomUrl(currentRoom.id, `/events?token=${encodeURIComponent(participantToken)}&since=${lastEventId}`));
      if (disposed || !currentRoom) return;
      currentRoom = data.room || currentRoom;
      members = data.members || [];
      await processEvents(data.events || []);
      await refreshMembersAndConnect();
    } catch (error) {
      if (!disposed && /không tồn tại|đã kết thúc|phiên tham gia phòng không hợp lệ/i.test(error.message || "")) {
        showError(error.message || "Phòng học đã kết thúc.");
        await leaveRoom(false);
        await loadRooms();
      } else if (!disposed) {
        showError(error.message || "Mất kết nối phòng học; đang thử kết nối lại.");
      }
    } finally {
      processingPoll = false;
      if (!disposed && currentRoom) pollTimer = setTimeout(poll, 1000);
    }
  }
  async function leaveRoom(notify = true) {
    if (!currentRoom) return;
    const oldRoom = currentRoom;
    const oldToken = participantToken;
    for (const [id] of peers) closePeer(id);
    for (const track of localStream?.getTracks() || []) track.stop();
    localStream = null; cameraOn = false; micOn = false;
    currentRoom = null; participant = null; participantToken = null; members = []; lastEventId = 0;
    if (pollTimer) clearTimeout(pollTimer);
    if (notify && oldToken) {
      try { await post(roomUrl(oldRoom.id, "/leave"), { token: oldToken }); } catch {}
    }
    if (!disposed) await loadRooms();
  }
  async function compressImage(file) {
    if (file.size > IMAGE_MAX_BYTES) throw new Error("Ảnh tối đa 2 MB.");
    if (!file.type.startsWith("image/")) throw new Error("Vui lòng chọn tệp ảnh.");
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Không đọc được tệp ảnh."));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });
  }

  container.addEventListener("click", async event => {
    // Lobby controls are bound directly in drawLobby so they continue working
    // even when the global app click handler intercepts other controls.
    if (event.target.closest("[data-room-create-toggle]") ||
        event.target.closest("[data-room-create-cancel]") ||
        event.target.closest("[data-room-refresh]")) return;
    if (event.target.closest("[data-room-login]")) { document.querySelector("#login-open")?.click(); return; }
    const join = event.target.closest("[data-room-join]");
    if (join) {
      const room = join.dataset.roomJoin;
      const card = join.closest(".study-room-card");
      const locked = card?.querySelector(".study-room-lock")?.textContent.includes("mật khẩu");
      const password = locked ? prompt("Nhập mật khẩu phòng học:") : "";
      if (locked && password === null) return;
      await enterRoom(room, password || "", false); return;
    }
    const monitor = event.target.closest("[data-room-monitor]");
    if (monitor) { await enterRoom(monitor.dataset.roomMonitor, "", true); return; }
    if (event.target.closest("[data-room-leave]")) { await leaveRoom(); return; }
    if (event.target.closest("[data-room-copy]") && currentRoom) {
      try { await navigator.clipboard.writeText(currentRoom.id); showError("Đã sao chép mã phòng: " + currentRoom.id); }
      catch { prompt("Mã phòng:", currentRoom.id); }
      return;
    }
    if (event.target.closest("[data-room-mic]") && currentRoom) {
      if (!localStream?.getAudioTracks().length && !micOn) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          const audioTrack = audioStream.getAudioTracks()[0];
          localStream = localStream || new MediaStream();
          localStream.addTrack(audioTrack);
          for (const entry of peers.values()) {
            const sender = entry.pc.getSenders().find(item => item.track?.kind === "audio")
              || entry.pc.getTransceivers().find(item => item.receiver.track.kind === "audio")?.sender;
            if (sender) await sender.replaceTrack(audioTrack);
          }
        } catch { showError("Không mở được microphone. Hãy kiểm tra quyền truy cập microphone của trình duyệt."); return; }
      }
      micOn = !micOn;
      for (const track of localStream?.getAudioTracks() || []) track.enabled = micOn;
      updateMediaButtons(); sendEvent("media-state", { micOn, cameraOn }).catch(error => showError(error.message)); return;
    }
    if (event.target.closest("[data-room-camera]") && currentRoom) {
      if (!localStream?.getVideoTracks().length && !cameraOn) {
        try {
          const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          const videoTrack = cameraStream.getVideoTracks()[0];
          localStream = localStream || new MediaStream();
          localStream.addTrack(videoTrack);
          for (const entry of peers.values()) {
            const sender = entry.pc.getSenders().find(item => item.track?.kind === "video")
              || entry.pc.getTransceivers().find(item => item.receiver.track.kind === "video")?.sender;
            if (sender) await sender.replaceTrack(videoTrack);
          }
        } catch { showError("Không mở được camera. Kiểm tra quyền truy cập của trình duyệt."); return; }
      }
      cameraOn = !cameraOn;
      for (const track of localStream?.getVideoTracks() || []) track.enabled = cameraOn;
      const localVideo = container.querySelector("[data-local-video]");
      if (localVideo && localStream) localVideo.srcObject = localStream;
      updateMediaButtons(); sendEvent("media-state", { micOn, cameraOn }).catch(error => showError(error.message)); return;
    }
    if (event.target.closest("[data-room-hand]") && currentRoom) {
      handRaised = !handRaised;
      updateMediaButtons(); sendEvent("hand", { raised: handRaised }).catch(error => showError(error.message)); return;
    }
  });

  container.addEventListener("submit", async event => {
    if (event.target.matches("[data-room-create-form]")) {
      event.preventDefault(); event.stopPropagation(); clearError();
      const form = event.target;
      if (!form.reportValidity()) return;
      const values = new FormData(form);
      const button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        const data = await post("/api/study-rooms", { name: values.get("name"), password: values.get("password") });
        await enterRoom(data.roomId, String(values.get("password") || ""), false);
      } catch (error) { showError(error.message); }
      finally { if (button) button.disabled = false; }
      return;
    }
    if (event.target.matches("[data-room-chat-form]")) {
      event.preventDefault();
      if (sendBusy) return;
      const form = event.target;
      const text = String(new FormData(form).get("message") || "").trim();
      const file = container.querySelector("[data-room-image]")?.files?.[0];
      if (!text && !file) return;
      sendBusy = true;
      const button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        const image = file ? await compressImage(file) : null;
        await sendEvent("chat", { text, image });
        form.reset();
      } catch (error) { showError(error.message); }
      finally { sendBusy = false; if (button) button.disabled = false; }
    }
  });

  loadRooms();
  roomRefreshTimer = setInterval(() => { if (!currentRoom && !disposed && !document.hidden) void loadRooms(); }, 5000);
  document.addEventListener("visibilitychange", onVisibilityChange);
  function onVisibilityChange() {
    if (!document.hidden && !currentRoom && !disposed) void loadRooms();
  }

  return async function disposeStudyRooms() {
    disposed = true;
    clearTimeout(pollTimer);
    clearInterval(roomRefreshTimer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    await leaveRoom();
  };
}
