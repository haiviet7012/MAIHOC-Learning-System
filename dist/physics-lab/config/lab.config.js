/**
 * physics-lab/config/lab.config.js
 * Cấu hình tổng quan của Phòng thí nghiệm Vật lí ảo 2D
 */

export const LAB_CONFIG = Object.freeze({
  title: "PHÒNG THÍ NGHIỆM VẬT LÍ ẢO 2D",
  subtitle: "Chương trình Vật lí 12 — Bộ sách Kết nối tri thức với cuộc sống",
  version: "1.0.0",
  system: "MAIHOC LEARNING SYSTEM",
  targetFPS: 60,
  maxParticles: 120,
  defaultSimulationSpeed: 1.0,
  speedOptions: [0.25, 0.5, 1.0, 2.0, 4.0],
  themeStorageKey: "maihoc-theme",
  returnUrl: "/learning?subject=Vật%20lý",
  chapters: [
    {
      id: "ch1",
      code: "CHƯƠNG I",
      name: "Vật lí nhiệt",
      icon: "🔥",
      count: 6,
      desc: "Nhiệt dung riêng, nhiệt nóng chảy, nhiệt hóa hơi, quá trình chuyển thể và định luật I nhiệt động lực học."
    },
    {
      id: "ch2",
      code: "CHƯƠNG II",
      name: "Khí lí tưởng",
      icon: "💨",
      count: 5,
      desc: "Định luật Boyle, Charles, phương trình trạng thái khí lí tưởng, chuyển động nhiệt và cơ chế hình thành áp suất."
    },
    {
      id: "ch3",
      code: "CHƯƠNG III",
      name: "Từ trường",
      icon: "🧲",
      count: 9,
      desc: "Từ trường nam châm, dòng điện thẳng, ống dây, lực từ Am-pe, cảm ứng điện từ, định luật Lenz, suất điện động và máy biến áp."
    },
    {
      id: "ch4",
      code: "CHƯƠNG IV",
      name: "Vật lí hạt nhân",
      icon: "⚛",
      count: 5,
      desc: "Cấu tạo hạt nhân, độ hụt khối và năng lượng liên kết, phân hạch - nhiệt hạch, tia phóng xạ và quy luật phân rã."
    }
  ]
});

