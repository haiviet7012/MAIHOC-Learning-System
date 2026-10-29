const FALLBACK_ICE_SERVERS = [
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:stun.l.google.com:19302" }
];
const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const EMOTES = ["👍", "❤️", "👏", "😂", "🎉", "🔥"];

const escapeHtml = value =>
  String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));

const api = async (url, options = {}) => {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Yêu cầu thất bại (HTTP ${response.status}).`);
  return data;
};

const post = (url, body, extra = {}) =>
  api(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...extra
  });

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
  let sideCollapsed = false;
  let pendingChatImage = null;
  let pendingChatImageName = "";
  let members = [];
  const peers = new Map();
  let processingPoll = false;
  let sendBusy = false;
  let iceServersPromise = null;

  const setExpandedRoomMode = active => {
    container.classList.toggle("study-room-fullscreen", Boolean(active));
    container.classList.toggle("study-room-lobby-view", !active);
    document.body.classList.toggle("study-room-open", Boolean(active));
  };

  const showError = (message, isInfo = false) => {
    const node = container.querySelector("[data-room-error]");
    if (!node) return;
    node.textContent = message;
    node.classList.toggle("is-info", Boolean(isInfo));
    node.hidden = !message;
  };

  const clearError = () => {
    const node = container.querySelector("[data-room-error]");
    if (!node) return;
    node.textContent = "";
    node.classList.remove("is-info");
    node.hidden = true;
  };

  const roomUrl = (id, suffix = "") => `/api/study-rooms/${encodeURIComponent(id)}${suffix}`;

  async function loadRooms() {
    if (disposed || currentRoom) return;
    setExpandedRoomMode(false);
    try {
      const data = await api("/api/study-rooms");
      if (disposed || currentRoom) return;
      const rooms = data.rooms || [];
      const isAdmin = Boolean(data.isAdmin);
      const ownRoom = rooms.find(room => room.creatorId === user?.id);
      const existingLobby = container.querySelector(".study-room-lobby");
      if (existingLobby && existingLobby.dataset.adminMode === String(isAdmin)) {
        updateLobbyRoomList(rooms, isAdmin, ownRoom);
      } else {
        drawLobby(rooms, isAdmin, ownRoom);
      }
    } catch (error) {
      if (!disposed) {
        container.innerHTML = `
          <section class="study-room-lobby">
            <header class="study-room-heading">
              <div>
                <p class="eyebrow">MAI HỌC · HỌC CÙNG NHAU</p>
                <h1>Phòng tự học</h1>
                <p class="muted">Bạn cần đăng nhập để xem danh sách phòng đang hoạt động hoặc tạo phòng tự học.</p>
              </div>
            </header>
            <div class="study-room-error">${escapeHtml(error.message)}</div>
            <button type="button" class="button primary" data-room-login>Đăng nhập ngay</button>
          </section>`;
      }
    }
  }

  function updateLobbyRoomList(rooms, isAdmin, ownRoom) {
    const grid = container.querySelector("[data-room-grid]");
    if (grid) {
      grid.innerHTML = rooms.length
        ? rooms.map(room => roomCard(room, isAdmin)).join("")
        : '<div class="study-room-empty"><div class="study-room-empty-icon">▣</div><h3>Chưa có phòng tự học nào đang mở</h3><p class="muted">Hãy nhấn “＋ Tạo phòng” để mở phòng đầu tiên và mời bạn bè cùng vào học.</p></div>';
    }
    const createButton = container.querySelector("[data-room-create-toggle]");
    if (createButton) {
      createButton.disabled = Boolean(ownRoom);
      createButton.textContent = ownRoom ? "Bạn đang có 1 phòng hoạt động" : "＋ Tạo phòng mới";
      createButton.title = ownRoom ? "Mỗi người chỉ được tạo 1 phòng. Hãy đóng phòng cũ trước khi tạo lại." : "";
      if (ownRoom) {
        const panel = container.querySelector("[data-room-create-panel]");
        if (panel) panel.hidden = true;
      }
    }
    const existingNotice = container.querySelector("[data-room-owner-active]");
    const lobby = container.querySelector(".study-room-lobby");
    if (ownRoom) {
      const markup = ownerActiveMarkup(ownRoom);
      if (existingNotice) {
        existingNotice.outerHTML = markup;
      } else if (lobby) {
        const wrapper = document.createElement("div");
        wrapper.innerHTML = markup;
        const panel = lobby.querySelector("[data-room-create-panel]");
        if (panel && wrapper.firstElementChild) lobby.insertBefore(wrapper.firstElementChild, panel);
      }
      bindLobbyClose(container);
    } else if (existingNotice) {
      existingNotice.remove();
    }
  }

  function ownerActiveMarkup(ownRoom) {
    return `
      <div class="study-room-owner-active" data-room-owner-active="true">
        <div class="study-room-owner-active-info">
          <strong>Phòng của bạn đang hoạt động: ${escapeHtml(ownRoom.name)} (Mã: ${escapeHtml(ownRoom.id)})</strong>
          <span>Mỗi tài khoản chỉ được mở 1 phòng tại một thời điểm. Nếu muốn tạo phòng mới, bạn cần đóng phòng hiện tại trước.</span>
        </div>
        <div class="study-room-owner-active-actions">
          <button type="button" class="button primary small" data-room-join="${escapeHtml(ownRoom.id)}" data-room-own="true">Vào lại phòng</button>
          <button type="button" class="button danger small" data-room-close-lobby="${escapeHtml(ownRoom.id)}">Đóng phòng hiện tại</button>
        </div>
      </div>`;
  }

  function bindLobbyClose(scope = container) {
    scope.querySelectorAll("[data-room-close-lobby]").forEach(button => {
      if (button.dataset.boundClose === "true") return;
      button.dataset.boundClose = "true";
      button.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();
        const roomId = button.dataset.roomCloseLobby;
        if (!confirm("Bạn có chắc muốn đóng phòng học này? Tất cả thành viên trong phòng sẽ được ngắt kết nối.")) return;
        button.disabled = true;
        try {
          await post(roomUrl(roomId, "/close"), {});
          await loadRooms();
        } catch (error) {
          button.disabled = false;
          showError(error.message);
        }
      });
    });
  }

  function drawLobby(rooms, isAdmin, ownRoom = null) {
    if (disposed) return;
    setExpandedRoomMode(false);
    container.innerHTML = `
      <section class="study-room-lobby" data-admin-mode="${String(isAdmin)}">
        <header class="study-room-heading">
          <div>
            <p class="eyebrow">MAI HỌC · PHÒNG HỌC TRỰC TUYẾN</p>
            <h1>Phòng tự học</h1>
            <p class="muted">Không gian học nhóm trực tuyến với camera, microphone, giơ tay, biểu cảm và gửi ảnh bài tập. Tối đa 12 người mỗi phòng.</p>
          </div>
          <div class="study-room-heading-actions">
            <button type="button" class="button secondary" data-room-refresh>↻ Làm mới</button>
            <button type="button" class="button primary" data-room-create-toggle aria-expanded="false" ${ownRoom ? 'disabled title="Mỗi người chỉ được tạo 1 phòng. Hãy đóng phòng cũ trước khi tạo lại."' : ""}>
              ${ownRoom ? "Bạn đang có 1 phòng hoạt động" : "＋ Tạo phòng mới"}
            </button>
          </div>
        </header>

        ${isAdmin ? `
          <div class="study-room-admin-stealth-card">
            <strong>👁️ Quyền Giám sát Admin</strong>
            <span>Với mỗi phòng, bạn chọn <b>Tham gia</b> (như học viên: bật cam/mic, chat, mọi người thấy bạn, cần mật khẩu nếu có) hoặc <b>Giám sát ẩn</b> (không cần mật khẩu, không giới hạn sĩ số, thành viên không biết bạn có mặt).</span>
          </div>
        ` : ""}

        ${ownRoom ? ownerActiveMarkup(ownRoom) : ""}

        <div class="study-room-create-panel" data-room-create-panel hidden>
          <div class="study-room-create-head">
            <h3>Tạo phòng tự học mới</h3>
            <p class="muted tiny">Đặt mật khẩu nếu bạn chỉ muốn cho bạn bè vào, hoặc để trống mật khẩu để mọi người đều có thể tham gia. (Tối đa 12 người/phòng)</p>
          </div>
          <form data-room-create-form>
            <label>
              Tên phòng học
              <input name="name" maxlength="60" minlength="3" required placeholder="Ví dụ: Ôn thi THPT Quốc gia môn Toán - Nhóm 1">
            </label>
            <label>
              Mật khẩu riêng <span class="muted tiny">(Tùy chọn — để trống nếu mở tự do)</span>
              <input name="password" type="password" maxlength="72" autocomplete="new-password" placeholder="Bỏ trống nếu mọi người đều vào được">
            </label>
            <div class="study-room-form-actions">
              <button type="button" class="button secondary" data-room-create-cancel>Hủy</button>
              <button class="button primary" type="submit">Tạo & Vào phòng</button>
            </div>
          </form>
        </div>

        <p class="study-room-error" data-room-error hidden></p>

        <div class="study-room-toolbar">
          <h2>Danh sách phòng đang hoạt động <span class="study-room-lobby-total">(${rooms.length} phòng)</span></h2>
        </div>

        <div class="study-room-grid" data-room-grid>
          ${rooms.length
            ? rooms.map(room => roomCard(room, isAdmin)).join("")
            : '<div class="study-room-empty"><div class="study-room-empty-icon">▣</div><h3>Chưa có phòng tự học nào đang mở</h3><p class="muted">Hãy nhấn “＋ Tạo phòng mới” để mở phòng đầu tiên và mời bạn bè cùng vào học.</p></div>'}
        </div>
      </section>`;

    const createPanel = container.querySelector("[data-room-create-panel]");
    const createButton = container.querySelector("[data-room-create-toggle]");
    createButton?.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      if (!createPanel || createButton.disabled) return;
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
    bindLobbyClose(container);
  }

  function roomCard(room, isAdmin = false) {
    const isOwner = user?.id === room.creatorId;
    const canClose = isOwner || isAdmin;
    
    const joinLabel = room.isFull && !isOwner ? "Đã đủ 12 người" : isOwner ? "Vào phòng" : "Tham gia";
    return `
      <article class="study-room-card ${isOwner ? "is-own-room" : ""}" data-room-card="${escapeHtml(room.id)}" data-has-password="${String(Boolean(room.hasPassword))}" data-is-owner="${String(isOwner)}">
        <div class="study-room-card-top">
          <span class="study-room-lock ${room.hasPassword ? "is-locked" : "is-open"}">
            ${room.hasPassword ? "🔒 Có mật khẩu" : "🌐 Phòng mở tự do"}
          </span>
          <span class="study-room-count ${room.isFull ? "is-full" : ""}">${room.participantCount}/${room.maxParticipants} người</span>
        </div>
        <h3>${escapeHtml(room.name)}</h3>
        <p class="muted">Chủ phòng: <strong>${escapeHtml(room.creatorName)}</strong>${isOwner ? " (Bạn)" : ""}</p>
        ${isAdmin && room.adminObserving ? '<p class="study-room-admin-only-tag">👁️ Đang có Admin giám sát ẩn danh</p>' : ""}
        <div class="study-room-card-bottom">
          <span class="study-room-roomid">Mã: <strong>${escapeHtml(room.id)}</strong></span>
          <div class="study-room-card-actions">
            
            <button type="button" class="button primary small" data-room-join="${escapeHtml(room.id)}" ${room.isFull && !isOwner ? "disabled" : ""}>${room.isFull && !isOwner ? "Đã đủ 12 người" : isOwner ? "Vào phòng" : "Tham gia"}</button>
            ${isAdmin ? `<button type="button" class="button secondary small" data-room-monitor="${escapeHtml(room.id)}" title="Vào ẩn danh: không bật cam/mic, học viên không thấy bạn">👁️ Giám sát ẩn</button>` : ""}



            ${canClose ? `<button type="button" class="button danger small" data-room-close-lobby="${escapeHtml(room.id)}">Đóng phòng</button>` : ""}
          </div>
        </div>
      </article>`;
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
      handRaised = false;
      pendingChatImage = null;
      pendingChatImageName = "";
      setExpandedRoomMode(true);
      renderRoom(joined.messages || []);
      poll();
      await startMedia();
      await syncLocalTracksToPeers();
      if (!participant?.isAdminObserver) {
        await sendEvent("media-state", { micOn, cameraOn }).catch(() => {});
      }
      await refreshMembersAndConnect();
    } catch (error) {
      // A WebRTC/media setup failure can happen after the server has accepted the join.
      // Always release tracks and leave the backend room so no camera/mic stays active.
      if (currentRoom && participantToken) {
        await leaveRoom(true);
      } else {
        await stopLocalMedia();
        currentRoom = null;
        participant = null;
        participantToken = null;
        setExpandedRoomMode(false);
      }
      showError(error.message || "Không thể vào phòng học.");
    }
  }

  async function startMedia() {
    // Stealth Admin observer never turns on camera or microphone.
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
      updateMediaButtons();
      renderMemberList();
      return;
    }
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: { ideal: 960 }, height: { ideal: 540 }, facingMode: "user" }
      });
      micOn = true;
      cameraOn = true;
    } catch {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        micOn = true;
        cameraOn = false;
        showError("Không mở được camera; bạn đã vào phòng với microphone. Bạn có thể bật camera sau.", true);
      } catch {
        localStream = null;
        micOn = false;
        cameraOn = false;
        showError("Bạn đã vào phòng (camera và mic đang tắt). Nhấn nút Bật mic / Bật camera ở thanh điều khiển khi cần.", true);
      }
    }
    if (localStream) {
      for (const track of localStream.getTracks()) {
        track.enabled = track.kind === "audio" ? micOn : cameraOn;
      }
      const video = container.querySelector("[data-local-video]");
      if (video) video.srcObject = localStream;
    }
    updateMediaButtons();
    renderMemberList();
  }

  function renderRoom(messages = []) {
    const isStealthAdmin = Boolean(participant?.isAdminObserver);
    const canCloseRoom = currentRoom?.creatorId === user?.id || user?.role === "admin";
    const initialLetter = escapeHtml((user?.name || "B").trim().slice(0, 1).toLocaleUpperCase("vi"));

    container.innerHTML = `
      <section class="study-room-live ${sideCollapsed ? "is-side-collapsed" : ""}">
        <header class="study-room-live-head">
          <div class="study-room-live-title-group">
            <span class="study-room-badge">PHÒNG TỰ HỌC · MÃ <strong>${escapeHtml(currentRoom.id)}</strong></span>
            <h1>${escapeHtml(currentRoom.name)}</h1>
            <span class="study-room-lock-pill">${currentRoom.hasPassword ? "🔒 Có mật khẩu" : "🌐 Phòng mở"}</span>
            <span class="study-room-live-count-pill" data-room-live-count>0/12 học viên</span>
            ${isStealthAdmin ? '<span class="study-room-stealth-pill" title="Các thành viên trong phòng hoàn toàn không biết bạn đang tham gia">👁️ Chế độ Giám sát ẩn danh</span>' : ""}
          </div>
          <div class="study-room-live-head-actions">
            <button type="button" class="button secondary small" data-room-copy title="Sao chép mã phòng để gửi cho bạn bè">⧉ Mã phòng: ${escapeHtml(currentRoom.id)}</button>
            <button type="button" class="button secondary small" data-room-toggle-side>${sideCollapsed ? "◧ Mở khung Chat" : "◨ Mở rộng màn hình"}</button>
            <button type="button" class="button secondary small" data-room-leave>Rời phòng</button>
            ${canCloseRoom ? '<button type="button" class="button danger small" data-room-close>Đóng phòng</button>' : ""}
          </div>
        </header>

        <p class="study-room-error" data-room-error hidden></p>

        <div class="study-room-workspace">
          <div class="study-room-stage">
            <div class="study-room-video-grid" data-video-grid data-tile-count="1">
              ${isStealthAdmin ? "" : `
                <article class="study-room-video-tile is-local is-camera-off" data-local-tile>
                  <video data-local-video autoplay playsinline muted></video>
                  <div class="study-room-camera-off" data-local-placeholder>
                    <div class="study-room-tile-avatar">${initialLetter}</div>
                    <span>Camera đang tắt</span>
                  </div>
                  <div class="study-room-tile-badges">
                    <span class="study-room-tile-badge is-hand" data-local-hand-badge hidden>✋ Đang giơ tay</span>
                    <span class="study-room-tile-badge is-mic-off" data-local-mic-badge hidden>🔇 Tắt mic</span>
                  </div>
                  <div class="study-room-tile-reactions" data-tile-reactions="${escapeHtml(participant?.participantId || "local")}"></div>
                  <div class="study-room-video-label">
                    <strong>${escapeHtml(user?.name || "Bạn")}</strong> <span>(Bạn${currentRoom.creatorId === user?.id ? " · Chủ phòng" : ""})</span>
                  </div>
                </article>
              `}
            </div>

            <div class="study-room-floating-reactions" data-stage-reactions aria-hidden="true"></div>

            <div class="study-room-controls" role="toolbar" aria-label="Điều khiển phòng học">
              ${isStealthAdmin ? `
                <div class="study-room-stealth-toolbar-note">
                  <span>👁️ <strong>Đang giám sát ẩn danh</strong> — Học viên trong phòng không biết bạn đang tham gia. Camera &amp; Mic của bạn đã khóa tắt.</span>
                </div>
                <button type="button" class="study-room-control" data-room-toggle-side title="Ẩn/Hiện danh sách & chat">💬 <span>Chat &amp; Thành viên</span></button>
                <button type="button" class="study-room-control danger" data-room-leave title="Rời chế độ giám sát">⏻ <span>Rời giám sát</span></button>
                <button type="button" class="study-room-control danger-outline" data-room-close title="Đóng phòng học này">✕ <span>Đóng phòng</span></button>
              ` : `
                <button type="button" class="study-room-control" data-room-mic aria-pressed="true" title="Bật/tắt microphone">🎙️ <span>Tắt mic</span></button>
                <button type="button" class="study-room-control" data-room-camera aria-pressed="true" title="Bật/tắt camera">📹 <span>Tắt camera</span></button>
                <button type="button" class="study-room-control" data-room-hand aria-pressed="false" title="Giơ tay phát biểu">🖐️ <span>Giơ tay</span></button>
                <div class="study-room-emote-bar" role="group" aria-label="Thả biểu cảm">
                  ${EMOTES.map(emoji => `<button type="button" class="study-room-emote-btn" data-room-emote="${emoji}" title="Thả biểu cảm ${emoji}">${emoji}</button>`).join("")}
                </div>
                <button type="button" class="study-room-control" data-room-toggle-side title="Ẩn/Hiện khung chat và thành viên">💬 <span>Chat</span></button>
                <button type="button" class="study-room-control danger" data-room-leave title="Rời phòng và tắt camera/mic">⏻ <span>Rời phòng</span></button>
                ${canCloseRoom ? '<button type="button" class="study-room-control danger-outline" data-room-close title="Đóng phòng cho tất cả mọi người">✕ <span>Đóng phòng</span></button>' : ""}
              `}
            </div>
          </div>

          <aside class="study-room-side">
            <section class="study-room-participant-panel">
              <div class="study-room-side-heading">
                <h3>Người tham gia <span data-room-member-count>(0/12)</span></h3>
              </div>
              <div class="study-room-member-list" data-room-members></div>
            </section>

            <section class="study-room-chat">
              <div class="study-room-chat-heading">
                <h2>Chat phòng học</h2>
                <span>Trực tuyến · Gửi ảnh</span>
              </div>
              <div class="study-room-chat-messages" data-room-chat aria-live="polite"></div>
              ${isStealthAdmin ? `
                <div class="study-room-stealth-chat-footer">
                  👁️ Bạn đang xem tin nhắn và ảnh trao đổi của học viên ở chế độ ẩn danh.
                </div>
              ` : `
                <form class="study-room-chat-form" data-room-chat-form>
                  <div class="study-room-image-preview" data-room-image-preview hidden>
                    <img data-room-image-preview-img alt="Ảnh chuẩn bị gửi">
                    <span data-room-image-preview-name></span>
                    <button type="button" class="study-room-image-remove" data-room-image-clear title="Xóa ảnh đính kèm">×</button>
                  </div>
                  <textarea name="message" rows="2" maxlength="2000" placeholder="Nhập tin nhắn hoặc dán ảnh (Ctrl+V)… Nhấn Enter để gửi" aria-label="Tin nhắn"></textarea>
                  <div class="study-room-chat-tools">
                    <label class="study-room-image-button" title="Đính kèm ảnh (tối đa 2 MB)">
                      📷 Gửi ảnh
                      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-room-image hidden>
                    </label>
                    <button type="submit" class="button primary small">Gửi ➤</button>
                  </div>
                </form>
              `}
            </section>
          </aside>
        </div>
      </section>`;

    for (const message of messages) appendMessage(message);
    const localVideo = container.querySelector("[data-local-video]");
    if (localStream && localVideo) localVideo.srcObject = localStream;

    const fileInput = container.querySelector("[data-room-image]");
    fileInput?.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        pendingChatImage = await compressImage(file);
        pendingChatImageName = file.name || "anh-dinh-kem.jpg";
        updateImagePreviewUI();
      } catch (error) {
        showError(error.message);
        fileInput.value = "";
      }
    });

    const chatForm = container.querySelector("[data-room-chat-form]");
    const textarea = chatForm?.querySelector('textarea[name="message"]');
    textarea?.addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        chatForm.requestSubmit();
      }
    });
    textarea?.addEventListener("paste", async event => {
      const items = event.clipboardData?.items || [];
      for (const item of items) {
        if (item.type && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            event.preventDefault();
            try {
              pendingChatImage = await compressImage(file);
              pendingChatImageName = "Ảnh dán từ bộ nhớ tạm";
              updateImagePreviewUI();
            } catch (error) {
              showError(error.message);
            }
          }
          break;
        }
      }
    });

    updateMediaButtons();
    renderMemberList();
  }

  function updateImagePreviewUI() {
    const box = container.querySelector("[data-room-image-preview]");
    const img = container.querySelector("[data-room-image-preview-img]");
    const name = container.querySelector("[data-room-image-preview-name]");
    const fileInput = container.querySelector("[data-room-image]");
    if (!box) return;
    if (pendingChatImage) {
      box.hidden = false;
      if (img) img.src = pendingChatImage;
      if (name) name.textContent = pendingChatImageName;
    } else {
      box.hidden = true;
      if (img) img.removeAttribute("src");
      if (name) name.textContent = "";
      if (fileInput) fileInput.value = "";
    }
  }

  function appendMessage(message) {
    const target = container.querySelector("[data-room-chat]");
    if (!target || !message) return;
    // Never show any chat metadata claiming to be an Admin observer to regular users.
    const isSelf = message.participantId === participant?.participantId;
    const article = document.createElement("article");
    article.className = "study-room-message" + (isSelf ? " is-self" : "");
    const timeText = new Date(message.createdAt || Date.now()).toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit"
    });
    article.innerHTML = `
      <div class="study-room-message-meta">
        <strong>${escapeHtml(message.name || "Học viên")}${isSelf ? " (Bạn)" : ""}</strong>
        <time>${escapeHtml(timeText)}</time>
      </div>
      ${message.text ? `<p>${escapeHtml(message.text)}</p>` : ""}
      ${message.image ? `<a href="${message.image}" target="_blank" rel="noopener" class="study-room-chat-image-link" title="Nhấn để mở ảnh kích thước lớn"><img src="${message.image}" alt="Ảnh được gửi trong phòng học" loading="lazy"></a>` : ""}
    `;
    target.append(article);
    target.scrollTop = target.scrollHeight;
  }

  function spawnFloatingEmote(participantId, emoji, senderName = "") {
    if (!emoji) return;
    const tileTarget =
      participantId === participant?.participantId
        ? container.querySelector("[data-local-tile] .study-room-tile-reactions")
        : container.querySelector(`[data-video-member="${CSS.escape(String(participantId || ""))}"] .study-room-tile-reactions`);
    if (tileTarget) {
      const bubble = document.createElement("span");
      bubble.className = "study-room-emote-float";
      bubble.textContent = emoji;
      tileTarget.append(bubble);
      setTimeout(() => bubble.remove(), 2400);
    }
    const stageTarget = container.querySelector("[data-stage-reactions]");
    if (stageTarget) {
      const pill = document.createElement("div");
      pill.className = "study-room-stage-emote";
      pill.style.left = `${18 + Math.floor(Math.random() * 64)}%`;
      pill.innerHTML = `<span class="study-room-stage-emote-icon">${escapeHtml(emoji)}</span>${senderName ? `<small>${escapeHtml(senderName)}</small>` : ""}`;
      stageTarget.append(pill);
      setTimeout(() => pill.remove(), 2600);
    }
  }

  function renderMemberList() {
    const list = container.querySelector("[data-room-members]");
    const count = container.querySelector("[data-room-member-count]");
    const label = container.querySelector("[data-room-live-count]");
    if (!list) return;
    // Filter out any admin observers from student-visible lists and counts so students NEVER know an Admin joined.
    const students = members.filter(member => !member.isAdminObserver);
    if (count) count.textContent = `(${students.length}/12)`;
    if (label) label.textContent = `${students.length}/12 học viên`;

    if (!students.length) {
      list.innerHTML = '<p class="muted tiny study-room-no-members">Chưa có học viên nào trong phòng.</p>';
    } else {
      list.innerHTML = students
        .map(member => {
          const isSelf = member.participantId === participant?.participantId;
          const isHost = currentRoom && member.userId === currentRoom.creatorId;
          const initial = escapeHtml((member.name || "?").trim().slice(0, 1).toLocaleUpperCase("vi"));
          return `
            <div class="study-room-member ${member.handRaised ? "is-raised" : ""}">
              <span class="study-room-avatar">${initial}</span>
              <span class="study-room-member-name">
                ${escapeHtml(member.name)}${isSelf ? " (Bạn)" : ""}
                ${isHost ? '<small class="study-room-host-chip">Chủ phòng</small>' : ""}
                ${member.handRaised ? '<small class="study-room-hand-chip">✋ Giơ tay</small>' : ""}
              </span>
              <span class="study-room-member-status" title="${member.micOn ? "Mic đang bật" : "Mic đang tắt"} · ${member.cameraOn ? "Camera đang bật" : "Camera đang tắt"}">
                ${member.micOn ? "🎙️" : "🔇"} ${member.cameraOn ? "📹" : "📷"}
              </span>
            </div>`;
        })
        .join("");
    }
    syncRemoteVideoTiles();
  }

  function syncRemoteVideoTiles() {
    const grid = container.querySelector("[data-video-grid]");
    if (!grid) return;
    const local = grid.querySelector("[data-local-tile]");
    const visibleStudents = members.filter(member => !member.isAdminObserver);

    for (const member of visibleStudents) {
      if (member.participantId === participant?.participantId) continue;
      let tile = grid.querySelector(`[data-video-member="${CSS.escape(member.participantId)}"]`);
      if (!tile) {
        const initial = escapeHtml((member.name || "?").trim().slice(0, 1).toLocaleUpperCase("vi"));
        tile = document.createElement("article");
        tile.className = "study-room-video-tile";
        tile.dataset.videoMember = member.participantId;
        tile.innerHTML = `
          <video autoplay playsinline></video>
          <div class="study-room-camera-off">
            <div class="study-room-tile-avatar">${initial}</div>
            <span>Camera đang tắt</span>
          </div>
          <div class="study-room-tile-badges">
            <span class="study-room-tile-badge is-hand" data-member-hand-badge hidden>✋ Đang giơ tay</span>
            <span class="study-room-tile-badge is-mic-off" data-member-mic-badge hidden>🔇 Tắt mic</span>
          </div>
          <div class="study-room-tile-reactions" data-tile-reactions="${escapeHtml(member.participantId)}"></div>
          <div class="study-room-video-label"></div>
        `;
        grid.append(tile);
      }
      const isHost = currentRoom && member.userId === currentRoom.creatorId;
      tile.querySelector(".study-room-video-label").innerHTML = `<strong>${escapeHtml(member.name)}</strong>${isHost ? " <span>(Chủ phòng)</span>" : ""}`;
      tile.classList.toggle("is-hand-raised", Boolean(member.handRaised));
      tile.classList.toggle("is-camera-off", !member.cameraOn);

      const handBadge = tile.querySelector("[data-member-hand-badge]");
      if (handBadge) handBadge.hidden = !member.handRaised;
      const micBadge = tile.querySelector("[data-member-mic-badge]");
      if (micBadge) micBadge.hidden = Boolean(member.micOn);

      const video = tile.querySelector("video");
      const stream = peers.get(member.participantId)?.stream;
      if (stream && video.srcObject !== stream) {
        video.srcObject = stream;
        video.play?.().catch(() => {});
      }
      const cameraOff = tile.querySelector(".study-room-camera-off");
      if (cameraOff) cameraOff.hidden = Boolean(member.cameraOn);
    }

    for (const tile of [...grid.querySelectorAll("[data-video-member]")]) {
      if (!visibleStudents.some(member => member.participantId === tile.dataset.videoMember)) {
        tile.remove();
      }
    }

    if (local) {
      const placeholder = local.querySelector("[data-local-placeholder]");
      if (placeholder) placeholder.hidden = cameraOn;
      local.classList.toggle("is-camera-off", !cameraOn);
      local.classList.toggle("is-hand-raised", handRaised);
      const localHand = local.querySelector("[data-local-hand-badge]");
      if (localHand) localHand.hidden = !handRaised;
      const localMic = local.querySelector("[data-local-mic-badge]");
      if (localMic) localMic.hidden = micOn;
    }

    // Empty state for stealth Admin when no students are in the room yet
    let emptyStage = grid.querySelector("[data-stage-empty]");
    const totalTiles = grid.querySelectorAll(".study-room-video-tile").length;
    if (totalTiles === 0) {
      if (!emptyStage) {
        emptyStage = document.createElement("div");
        emptyStage.className = "study-room-stage-empty";
        emptyStage.dataset.stageEmpty = "true";
        emptyStage.innerHTML = `<div class="study-room-empty-icon">👁️</div><h3>Đang giám sát phòng học</h3><p class="muted">Hiện chưa có học viên nào trong phòng hoặc học viên đã rời đi.</p>`;
        grid.append(emptyStage);
      }
    } else if (emptyStage) {
      emptyStage.remove();
    }

    const countBucket =
      totalTiles <= 1 ? "1" :
      totalTiles === 2 ? "2" :
      totalTiles <= 4 ? "4" :
      totalTiles <= 6 ? "6" :
      totalTiles <= 9 ? "9" : "12";
    grid.dataset.tileCount = countBucket;
  }

  function updateMediaButtons() {
    const mic = container.querySelector("[data-room-mic]");
    const camera = container.querySelector("[data-room-camera]");
    const hand = container.querySelector("[data-room-hand]");
    if (mic) {
      mic.classList.toggle("is-off", !micOn);
      mic.setAttribute("aria-pressed", String(micOn));
      mic.innerHTML = `${micOn ? "🎙️" : "🔇"} <span>${micOn ? "Tắt mic" : "Bật mic"}</span>`;
    }
    if (camera) {
      camera.classList.toggle("is-off", !cameraOn);
      camera.setAttribute("aria-pressed", String(cameraOn));
      camera.innerHTML = `${cameraOn ? "📹" : "📷"} <span>${cameraOn ? "Tắt camera" : "Bật camera"}</span>`;
    }
    if (hand) {
      hand.classList.toggle("is-raised", handRaised);
      hand.setAttribute("aria-pressed", String(handRaised));
      hand.innerHTML = `${handRaised ? "✋" : "🖐️"} <span>${handRaised ? "Hạ tay" : "Giơ tay"}</span>`;
    }
    syncRemoteVideoTiles();
  }

  async function sendEvent(type, payload = {}, targetParticipantId = null) {
    if (!currentRoom || !participantToken) throw new Error("Bạn chưa tham gia phòng.");
    return post(roomUrl(currentRoom.id, "/events"), {
      token: participantToken,
      type,
      payload,
      targetParticipantId
    });
  }

  function closePeer(participantId) {
    const peer = peers.get(participantId);
    if (peer?.pc) {
      try { peer.pc.close(); } catch {}
    }
    peers.delete(participantId);
    syncRemoteVideoTiles();
  }

  async function getIceServers() {
    if (!iceServersPromise) {
      iceServersPromise = api("/api/study-rooms/ice-servers")
        .then(data => Array.isArray(data.iceServers) && data.iceServers.length
          ? data.iceServers
          : FALLBACK_ICE_SERVERS)
        .catch(error => {
          console.warn("[Study Rooms] Could not load TURN credentials; using STUN fallback:", error.message);
          return FALLBACK_ICE_SERVERS;
        });
    }
    return iceServersPromise;
  }

  async function ensurePeer(member, isOfferer = false) {
    const targetId = typeof member === "string" ? member : member?.participantId;
    if (!targetId || targetId === participant?.participantId) return null;
    if (peers.has(targetId)) return peers.get(targetId);

    const iceServers = await getIceServers();
    if (peers.has(targetId)) return peers.get(targetId);
    const pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 4 });
    const entry = {
      pc,
      stream: new MediaStream(),
      isStealthPeer: Boolean(member?.isStealthPeer),
      pendingIceCandidates: []
    };
    peers.set(targetId, entry);

    if (!participant?.isAdminObserver) {
      const localTracks = localStream?.getTracks() || [];
      for (const track of localTracks) {
        pc.addTrack(track, localStream);
      }
      if (isOfferer) {
        if (!localTracks.some(track => track.kind === "audio")) {
          pc.addTransceiver("audio", { direction: "sendrecv" });
        }
        if (!localTracks.some(track => track.kind === "video")) {
          pc.addTransceiver("video", { direction: "sendrecv" });
        }
      }
    } else if (isOfferer) {
      // Stealth Admin offers receive-only transceivers to watch and listen to students.
      pc.addTransceiver("audio", { direction: "recvonly" });
      pc.addTransceiver("video", { direction: "recvonly" });
    }

    pc.ontrack = event => {
      const incoming = event.streams?.[0];
      if (incoming) entry.stream = incoming;
      else entry.stream.addTrack(event.track);
      syncRemoteVideoTiles();
    };
    pc.onicecandidate = event => {
      if (event.candidate && !disposed) {
        sendEvent("signal-ice", { candidate: event.candidate }, targetId).catch(() => {});
      }
    };
    pc.oniceconnectionstatechange = () => {
      console.info("[Study Rooms] ICE state:", targetId, pc.iceConnectionState);
    };
    pc.onconnectionstatechange = () => {
      console.info("[Study Rooms] Peer connection state:", targetId, pc.connectionState);
      if (["failed", "closed"].includes(pc.connectionState)) {
        closePeer(targetId);
      }
    };
    return entry;
  }

  async function syncLocalTracksToPeers() {
    if (participant?.isAdminObserver) return;
    for (const [targetId, entry] of peers.entries()) {
      let needsRenegotiation = false;
      for (const track of localStream?.getTracks() || []) {
        const sender =
          entry.pc.getSenders().find(item => item.track?.kind === track.kind) ||
          entry.pc.getTransceivers().find(item => item.receiver?.track?.kind === track.kind)?.sender;
        if (sender) {
          if (sender.track !== track) {
            try { await sender.replaceTrack(track); } catch (error) { console.warn("Could not replace track:", error.message); }
          }
        } else {
          try {
            entry.pc.addTrack(track, localStream);
            needsRenegotiation = true;
          } catch {}
        }
      }
      if (needsRenegotiation && entry.pc.signalingState === "stable") {
        try {
          const offer = await entry.pc.createOffer();
          await entry.pc.setLocalDescription(offer);
          await sendEvent("signal-offer", { description: entry.pc.localDescription }, targetId);
        } catch {}
      }
    }
  }

  async function refreshMembersAndConnect() {
    renderMemberList();
    for (const member of members) {
      if (member.participantId === participant?.participantId) continue;
      if (member.isAdminObserver) continue;
      const shouldOffer = participant?.isAdminObserver
        ? true
        : participant.participantId.localeCompare(member.participantId) < 0;
      const entry = await ensurePeer(member, shouldOffer);
      if (entry && shouldOffer && entry.pc.signalingState === "stable" && entry.pc.remoteDescription === null) {
        try {
          const offer = await entry.pc.createOffer();
          await entry.pc.setLocalDescription(offer);
          await sendEvent("signal-offer", { description: entry.pc.localDescription }, member.participantId);
        } catch (error) {
          console.warn("WebRTC offer failed:", error.message);
        }
      }
    }
  }

  async function processEvents(events) {
    for (const event of events) {
      lastEventId = Math.max(lastEventId, Number(event.id) || 0);
      if (
        event.fromParticipantId === participant?.participantId &&
        ["hand", "emote", "media-state", "signal-offer", "signal-answer", "signal-ice"].includes(event.type)
      ) {
        continue;
      }
      if (event.type === "chat") {
        appendMessage(event.payload);
      } else if (event.type === "participant-joined") {
        if (
          event.payload?.member &&
          !event.payload.member.isAdminObserver &&
          !members.some(member => member.participantId === event.payload.member.participantId)
        ) {
          members.push(event.payload.member);
        }
      } else if (event.type === "participant-left") {
        members = members.filter(member => member.participantId !== event.payload?.participantId);
        closePeer(event.payload?.participantId);
      } else if (event.type === "stealth-peer-left") {
        closePeer(event.payload?.participantId);
      } else if (event.type === "hand") {
        members = members.map(member =>
          member.participantId === event.payload?.participantId
            ? { ...member, handRaised: Boolean(event.payload.raised) }
            : member
        );
        if (event.payload?.raised) {
          spawnFloatingEmote(event.payload.participantId, "✋", event.payload.name);
        }
      } else if (event.type === "emote") {
        spawnFloatingEmote(event.payload?.participantId, event.payload?.emoji, event.payload?.name);
      } else if (event.type === "media-state") {
        members = members.map(member =>
          member.participantId === event.payload?.participantId
            ? { ...member, micOn: Boolean(event.payload.micOn), cameraOn: Boolean(event.payload.cameraOn) }
            : member
        );
      } else if (event.type === "signal-offer") {
        const fromId = event.fromParticipantId;
        if (!fromId || !event.payload?.description) continue;
        const knownMember = members.find(member => member.participantId === fromId);
        const peer = await ensurePeer(knownMember || { participantId: fromId, isStealthPeer: true }, false);
        if (!peer) continue;
        try {
          await peer.pc.setRemoteDescription(event.payload.description);
          while (peer.pendingIceCandidates.length) {
            const candidate = peer.pendingIceCandidates.shift();
            try { await peer.pc.addIceCandidate(candidate); }
            catch (error) { console.warn("[Study Rooms] Queued ICE candidate rejected:", error.message); }
          }
          if (!participant?.isAdminObserver) {
            for (const kind of ["audio", "video"]) {
              const track = localStream?.getTracks().find(item => item.kind === kind) || null;
              const transceiver = peer.pc
                .getTransceivers()
                .find(item => item.receiver?.track?.kind === kind || item.sender?.track?.kind === kind);
              if (transceiver) {
                try {
                  transceiver.direction = "sendrecv";
                  if (track && transceiver.sender.track !== track) {
                    await transceiver.sender.replaceTrack(track);
                  }
                } catch {}
              }
            }
          }
          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          await sendEvent("signal-answer", { description: peer.pc.localDescription }, fromId);
        } catch (error) {
          console.warn("WebRTC answer failed:", error.message);
        }
      } else if (event.type === "signal-answer") {
        const peer = peers.get(event.fromParticipantId);
        if (peer && event.payload?.description) {
          try {
            await peer.pc.setRemoteDescription(event.payload.description);
            while (peer.pendingIceCandidates.length) {
              const candidate = peer.pendingIceCandidates.shift();
              try { await peer.pc.addIceCandidate(candidate); }
              catch (candidateError) { console.warn("[Study Rooms] Queued ICE candidate rejected:", candidateError.message); }
            }
          } catch (error) {
            console.warn("Could not apply WebRTC answer:", error.message);
          }
        }
      } else if (event.type === "signal-ice") {
        const fromId = event.fromParticipantId;
        if (!fromId || !event.payload?.candidate) continue;

        // The peer connection must be created first, even if this ICE event
        // is received before the offer. ensurePeer() also fetches TURN servers.
        const knownMember = members.find(member => member.participantId === fromId);
        const peer = await ensurePeer(knownMember || { participantId: fromId, isStealthPeer: true }, false);
        if (!peer) continue;

        if (!peer.pc.remoteDescription) {
          peer.pendingIceCandidates.push(event.payload.candidate);
        } else {
          try {
            await peer.pc.addIceCandidate(event.payload.candidate);
          } catch (error) {
            console.warn("[Study Rooms] Could not add ICE candidate:", error.message);
          }
        }
      } else if (event.type === "room-closed") {
        const message = event.payload?.message || "Phòng học đã được đóng.";
        await leaveRoom(false);
        if (!disposed) {
          showError(message);
        }
        return;
      }
    }
  }

  async function poll() {
    if (disposed || !currentRoom || processingPoll) return;
    processingPoll = true;
    try {
      const data = await api(
        roomUrl(currentRoom.id, `/events?token=${encodeURIComponent(participantToken)}&since=${lastEventId}`)
      );
      if (disposed || !currentRoom) return;
      currentRoom = data.room || currentRoom;
      members = data.members || [];
      await processEvents(data.events || []);
      await refreshMembersAndConnect();
    } catch (error) {
      if (!disposed && /không tồn tại|đã kết thúc|phiên tham gia phòng không hợp lệ/i.test(error.message || "")) {
        const msg = error.message || "Phòng học đã kết thúc.";
        await leaveRoom(false);
        showError(msg);
      } else if (!disposed) {
        showError(error.message || "Mất kết nối phòng học; đang tự động kết nối lại…");
      }
    } finally {
      processingPoll = false;
      if (!disposed && currentRoom) pollTimer = setTimeout(poll, 1000);
    }
  }

  async function stopLocalMedia() {
    // Snapshot then clear the reference first, making repeated cleanup calls safe.
    const stream = localStream;
    localStream = null;
    cameraOn = false;
    micOn = false;
    handRaised = false;

    const tracks = new Set([
      ...(stream?.getTracks() || []),
      ...[...peers.values()].flatMap(peer => {
        try {
          return peer.pc.getSenders().map(sender => sender.track).filter(Boolean);
        } catch {
          return [];
        }
      })
    ]);
    for (const track of tracks) {
      try {
        track.enabled = false;
        track.stop();
      } catch {}
    }

    // Detach local and remote media elements so camera/mic devices and remote playback
    // cannot remain referenced by a tile after the user leaves the room.
    for (const mediaElement of container.querySelectorAll("video, audio")) {
      try {
        mediaElement.pause();
        mediaElement.srcObject = null;
      } catch {}
    }
    for (const peer of peers.values()) {
      try { peer.pc.close(); } catch {}
    }
    peers.clear();
    updateMediaButtons();
  }

  async function leaveRoom(notify = true) {
    const oldRoom = currentRoom;
    const oldToken = participantToken;
    // Immediately turn off and stop camera & microphone tracks upon leaving/closing.
    await stopLocalMedia();
    currentRoom = null;
    participant = null;
    participantToken = null;
    members = [];
    lastEventId = 0;
    pendingChatImage = null;
    pendingChatImageName = "";
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    setExpandedRoomMode(false);
    if (notify && oldRoom && oldToken) {
      try {
        await post(roomUrl(oldRoom.id, "/leave"), { token: oldToken }, { keepalive: true });
      } catch {}
    }
    if (!disposed) {
      await loadRooms();
    }
  }

  async function compressImage(file) {
    if (!file.type.startsWith("image/")) throw new Error("Vui lòng chọn tệp hình ảnh hợp lệ (PNG, JPG, WebP, GIF).");
    if (file.size <= 1.2 * 1024 * 1024) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Không đọc được tệp ảnh."));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(file);
      });
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error("Tệp ảnh quá lớn (tối đa 10 MB trước khi nén).");
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Không đọc được tệp ảnh."));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Không thể xử lý tệp ảnh."));
        img.onload = () => {
          const maxDim = 1440;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const ratio = Math.min(maxDim / width, maxDim / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
          const approxBytes = Math.floor(dataUrl.length * 3 / 4);
          if (approxBytes > IMAGE_MAX_BYTES) {
            reject(new Error("Ảnh sau khi nén vẫn vượt quá 2 MB. Hãy chọn ảnh nhỏ hơn."));
            return;
          }
          resolve(dataUrl);
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  container.addEventListener("click", async event => {
    if (
      event.target.closest("[data-room-create-toggle]") ||
      event.target.closest("[data-room-create-cancel]") ||
      event.target.closest("[data-room-refresh]")
    ) {
      return;
    }
    if (event.target.closest("[data-room-login]")) {
      document.querySelector("#login-open")?.click();
      return;
    }
    if (event.target.closest("[data-room-return-lobby]")) {
      await loadRooms();
      return;
    }
    if (event.target.closest("[data-room-image-clear]")) {
      pendingChatImage = null;
      pendingChatImageName = "";
      updateImagePreviewUI();
      return;
    }
    if (event.target.closest("[data-room-toggle-side]") && currentRoom) {
      sideCollapsed = !sideCollapsed;
      const liveSection = container.querySelector(".study-room-live");
      liveSection?.classList.toggle("is-side-collapsed", sideCollapsed);
      const headerBtn = container.querySelector(".study-room-live-head-actions [data-room-toggle-side]");
      if (headerBtn) headerBtn.textContent = sideCollapsed ? "◧ Mở khung Chat" : "◨ Mở rộng màn hình";
      return;
    }

    const join = event.target.closest("[data-room-join]");
    if (join) {
      const roomId = join.dataset.roomJoin;
      const card = join.closest("[data-room-card]");
      const isOwn = join.dataset.roomOwn === "true" || card?.dataset.isOwner === "true";
      const hasPassword = card?.dataset.hasPassword === "true";
      let password = "";
      if (hasPassword && !isOwn) {
        const entered = prompt("Phòng học này có mật khẩu. Vui lòng nhập mật khẩu để vào phòng:");
        if (entered === null) return;
        password = entered;
      }
      await enterRoom(roomId, password, false);
      return;
    }

    const monitor = event.target.closest("[data-room-monitor]");
    if (monitor) {
      await enterRoom(monitor.dataset.roomMonitor, "", true);
      return;
    }

    if (event.target.closest("[data-room-close]") && currentRoom) {
      const roomToClose = currentRoom;
      if (!confirm("Đóng phòng học này cho tất cả mọi người? Camera và mic của bạn cũng sẽ được tắt ngay lập tức.")) return;
      try {
        await post(roomUrl(roomToClose.id, "/close"), { token: participantToken });
        await leaveRoom(false);
        showError("Đã đóng phòng học và tắt camera/microphone.", true);
      } catch (error) {
        showError(error.message);
      }
      return;
    }

    if (event.target.closest("[data-room-leave]")) {
      await leaveRoom(true);
      return;
    }

    if (event.target.closest("[data-room-copy]") && currentRoom) {
      try {
        await navigator.clipboard.writeText(currentRoom.id);
        showError(`Đã sao chép mã phòng: ${currentRoom.id}`, true);
      } catch {
        prompt("Sao chép mã phòng:", currentRoom.id);
      }
      return;
    }

    if (event.target.closest("[data-room-mic]") && currentRoom && !participant?.isAdminObserver) {
      if (!localStream?.getAudioTracks().length && !micOn) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          const audioTrack = audioStream.getAudioTracks()[0];
          localStream = localStream || new MediaStream();
          localStream.addTrack(audioTrack);
          await syncLocalTracksToPeers();
        } catch {
          showError("Không mở được microphone. Hãy kiểm tra quyền truy cập microphone trên trình duyệt.");
          return;
        }
      }
      micOn = !micOn;
      for (const track of localStream?.getAudioTracks() || []) {
        track.enabled = micOn;
      }
      updateMediaButtons();
      sendEvent("media-state", { micOn, cameraOn }).catch(error => showError(error.message));
      return;
    }

    if (event.target.closest("[data-room-camera]") && currentRoom && !participant?.isAdminObserver) {
      if (!localStream?.getVideoTracks().length && !cameraOn) {
        try {
          const cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 960 }, height: { ideal: 540 }, facingMode: "user" },
            audio: false
          });
          const videoTrack = cameraStream.getVideoTracks()[0];
          localStream = localStream || new MediaStream();
          localStream.addTrack(videoTrack);
          await syncLocalTracksToPeers();
        } catch {
          showError("Không mở được camera. Hãy kiểm tra quyền truy cập camera trên trình duyệt.");
          return;
        }
      }
      cameraOn = !cameraOn;
      for (const track of localStream?.getVideoTracks() || []) {
        track.enabled = cameraOn;
      }
      const localVideo = container.querySelector("[data-local-video]");
      if (localVideo && localStream) localVideo.srcObject = localStream;
      updateMediaButtons();
      sendEvent("media-state", { micOn, cameraOn }).catch(error => showError(error.message));
      return;
    }

    if (event.target.closest("[data-room-hand]") && currentRoom && !participant?.isAdminObserver) {
      handRaised = !handRaised;
      updateMediaButtons();
      if (handRaised) {
        spawnFloatingEmote(participant?.participantId, "✋", user?.name || "Bạn");
      }
      sendEvent("hand", { raised: handRaised }).catch(error => showError(error.message));
      return;
    }

    const emoteBtn = event.target.closest("[data-room-emote]");
    if (emoteBtn && currentRoom && !participant?.isAdminObserver) {
      const emoji = emoteBtn.dataset.roomEmote;
      spawnFloatingEmote(participant?.participantId, emoji, user?.name || "Bạn");
      sendEvent("emote", { emoji }).catch(error => showError(error.message));
      return;
    }
  });

  container.addEventListener("submit", async event => {
    if (event.target.matches("[data-room-create-form]")) {
      event.preventDefault();
      event.stopPropagation();
      clearError();
      const form = event.target;
      if (!form.reportValidity()) return;
      const values = new FormData(form);
      const name = String(values.get("name") || "").trim();
      const password = String(values.get("password") || "");
      const button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        const data = await post("/api/study-rooms", { name, password });
        await enterRoom(data.roomId, password, false);
      } catch (error) {
        showError(error.message);
      } finally {
        if (button) button.disabled = false;
      }
      return;
    }

    if (event.target.matches("[data-room-chat-form]")) {
      event.preventDefault();
      if (sendBusy || participant?.isAdminObserver) return;
      const form = event.target;
      const text = String(new FormData(form).get("message") || "").trim();
      const fileInput = container.querySelector("[data-room-image]");
      const file = fileInput?.files?.[0];
      if (!text && !pendingChatImage && !file) return;
      sendBusy = true;
      const button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        const image = pendingChatImage || (file ? await compressImage(file) : null);
        await sendEvent("chat", { text, image });
        form.reset();
        pendingChatImage = null;
        pendingChatImageName = "";
        updateImagePreviewUI();
      } catch (error) {
        showError(error.message);
      } finally {
        sendBusy = false;
        if (button) button.disabled = false;
      }
    }
  });

  loadRooms();
  roomRefreshTimer = setInterval(() => {
    if (!currentRoom && !disposed && !document.hidden) void loadRooms();
  }, 5000);

  let pageHideHandled = false;
  const onPageHide = () => {
    if (pageHideHandled) return;
    pageHideHandled = true;
    const oldRoom = currentRoom;
    const oldToken = participantToken;
    // pagehide also fires when navigating away from the app, including BFCache navigation.
    // Stop all local/sender tracks immediately; do not wait for the network leave request.
    void stopLocalMedia();
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    if (oldRoom && oldToken) {
      try {
        fetch(roomUrl(oldRoom.id, "/leave"), {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: oldToken }),
          keepalive: true
        }).catch(() => {});
      } catch {}
    }
  };

  function onPageShow(event) {
    if (!event.persisted || disposed) return;
    pageHideHandled = false;
    if (!currentRoom && !localStream) return;
    // A page restored from the browser's back/forward cache must not look joined
    // after pagehide has already stopped media and sent a best-effort leave request.
    void leaveRoom(false).then(() => {
      if (!disposed) showError("Bạn đã quay lại trang; camera và microphone vẫn đang tắt.", true);
    });
  }

  function onVisibilityChange() {
    if (!document.hidden && !currentRoom && !disposed) void loadRooms();
  }

  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("beforeunload", onPageHide);
  document.addEventListener("visibilitychange", onVisibilityChange);

  return async function disposeStudyRooms() {
    disposed = true;
    clearTimeout(pollTimer);
    clearInterval(roomRefreshTimer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
    window.removeEventListener("beforeunload", onPageHide);
    setExpandedRoomMode(false);
    await leaveRoom(true);
  };
}
