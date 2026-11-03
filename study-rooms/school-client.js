import { escapeHTML as e } from "../js/ui.js";
import { btn, field, upgradeApi } from "../js/platform/school-upgrade.js";
export function mountSchoolRooms(
  container,
  { schoolId, user, request, report },
) {
  let disposed = false,
    room = null,
    roomId = null,
    owner = false,
    state = null,
    timer,
    heartbeat,
    busy = false,
    lastMessages = "",
    lastAi = "";
  const events = new AbortController();
  const path = (p) => `/rooms/${roomId}${p}`;
  function clearTimers() {
    clearTimeout(timer);
    clearInterval(heartbeat);
  }
  function disconnect() {
    clearTimers();
    if (room) {
      room.removeAllListeners();
      room.localParticipant.trackPublications.forEach((p) => p.track?.stop());
      room.disconnect();
      room = null;
    }
    if (roomId) {
      request(path("/leave"), { method: "POST", body: {} }).catch(() => {});
      roomId = null;
    }
  }
  async function lobby() {
    disconnect();
    const data = await request(`/rooms?schoolId=${schoolId}`);
    if (disposed) return;
    container.innerHTML = `<section class="portal-panel"><h2>Học cùng lớp, tối đa 50 người</h2><p>Camera, âm thanh, chia sẻ màn hình, ghi MP4 và AI riêng trong phòng.</p>${!data.configured ? '<p class="upgrade-warning">Chưa kết nối dịch vụ video. Quản trị viên cần cấu hình LiveKit trước khi tạo phòng.</p>' : ""}<form data-room-create class="upgrade-form">${field("title", "Tên phòng")}${field("classId", "Mã lớp (tùy chọn; bỏ trống để mở trong trường)", '<input name="classId" type="number" min="1">')}<button class="button primary" ${data.configured ? "" : "disabled"}>Tạo phòng School</button></form></section><section class="portal-panel"><h2>Phòng trong trường</h2>${data.rooms.map((r) => `<article class="upgrade-list-item"><strong>${e(r.title)}</strong><p>Chủ phòng: ${e(r.owner_name)} · ${r.locked ? "Đang khóa" : "Đang mở"}</p>${btn("Tham gia", `data-room-join="${r.id}"`)}${String(r.owner_id) === String(user.id) ? btn("Đóng phòng", `data-room-close="${r.id}"`) : ""}</article>`).join("") || "<p>Chưa có phòng học.</p>"}</section>`;
  }
  async function join(id) {
    if (
      !confirm(
        "Phòng có thể được chủ phòng ghi hình camera, âm thanh và màn hình chia sẻ để thành viên xem lại trong 30 ngày. Bạn đồng ý tham gia?",
      )
    )
      return;
    report("Đang kết nối phòng…");
    roomId = id;
    const token = await request(path("/token"), {
      method: "POST",
      body: { consent: true },
    });
    if (disposed) return;
    owner = token.owner;
    const { Room, RoomEvent, Track, VideoPresets } =
      await import("livekit-client");
    if (disposed) return;
    room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: { resolution: VideoPresets.h360.resolution },
      publishDefaults: { simulcast: true },
    });
    container.innerHTML = `<section class="portal-panel"><h2>${e(token.room.title)}</h2><p data-room-live-status role="status">Đang kết nối…</p><p data-room-record-status aria-live="polite">Chưa ghi hình.</p><div class="upgrade-room-grid"><div><div class="upgrade-video-grid" data-room-videos></div><div class="upgrade-actions">${btn("Bật mic", 'data-room-action="mic"')}${btn("Bật camera", 'data-room-action="camera"')}${btn("Giơ tay", 'data-room-action="hand"')}${btn("Chia sẻ màn hình", 'data-room-action="screen"')}${owner ? btn("Bắt đầu ghi MP4", 'data-room-action="record"') + btn("Khóa phòng", 'data-room-action="lock"') : ""}${btn("Rời phòng", 'data-room-action="leave"')}</div><div data-room-people></div><h3>Bản ghi cuộc họp</h3><div data-room-recordings></div></div><aside><h3>Chat nhóm</h3><div data-room-messages class="upgrade-message-list" aria-live="polite"></div><form data-room-chat class="upgrade-form"><label>Tin nhắn<textarea name="message" rows="2" required maxlength="4000"></textarea></label><button class="button secondary">Gửi nhóm</button></form><h3>AI phòng học · riêng tư</h3><p>AI dùng engine/API riêng. Chỉ bạn thấy phản hồi cho đến khi bấm chia sẻ.</p><form data-room-ai class="upgrade-form"><label>Câu hỏi cho AI<textarea name="message" rows="3" required maxlength="8000"></textarea></label><button class="button primary">Hỏi AI</button></form><div data-room-ai-answer class="upgrade-pre" aria-live="polite"></div>${btn("Chia sẻ câu trả lời AI vào nhóm", 'data-room-action="share-ai"')}</aside></div></section>`;
    const videos = container.querySelector("[data-room-videos]");
    function renderMedia() {
      if (disposed || !room) return;
      videos.replaceChildren();
      const participants = [
        room.localParticipant,
        ...room.remoteParticipants.values(),
      ];
      const people = container.querySelector("[data-room-people]");
      people.innerHTML = `<p>${participants.length}/50 người · chỉ tải tối đa 6 camera và màn hình đang chia sẻ.</p>${participants.map((p) => `<span class="upgrade-person">${e(p.name || p.identity)}${owner && p.identity !== String(user.id) ? btn("Mời ra", `data-room-remove="${e(p.identity)}"`) : ""}</span>`).join("")}`;
      let cameras = 0;
      for (const participant of participants) {
        for (const pub of participant.trackPublications.values()) {
          const screen = pub.source === Track.Source.ScreenShare,
            show = screen || pub.kind === Track.Kind.Audio || cameras < 6;
          if (participant !== room.localParticipant) pub.setSubscribed(show);
          if (pub.kind === Track.Kind.Video && !screen && show) cameras++;
          if (!show || !pub.track || pub.isMuted) continue;
          if (pub.kind === Track.Kind.Audio) {
            if (participant === room.localParticipant) continue;
            const audio = pub.track.attach();
            audio.autoplay = true;
            videos.append(audio);
            continue;
          }
          const tile = document.createElement("figure");
          if (screen) tile.className = "upgrade-screen-tile";
          const video = pub.track.attach();
          video.autoplay = true;
          video.playsInline = true;
          video.muted = participant === room.localParticipant;
          tile.append(video);
          const caption = document.createElement("figcaption");
          caption.textContent =
            (participant.name || participant.identity) +
            (screen ? " · màn hình" : "");
          tile.append(caption);
          videos.append(tile);
        }
      }
    }
    for (const event of [
      RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed,
      RoomEvent.TrackPublished,
      RoomEvent.TrackUnpublished,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
    ])
      room.on(event, renderMedia);
    room.on(RoomEvent.Disconnected, () => {
      if (!disposed) {
        report("Đã ngắt kết nối phòng.");
        lobby().catch((err) => report(err.message));
      }
    });
    room.on(RoomEvent.Reconnecting, () => report("Đang kết nối lại…"));
    room.on(RoomEvent.Reconnected, () => report("Đã kết nối lại."));
    try {
      await room.connect(token.url, token.token, { autoSubscribe: false });
      if (disposed) {
        room.disconnect();
        return;
      }
      container.querySelector("[data-room-live-status]").textContent =
        "Đã kết nối · mic và camera đang tắt cho đến khi bạn bật.";
      renderMedia();
      await poll();
      heartbeat = setInterval(
        () =>
          request(path("/heartbeat"), { method: "POST", body: {} }).catch(
            (err) => {
              if ([401, 403].includes(err.status)) disconnect();
              report(err.message);
            },
          ),
        25000,
      );
      report("");
    } catch (err) {
      disconnect();
      throw err;
    }
  }
  async function poll() {
    if (disposed || !roomId || !room) return;
    try {
      state = await request(path("/state"));
      if (disposed || !room) return;
      const active = state.recordings.find((r) =>
        ["starting", "recording", "stopping", "processing"].includes(r.status),
      );
      container.querySelector("[data-room-record-status]").textContent = active
        ? `● Ghi hình: ${active.status} · camera/âm thanh/màn hình chung có thể được lưu.`
        : "Chưa có ghi hình đang chạy.";
      const record = container.querySelector('[data-room-action="record"]');
      if (record) {
        record.textContent = active ? "Dừng ghi MP4" : "Bắt đầu ghi MP4";
        record.disabled =
          !!active && ["processing", "stopping"].includes(active.status);
      }
      container.querySelector("[data-room-recordings]").innerHTML =
        state.recordings
          .map(
            (r) =>
              `<p>${new Date(r.created_at).toLocaleString("vi-VN")} · ${e(r.status)} ${r.status === "ready" ? `<a href="${upgradeApi}${path(`/recordings/${r.id}/file`)}">Tải MP4</a>` : ""}</p>`,
          )
          .join("") || "<p>Chưa có bản ghi.</p>";
      const messages = JSON.stringify(state.messages);
      if (messages !== lastMessages) {
        lastMessages = messages;
        container.querySelector("[data-room-messages]").innerHTML =
          state.messages
            .map(
              (m) =>
                `<article><strong>${e(m.name)}</strong><p class="upgrade-pre">${e(m.content)}</p></article>`,
            )
            .join("");
      }
    } catch (err) {
      if (!disposed) report(err.message);
    } finally {
      if (!disposed && room) timer = setTimeout(poll, 3500);
    }
  }
  container.addEventListener(
    "submit",
    (ev) => {
      ev.preventDefault();
      const f = ev.target;
      const run = async () => {
        const b = f.querySelector("button");
        b.disabled = true;
        try {
          if (f.matches("[data-room-create]")) {
            const r = await request("/rooms", {
              method: "POST",
              body: {
                schoolId,
                title: f.elements.title.value,
                classId: f.elements.classId.value,
              },
            });
            await join(r.id);
          }
          if (f.matches("[data-room-chat]")) {
            await request(path("/messages"), {
              method: "POST",
              body: { message: f.elements.message.value },
            });
            f.reset();
          }
          if (f.matches("[data-room-ai]")) {
            const r = await request(path("/ai/messages"), {
              method: "POST",
              body: {
                message: f.elements.message.value,
                requestKey: crypto.randomUUID(),
              },
            });
            lastAi = r.answer;
            if (!disposed && room)
              container.querySelector("[data-room-ai-answer]").textContent =
                r.answer;
          }
        } finally {
          if (b.isConnected) b.disabled = false;
        }
      };
      run().catch((err) => {
        if (!disposed) report(err.message);
      });
    },
    { signal: events.signal },
  );
  container.addEventListener(
    "click",
    (ev) => {
      const b = ev.target.closest("button");
      if (!b || busy) return;
      const run = async () => {
        busy = true;
        try {
          if (b.dataset.roomJoin) await join(b.dataset.roomJoin);
          if (b.dataset.roomClose && confirm("Đóng phòng học này?")) {
            await request(`/rooms/${b.dataset.roomClose}`, {
              method: "DELETE",
            });
            await lobby();
          }
          if (b.dataset.roomRemove)
            await request(path("/remove"), {
              method: "POST",
              body: { userId: b.dataset.roomRemove },
            });
          const a = b.dataset.roomAction;
          if (!a || !room) return;
          if (a === "leave") {
            await lobby();
            return;
          }
          if (a === "mic") {
            await room.localParticipant.setMicrophoneEnabled(
              !room.localParticipant.isMicrophoneEnabled,
            );
            b.textContent = room.localParticipant.isMicrophoneEnabled
              ? "Tắt mic"
              : "Bật mic";
          }
          if (a === "camera") {
            await room.localParticipant.setCameraEnabled(
              !room.localParticipant.isCameraEnabled,
            );
            b.textContent = room.localParticipant.isCameraEnabled
              ? "Tắt camera"
              : "Bật camera";
          }
          if (a === "hand")
            await request(path("/messages"), {
              method: "POST",
              body: { message: "✋ Xin phát biểu." },
            });
          if (a === "screen") {
            if (!navigator.mediaDevices?.getDisplayMedia)
              throw new Error(
                "Trình duyệt này chưa hỗ trợ chia sẻ màn hình. Bạn vẫn xem được màn hình người khác.",
              );
            const enabled = !room.localParticipant.isScreenShareEnabled;
            await request(path("/screen"), {
              method: "POST",
              body: { enabled },
            });
            try {
              await room.localParticipant.setScreenShareEnabled(enabled, {
                audio: true,
              });
              b.textContent = enabled ? "Dừng chia sẻ" : "Chia sẻ màn hình";
              if (enabled) {
                const publication = [
                  ...room.localParticipant.trackPublications.values(),
                ].find((p) => p.source === "screen_share");
                publication?.track?.mediaStreamTrack.addEventListener(
                  "ended",
                  () => {
                    if (roomId)
                      request(path("/screen"), {
                        method: "POST",
                        body: { enabled: false },
                      }).catch(() => {});
                    b.textContent = "Chia sẻ màn hình";
                  },
                  { once: true },
                );
              }
            } catch (err) {
              await request(path("/screen"), {
                method: "POST",
                body: { enabled: false },
              });
              throw err;
            }
          }
          if (a === "lock") {
            await request(path("/lock"), {
              method: "POST",
              body: { locked: !state?.room.locked },
            });
            b.textContent = state?.room.locked ? "Khóa phòng" : "Mở khóa phòng";
          }
          if (a === "record") {
            const active = state?.recordings.find((r) =>
              ["starting", "recording"].includes(r.status),
            );
            await request(
              path(active ? `/recordings/${active.id}/stop` : "/recordings"),
              { method: "POST", body: {} },
            );
            report(active ? "Đang hoàn tất MP4…" : "Đã yêu cầu ghi hình.");
          }
          if (a === "share-ai") {
            if (!lastAi) throw new Error("Chưa có câu trả lời AI để chia sẻ.");
            await request(path("/messages"), {
              method: "POST",
              body: {
                message: `AI (do ${user.name} chia sẻ):\n${lastAi}`.slice(
                  0,
                  4000,
                ),
              },
            });
          }
        } finally {
          busy = false;
        }
      };
      run().catch((err) => {
        if (!disposed) report(err.message);
      });
    },
    { signal: events.signal },
  );
  lobby().catch((err) => report(err.message));
  return () => {
    disposed = true;
    events.abort();
    disconnect();
  };
}
