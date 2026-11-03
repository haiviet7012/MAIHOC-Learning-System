import { SimulationEngine } from "./core/simulation-engine.js";
import { spatialSample } from "./core/spatial-models.js";
import { escapeHTML as e } from "../js/ui.js";
import { btn } from "../js/platform/school-upgrade.js";
export function mountSchoolLab(container, { schoolId, request, report }) {
  let disposed = false,
    cleanup = () => {},
    kind = "helix",
    params = {},
    measurements = [],
    time = 0,
    engine,
    three,
    render,
    updateModel;
  const events = new AbortController();
  const configs = {
    helix: {
      field: ["B (mT)", 0.2, 10, 5, 0.1],
      speed: ["Vận tốc proton (km/s)", 10, 500, 100, 10],
      angle: ["Góc v và B (độ)", 0, 90, 60, 1],
    },
    projectile: {
      speed: ["Vận tốc (m/s)", 1, 30, 10, 1],
      angle: ["Góc nâng (độ)", 5, 85, 45, 1],
      azimuth: ["Góc phương vị (độ)", 0, 90, 25, 1],
    },
    field: {
      current: ["Dòng điện (A)", 1, 30, 10, 1],
      radius: ["Khoảng cách (cm)", 1, 50, 10, 1],
    },
  };
  container.innerHTML = `<section class="portal-panel"><div class="upgrade-actions">${btn("Thí nghiệm 2D", 'data-lab-tab="2d"')}${btn("Thí nghiệm 3D", 'data-lab-tab="3d"')}</div><div data-lab-2d><p>Thư viện 2D hiện có; dữ liệu và công thức được giữ nguyên.</p><iframe class="upgrade-lab-frame" title="Phòng thí nghiệm 2D" src="/physics-lab/?space=school"></iframe></div><div data-lab-3d hidden><label>Thí nghiệm 3D<select data-lab-kind></select></label><p data-lab-description></p><div class="upgrade-lab-grid"><div data-lab-canvas class="upgrade-lab-canvas" aria-label="Mô hình vật lí 3D"></div><div><form data-lab-params class="upgrade-form"></form><div class="upgrade-actions">${btn("Chạy", 'data-lab-action="play"')}${btn("Dừng", 'data-lab-action="pause"')}${btn("Đặt lại", 'data-lab-action="reset"')}${btn("Ghi số đo", 'data-lab-action="measure"')}${btn("Lưu phiên", 'data-lab-action="save"')}</div><output data-lab-results class="upgrade-pre"></output><p>Kéo để xoay, cuộn để phóng to. Các trục chỉ hướng; tỉ lệ hiển thị được chuẩn hóa theo từng thí nghiệm.</p></div></div><div data-lab-measurements></div><h3>Phiên đã lưu</h3><div data-lab-sessions></div></div></section>`;
  let catalog = [];
  function readParams() {
    const f = container.querySelector("[data-lab-params]");
    params = Object.fromEntries(
      [...f.querySelectorAll("input")].map((x) => [x.name, Number(x.value)]),
    );
    for (const input of f.querySelectorAll("input"))
      f.querySelector(`[data-value="${input.name}"]`).textContent = input.value;
  }
  function choose(value) {
    kind = value;
    measurements = [];
    time = 0;
    engine?.reset();
    const conf = configs[kind];
    container.querySelector("[data-lab-description]").textContent =
      catalog.find((x) => x.id === kind)?.description || "";
    container.querySelector("[data-lab-params]").innerHTML = Object.entries(
      conf,
    )
      .map(
        ([k, [label, min, max, value, step]]) =>
          `<label>${label} <output data-value="${k}">${value}</output><input name="${k}" type="range" min="${min}" max="${max}" value="${value}" step="${step}"></label>`,
      )
      .join("");
    readParams();
    updateModel?.();
    render?.();
  }
  function sample() {
    return spatialSample(kind, params, time);
  }
  function show() {
    const s = sample();
    const value =
      kind === "helix"
        ? `r = ${s.radius.toFixed(4)} m\nT = ${(s.period * 1e6).toFixed(2)} µs\nt = ${(time * 1e6).toFixed(2)} µs\nB theo trục z; lực q(v × B).`
        : kind === "projectile"
          ? `t = ${time.toFixed(2)} s\nTầm xa = ${s.range.toFixed(3)} m\nThời gian bay = ${s.flightTime.toFixed(3)} s`
          : `B = ${(s.magneticField * 1e6).toFixed(3)} µT\nB = μ₀I/(2πr); chiều theo quy tắc nắm tay phải.`;
    container.querySelector("[data-lab-results]").textContent = value;
    return s;
  }
  async function setup() {
    const data = await request(`/lab/catalog?schoolId=${schoolId}`);
    if (disposed) return;
    catalog = data.experiments;
    container.querySelector("[data-lab-kind]").innerHTML = catalog
      .map((x) => `<option value="${x.id}">${e(x.name)}</option>`)
      .join("");
    choose(kind);
    const THREE = await import("three");
    const { OrbitControls } =
      await import("three/addons/controls/OrbitControls.js");
    if (disposed) return;
    const area = container.querySelector("[data-lab-canvas]");
    try {
      three = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      report("Thiết bị không hỗ trợ WebGL. Bạn vẫn có thể dùng tab 2D.");
      return;
    }
    three.setPixelRatio(Math.min(devicePixelRatio, 2));
    area.append(three.domElement);
    three.domElement.setAttribute("aria-label", "Khung nhìn 3D: kéo để xoay");
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(document.documentElement.classList.contains("dark") ? "#171021" : "#291d40");
    const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
    camera.position.set(6, 5, 8);
    const controls = new OrbitControls(camera, three.domElement);
    controls.target.set(0, 1, 0);
    scene.add(new THREE.AxesHelper(3), new THREE.GridHelper(10, 10));
    scene.add(new THREE.AmbientLight(0xffffff, 2));
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffdc70 }),
    );
    scene.add(sphere);
    let line = null,
      scale = 1;
    render = () => {
      if (!disposed) three.render(scene, camera);
    };
    controls.addEventListener("change", render);
    updateModel = () => {
      if (line) {
        scene.remove(line);
        line.geometry.dispose();
        line.material.dispose();
      }
      const s = show(),
        points = [];
      let duration =
        kind === "helix"
          ? s.period * 2
          : kind === "projectile"
            ? s.flightTime
            : Math.PI * 2;
      scale =
        kind === "helix"
          ? 2 / Math.max(s.radius, 0.05)
          : kind === "projectile"
            ? 4 / Math.max(s.range, 1)
            : 15;
      for (let i = 0; i <= 200; i++) {
        const p = spatialSample(kind, params, (duration * i) / 200);
        points.push(new THREE.Vector3(p.x * scale, p.y * scale, p.z * scale));
      }
      line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: 0x67dbe8 }),
      );
      scene.add(line);
      sphere.position.set(0, 0, 0);
      const bounds = new THREE.Box3().setFromObject(line),
        center = bounds.getCenter(new THREE.Vector3()),
        size = bounds.getSize(new THREE.Vector3()),
        distance = Math.max(size.x, size.y, size.z, 2) * 1.6;
      controls.target.copy(center);
      camera.position
        .copy(center)
        .add(new THREE.Vector3(distance * 0.8, distance * 0.6, distance));
      camera.lookAt(center);
      controls.update();
      render();
    };
    engine = new SimulationEngine({
      onUpdate: (dt) => {
        const s = sample(),
          factor =
            kind === "helix" ? s.period / 3 : kind === "projectile" ? 1 : 1;
        const duration =
          kind === "helix"
            ? s.period * 2
            : kind === "projectile"
              ? Math.max(s.flightTime, 0.01)
              : Math.PI * 2;
        time = (time + dt * factor) % duration;
        const p = show();
        sphere.position.set(p.x * scale, p.y * scale, p.z * scale);
      },
      onRender: () => render(),
    });
    const themeObserver = new MutationObserver(() => {
      scene.background.set(document.documentElement.classList.contains('dark') ? '#171021' : '#291d40');
      render();
    });
    themeObserver.observe(document.documentElement, {attributes:true,attributeFilter:['class']});
    const size = new ResizeObserver(() => {
      if (!area.clientWidth) return;
      three.setSize(area.clientWidth, 380);
      camera.aspect = area.clientWidth / 380;
      camera.updateProjectionMatrix();
      render();
    });
    size.observe(area);
    cleanup = () => {
      engine.destroy();
      size.disconnect();
      themeObserver.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose();
        if (o.material)
          Array.isArray(o.material)
            ? o.material.forEach((m) => m.dispose())
            : o.material.dispose();
      });
      three.dispose();
      three.forceContextLoss();
    };
    updateModel();
    await history();
  }
  async function history() {
    const r = await request(`/lab/sessions?schoolId=${schoolId}`);
    if (!disposed)
      container.querySelector("[data-lab-sessions]").innerHTML =
        r.sessions
          .map(
            (s) =>
              `<p>${e(s.experiment)} · ${new Date(s.created_at).toLocaleString("vi-VN")} · ${s.measurements.length} số đo</p>`,
          )
          .join("") || "<p>Chưa có phiên đã lưu.</p>";
  }
  container.addEventListener(
    "change",
    (ev) => {
      if (ev.target.matches("[data-lab-kind]")) choose(ev.target.value);
    },
    { signal: events.signal },
  );
  container.addEventListener(
    "input",
    (ev) => {
      if (ev.target.closest("[data-lab-params]")) {
        time = 0;
        readParams();
        updateModel?.();
      }
    },
    { signal: events.signal },
  );
  container.addEventListener(
    "click",
    (ev) => {
      const el = ev.target.closest("button");
      if (!el) return;
      const run = async () => {
        if (el.dataset.labTab) {
          const active = el.dataset.labTab === "3d";
          container.querySelector("[data-lab-2d]").hidden = active;
          container.querySelector("[data-lab-3d]").hidden = !active;
          if (!active) engine?.pause();
          render?.();
        }
        const a = el.dataset.labAction;
        if (!a) return;
        if (!engine) throw new Error("3D chưa sẵn sàng trên thiết bị này.");
        if (a === "play") engine.start();
        if (a === "pause") engine.pause();
        if (a === "reset") {
          engine.reset();
          time = 0;
          updateModel();
        }
        if (a === "measure") {
          if (measurements.length >= 100)
            throw new Error("Tối đa 100 số đo/phiên.");
          measurements.push({ time, ...params, ...sample() });
          container.querySelector("[data-lab-measurements]").textContent =
            `Đã ghi ${measurements.length} số đo.`;
        }
        if (a === "save") {
          await request("/lab/sessions", {
            method: "POST",
            body: {
              schoolId,
              experiment: kind,
              parameters: params,
              measurements,
            },
          });
          report("Đã lưu phiên thí nghiệm trên backend.");
          await history();
        }
      };
      run().catch((err) => report(err.message));
    },
    { signal: events.signal },
  );
  setup().catch((err) => {
    if (!disposed) report(err.message);
  });
  return () => {
    disposed = true;
    events.abort();
    cleanup();
  };
}
