/**
 * physics-lab/config/experiment-catalog.config.js
 * Danh mục chuẩn xác và đầy đủ 25 thí nghiệm Vật lí 12 (Bộ sách Kết nối tri thức)
 */

export const EXPERIMENT_CATALOG = [
  // ==========================================
  // CHƯƠNG I: VẬT LÍ NHIỆT (6 thí nghiệm)
  // ==========================================
  {
    id: "exp-01",
    chapterId: "ch1",
    chapterName: "Chương I: Vật lí nhiệt",
    idx: 1,
    title: "Xác định nhiệt dung riêng của một chất",
    desc: "Mô phỏng 3D tương tác 360° máy biến áp với lõi thép ghép kín kỹ thuật điện, cuộn sơ cấp N₁ và cuộn thứ cấp N₂, đường sức từ thông xoay chiều khép kín trong lõi sắt.",
    formula: "c = Q / [m · (T₂ - T₁)] = (P · t) / [m · ΔT]",
    formulaDesc: "Nhiệt lượng Q cấp bởi nguồn nhiệt P·t làm khối lượng m tăng nhiệt độ từ T₁ lên T₂. Bỏ qua nhiệt lượng thất thoát ra môi trường.",
    siUnits: "c: J/(kg·K); P: Watt; m: kg; T: K hoặc °C",
    params: [
      { id: "mass", label: "Khối lượng chất lỏng (m)", unit: "kg", min: 0.1, max: 0.8, step: 0.05, defaultValue: 0.3 },
      { id: "power", label: "Công suất nguồn nhiệt (P)", unit: "W", min: 50, max: 400, step: 25, defaultValue: 150 },
      { id: "tInitial", label: "Nhiệt độ ban đầu (T₁)", unit: "°C", min: 15, max: 35, step: 1, defaultValue: 25 }
    ],
    graph: { title: "Nhiệt độ T(t) theo thời gian", xLabel: "t (s)", yLabel: "T (°C)", type: "linear" },
    instructions: {
      goal: "Xác định thực nghiệm nhiệt dung riêng của chất lỏng và kiểm chứng công thức truyền nhiệt Q = mcΔT.",
      tools: ["Bình nhiệt lượng kế cách nhiệt", "Dây nung điện trở", "Nhiệt kế điện tử", "Oát kế và đồng hồ bấm giây"],
      steps: [
        "1. Thiết lập khối lượng chất lỏng m và công suất nguồn P trên bảng tham số.",
        "2. Nhấn 'Bắt đầu' để cấp điện cho dây nung.",
        "3. Quan sát nhiệt kế hiển thị nhiệt độ tăng dần và đường đồ thị T(t).",
        "4. Dừng thí nghiệm, ghi nhận nhiệt độ cuối T₂ và thời gian t, tính giá trị nhiệt dung riêng c."
      ],
      discussion: "Tại sao trong thực tế nhiệt dung riêng tính được thường lớn hơn giá trị chuẩn trong bảng tra cứu? (Do một phần nhiệt lượng truyền cho bình và thất thoát ra không khí)."
    }
  },
  {
    id: "exp-02",
    chapterId: "ch1",
    chapterName: "Chương I: Vật lí nhiệt",
    idx: 2,
    title: "Xác định nhiệt nóng chảy riêng của nước đá",
    desc: "Khảo sát quá trình nước đá nhận nhiệt lượng để chuyển hoàn toàn thành nước lỏng tại nhiệt độ nóng chảy 0°C.",
    formula: "λ = Q / m_đá = (P · t) / m_đá",
    formulaDesc: "Nhiệt nóng chảy riêng λ là nhiệt lượng cần cung cấp cho 1 kg chất rắn để nó nóng chảy hoàn toàn ở nhiệt độ nóng chảy.",
    siUnits: "λ: J/kg; Q: Joule; m: kg",
    params: [
      { id: "iceMass", label: "Khối lượng nước đá (m)", unit: "g", min: 20, max: 150, step: 10, defaultValue: 50 },
      { id: "heaterPower", label: "Công suất nguồn cấp (P)", unit: "W", min: 40, max: 200, step: 10, defaultValue: 100 }
    ],
    graph: { title: "Nhiệt độ hệ theo thời gian chuyển pha", xLabel: "t (s)", yLabel: "T (°C)", type: "plateau" },
    instructions: {
      goal: "Đo đạc và xác định nhiệt nóng chảy riêng λ của nước đá tại 0°C.",
      tools: ["Cốc chứa nước đá vụn", "Nguồn nhiệt ổn định", "Nhiệt kế", "Cân điện tử"],
      steps: [
        "1. Cho nước đá ở 0°C vào bình nhiệt lượng kế.",
        "2. Cung cấp nhiệt lượng ổn định và bấm giờ theo dõi.",
        "3. Quan sát nhiệt độ luôn giữ không đổi ở 0°C trong suốt quá trình đá đang tan.",
        "4. Khi đá tan hết, nhiệt độ mới bắt đầu tăng lên. Tính λ = (P · t) / m."
      ],
      discussion: "Nhiệt lượng cung cấp trong quá trình nóng chảy được dùng vào việc gì khi nhiệt độ không tăng? (Dùng để phá vỡ liên kết tinh thể băng)."
    }
  },
  {
    id: "exp-03",
    chapterId: "ch1",
    chapterName: "Chương I: Vật lí nhiệt",
    idx: 3,
    title: "Xác định nhiệt hóa hơi riêng của nước",
    desc: "Đo điện năng tiêu thụ và khối lượng nước bay hơi khi sôi ở 100°C để xác định nhiệt hóa hơi riêng L.",
    formula: "L = Q / Δm = (P · t) / Δm",
    formulaDesc: "Nhiệt hóa hơi riêng L là nhiệt lượng cần thiết để 1 kg chất lỏng hóa hơi hoàn toàn ở nhiệt độ sôi.",
    siUnits: "L: J/kg; P: W; t: s; Δm: kg",
    params: [
      { id: "waterPower", label: "Công suất ấm đun (P)", unit: "W", min: 300, max: 1200, step: 100, defaultValue: 600 },
      { id: "initialWater", label: "Khối lượng nước ban đầu", unit: "g", min: 100, max: 400, step: 50, defaultValue: 200 }
    ],
    graph: { title: "Khối lượng nước còn lại theo thời gian", xLabel: "t (s)", yLabel: "m (g)", type: "linear-down" },
    instructions: {
      goal: "Xác định thực nghiệm nhiệt hóa hơi riêng L của nước ở áp suất khí quyển chuẩn.",
      tools: ["Ấm đun nước thủy tinh", "Cân điện tử có độ chính xác 0.1g", "Oát kế đo công suất"],
      steps: [
        "1. Đun nước đến nhiệt độ sôi 100°C.",
        "2. Bắt đầu bấm giờ và ghi nhận sự giảm khối lượng Δm của nước trên cân điện tử.",
        "3. Dùng công thức L = (P · t) / Δm để xác định nhiệt hóa hơi riêng của nước."
      ],
      discussion: "So sánh nhiệt hóa hơi riêng L với nhiệt nóng chảy riêng λ của nước, tại sao L lớn hơn λ rất nhiều? (Vì phân tử hơi hoàn toàn tách rời nhau)."
    }
  },
  {
    id: "exp-04",
    chapterId: "ch1",
    chapterName: "Chương I: Vật lí nhiệt",
    idx: 4,
    title: "Mô phỏng quá trình nóng chảy và đông đặc",
    desc: "Mô hình vi mô hạt: chuyển động dao động quanh nút mạng tinh thể sang chuyển động trượt tự do và ngược lại.",
    formula: "E_k = 3/2 · kB · T  (kB = 1.38 × 10⁻²³ J/K)",
    formulaDesc: "Khi tăng nhiệt độ, động năng nhiệt của các hạt tăng lên, dao động mạnh và phá vỡ cấu trúc mạng tinh thể chất rắn.",
    siUnits: "T: K; Ek: Joule",
    params: [
      { id: "latticeTemp", label: "Nhiệt độ hệ (T)", unit: "K", min: 100, max: 500, step: 10, defaultValue: 200 }
    ],
    graph: { title: "Năng lượng liên kết vi mô theo nhiệt độ", xLabel: "T (K)", yLabel: "Trạng thái", type: "phase" },
    instructions: {
      goal: "Quan sát trực quan sự biến đổi cấu trúc hạt giữa thể rắn và thể lỏng.",
      tools: ["Mô hình mạng tinh thể hạt 2D", "Thanh trượt nhiệt độ tương tác"],
      steps: [
        "1. Kéo nhiệt độ dưới nhiệt độ nóng chảy: các hạt dao động quanh vị trí cân bằng cố định (thể rắn).",
        "2. Tăng nhiệt độ qua điểm nóng chảy: mạng tinh thể bị phá vỡ, các hạt trượt hỗn loạn (thể lỏng).",
        "3. Hạ nhiệt độ trở lại để quan sát quá trình đông đặc và tái lập cấu trúc mạng."
      ],
      discussion: "Nêu sự khác biệt về khoảng cách và lực tương tác giữa các hạt ở thể rắn và thể lỏng."
    }
  },
  {
    id: "exp-05",
    chapterId: "ch1",
    chapterName: "Chương I: Vật lí nhiệt",
    idx: 5,
    title: "Mô phỏng quá trình hóa hơi và ngưng tụ",
    desc: "Khảo sát chuyển động của các phân tử chất lỏng và phân tử hơi trong bình kín; quan sát trạng thái cân bằng động.",
    formula: "Tốc độ bay hơi = Tốc độ ngưng tụ (Áp suất hơi bão hòa)",
    formulaDesc: "Tại trạng thái cân bằng động, số phân tử thoát khỏi mặt thoáng chất lỏng bằng số phân tử hơi ngưng tụ trở lại.",
    siUnits: "Áp suất hơi: kPa; Nhiệt độ: °C",
    params: [
      { id: "fluidTemp", label: "Nhiệt độ chất lỏng", unit: "°C", min: 20, max: 95, step: 5, defaultValue: 50 }
    ],
    graph: { title: "Áp suất hơi bão hòa theo nhiệt độ", xLabel: "T (°C)", yLabel: "p (kPa)", type: "exp-curve" },
    instructions: {
      goal: "Hiểu bản chất vi mô của sự bay hơi, ngưng tụ và áp suất hơi bão hòa.",
      tools: ["Bình kín chứa mặt thoáng chất lỏng", "Cảm biến đếm số lượng phân tử pha khí"],
      steps: [
        "1. Tăng nhiệt độ chất lỏng để tăng số phân tử có động năng lớn thoát khỏi mặt thoáng.",
        "2. Quan sát các phân tử hơi va chạm và ngưng tụ quay lại mặt thoáng.",
        "3. Khi đạt cân bằng động, mật độ phân tử pha hơi không đổi (hơi bão hòa)."
      ],
      discussion: "Tại sao khi nhiệt độ tăng thì áp suất hơi bão hòa tăng rất nhanh? (Do số hạt đủ động năng thoát ra tăng theo hàm mũ)."
    }
  },
  {
    id: "exp-06",
    chapterId: "ch1",
    chapterName: "Chương I: Vật lí nhiệt",
    idx: 6,
    title: "Mô phỏng sự thay đổi nội năng khi truyền nhiệt và thực hiện công",
    desc: "Khảo sát định luật I nhiệt động lực học qua mô hình xi-lanh có piston nén/giãn và nguồn cấp nhiệt.",
    formula: "ΔU = A + Q  (với A = -p · ΔV)",
    formulaDesc: "Độ biến thiên nội năng của hệ bằng tổng đại số nhiệt lượng và công mà hệ nhận được. Quy ước dấu: nhận vào dương (+), sinh ra âm (-).",
    siUnits: "U, A, Q: Joule (J); p: Pa; V: m³",
    params: [
      { id: "heatTransferred", label: "Nhiệt lượng truyền (Q)", unit: "J", min: -200, max: 300, step: 25, defaultValue: 100 },
      { id: "workDone", label: "Công hệ nhận (A)", unit: "J", min: -150, max: 150, step: 15, defaultValue: 50 }
    ],
    graph: { title: "Biểu đồ cột nội năng U, công A và nhiệt Q", xLabel: "Đại lượng", yLabel: "Năng lượng (J)", type: "bar" },
    instructions: {
      goal: "Vận dụng và kiểm chứng định luật I nhiệt động lực học trong các quá trình biến đổi.",
      tools: ["Xi-lanh có piston di động", "Nguồn nhiệt và cơ cấu nén khí"],
      steps: [
        "1. Tác dụng lực nén khí (A > 0) hoặc để khí giãn nở sinh công (A < 0).",
        "2. Cung cấp nhiệt lượng (Q > 0) hoặc làm mát hệ (Q < 0).",
        "3. Quan sát sự thay đổi thanh nội năng ΔU và sự thay đổi tốc độ chuyển động phân tử."
      ],
      discussion: "Nếu hệ nhận công 100 J và truyền ra môi trường nhiệt lượng 40 J thì nội năng của hệ biến thiên bao nhiêu? (ΔU = 100 - 40 = +60 J)."
    }
  },

  // ==========================================
  // CHƯƠNG II: KHÍ LÍ TƯỞNG (5 thí nghiệm)
  // ==========================================
  {
    id: "exp-07",
    chapterId: "ch2",
    chapterName: "Chương II: Khí lí tưởng",
    idx: 7,
    title: "Thí nghiệm khảo sát định luật Boyle",
    desc: "Khảo sát mối quan hệ giữa áp suất p và thể tích V của một lượng khí xác định ở nhiệt độ không đổi.",
    formula: "p₁ · V₁ = p₂ · V₂ = const  (T = hằng số)",
    formulaDesc: "Trong quá trình đẳng nhiệt, áp suất của một lượng khí xác định tỉ lệ nghịch với thể tích của nó. Đồ thị p-V là một đường hyperbol.",
    siUnits: "p: Pa hoặc kPa; V: m³ hoặc Lít; T: K",
    params: [
      { id: "volume", label: "Thể tích khí (V)", unit: "Lít", min: 0.5, max: 4.0, step: 0.1, defaultValue: 2.0 },
      { id: "tempK", label: "Nhiệt độ hệ (T)", unit: "K", min: 200, max: 500, step: 10, defaultValue: 300 },
      { id: "molN", label: "Lượng chất (n)", unit: "mol", min: 0.05, max: 0.2, step: 0.01, defaultValue: 0.1 }
    ],
    graph: { title: "Đường đẳng nhiệt p - V (Hyperbol)", xLabel: "V (L)", yLabel: "p (kPa)", type: "hyperbola" },
    instructions: {
      goal: "Kiểm nghiệm định luật Boyle: Tích p·V là hằng số ở nhiệt độ không đổi.",
      tools: ["Xi-lanh thủy tinh chia độ có piston kín", "Áp kế đo áp suất", "Nhiệt kế theo dõi nhiệt độ"],
      steps: [
        "1. Kéo thả trực tiếp cần piston hoặc chỉnh thanh trượt Thể tích (V).",
        "2. Đọc giá trị áp suất tương ứng trên áp kế.",
        "3. Quan sát tích số p·V trên bảng kết quả và đường hyperbol trên đồ thị.",
        "4. Thay đổi nhiệt độ T để quan sát sự dịch chuyển của đường đẳng nhiệt."
      ],
      discussion: "Tại sao khi nén piston giảm một nửa thể tích thì áp suất khí lại tăng gấp đôi? (Mật độ hạt tăng gấp đôi khiến tần số va chạm lên thành bình tăng gấp đôi)."
    }
  },
  {
    id: "exp-08",
    chapterId: "ch2",
    chapterName: "Chương II: Khí lí tưởng",
    idx: 8,
    title: "Thí nghiệm khảo sát định luật Charles",
    desc: "Khảo sát quá trình đẳng áp: Thể tích V tỉ lệ thuận với nhiệt độ tuyệt đối T.",
    formula: "V / T = const ⟺ V₁ / T₁ = V₂ / T₂  (p = hằng số)",
    formulaDesc: "Trong quá trình đẳng áp, thể tích của một lượng khí xác định tỉ lệ thuận với nhiệt độ tuyệt đối của nó. Đồ thị V-T đi qua gốc O (0 K).",
    siUnits: "V: Lít; T: Kelvin (K)",
    params: [
      { id: "tempT", label: "Nhiệt độ tuyệt đối (T)", unit: "K", min: 200, max: 600, step: 10, defaultValue: 300 },
      { id: "fixedPressure", label: "Áp suất duy trì (p)", unit: "kPa", min: 50, max: 200, step: 10, defaultValue: 100 }
    ],
    graph: { title: "Đường đẳng áp V - T", xLabel: "T (K)", yLabel: "V (L)", type: "isobar" },
    instructions: {
      goal: "Kiểm chứng định luật Charles và hiểu ý nghĩa của độ không tuyệt đối 0 K (-273.15°C).",
      tools: ["Bình chứa khí có piston di động tự do", "Bếp gia nhiệt điều chỉnh được", "Nhiệt kế điện tử"],
      steps: [
        "1. Đốt nóng bình khí bằng cách tăng nhiệt độ T trên bảng điều khiển.",
        "2. Quan sát piston tự động dịch chuyển để giữ áp suất bên trong bằng áp suất ngoài.",
        "3. Ghi nhận mối quan hệ tuyến tính giữa V và T trên đồ thị.",
        "4. Quan sát đường kéo dài của đồ thị cắt trục hoành tại 0 K."
      ],
      discussion: "Ý nghĩa vật lí của điểm 0 K là gì? (Là nhiệt độ mà động năng nhiệt của các phân tử đạt mức tối thiểu)."
    }
  },
  {
    id: "exp-09",
    chapterId: "ch2",
    chapterName: "Chương II: Khí lí tưởng",
    idx: 9,
    title: "Thí nghiệm khảo sát phương trình trạng thái khí lí tưởng",
    desc: "Khảo sát đồng thời sự thay đổi của cả ba thông số p, V và T qua phương trình Clapeyron - Mendeleev.",
    formula: "(p · V) / T = n · R = const  (R = 8.314 J/(mol·K))",
    formulaDesc: "Phương trình trạng thái liên hệ đầy đủ ba thông số vĩ mô của khí lí tưởng với lượng chất n và hằng số khí R.",
    siUnits: "p: Pa; V: m³; T: K; n: mol",
    params: [
      { id: "stateV", label: "Thể tích khí (V)", unit: "Lít", min: 1.0, max: 5.0, step: 0.2, defaultValue: 2.0 },
      { id: "stateT", label: "Nhiệt độ (T)", unit: "K", min: 200, max: 600, step: 20, defaultValue: 300 },
      { id: "stateN", label: "Lượng chất (n)", unit: "mol", min: 0.05, max: 0.3, step: 0.05, defaultValue: 0.1 }
    ],
    graph: { title: "Mặt trạng thái p - V - T", xLabel: "V (L)", yLabel: "p (kPa)", type: "state-surface" },
    instructions: {
      goal: "Xác minh mối quan hệ (p·V)/T = nR khi thay đổi linh hoạt các thông số.",
      tools: ["Bình khí đa năng tích hợp van xả, đồng hồ đo áp suất, thể tích và nhiệt độ"],
      steps: [
        "1. Thiết lập thể tích V, nhiệt độ T và lượng khí n.",
        "2. Hệ thống tính toán và hiển thị áp suất tương ứng p = nRT/V.",
        "3. Thử nghiệm các trạng thái đặc biệt: đẳng nhiệt, đẳng áp, đẳng tích."
      ],
      discussion: "Trong điều kiện nào thì khí thực có thể coi gần đúng là khí lí tưởng? (Ở áp suất thấp và nhiệt độ cao)."
    }
  },
  {
    id: "exp-10",
    chapterId: "ch2",
    chapterName: "Chương II: Khí lí tưởng",
    idx: 10,
    title: "Mô phỏng chuyển động nhiệt của các phân tử khí",
    desc: "Quan sát chuyển động Brown và phân bố tốc độ phân tử khí Maxwell - Boltzmann theo nhiệt độ.",
    formula: "v_rms = √(3·R·T / μ) = √(3·kB·T / m)",
    formulaDesc: "Căn bậc hai vận tốc bình phương trung bình v_rms tỉ lệ thuận với căn bậc hai của nhiệt độ tuyệt đối T.",
    siUnits: "v_rms: m/s; T: K; μ: kg/mol",
    params: [
      { id: "kinTemp", label: "Nhiệt độ khí (T)", unit: "K", min: 100, max: 800, step: 25, defaultValue: 300 }
    ],
    graph: { title: "Phân bố vận tốc Maxwell - Boltzmann", xLabel: "v (m/s)", yLabel: "Xác suất f(v)", type: "maxwell" },
    instructions: {
      goal: "Quan sát tính hỗn loạn của chuyển động phân tử và sự thay đổi tốc độ theo nhiệt độ.",
      tools: ["Mô hình động học hạt vi mô", "Biểu đồ phân bố vận tốc tức thời"],
      steps: [
        "1. Khởi động mô phỏng ở nhiệt độ 300 K và quan sát quỹ đạo hạt ngoằn ngoèo.",
        "2. Tăng nhiệt độ lên 600 K: quan sát các hạt chuyển động nhanh hơn rõ rệt.",
        "3. Hạ nhiệt độ xuống 100 K: các hạt chuyển động chậm chạp."
      ],
      discussion: "Tại sao các phân tử khí lại không rơi hết xuống đáy bình dưới tác dụng của trọng lực? (Do động năng nhiệt hỗn loạn lấn át thế năng trọng trường)."
    }
  },
  {
    id: "exp-11",
    chapterId: "ch2",
    chapterName: "Chương II: Khí lí tưởng",
    idx: 11,
    title: "Mô phỏng sự hình thành áp suất khí từ va chạm phân tử",
    desc: "Minh họa lực va chạm đàn hồi của từng phân tử lên thành bình tạo ra áp suất vĩ mô tác dụng lên diện tích thành bình.",
    formula: "p = 1/3 · ρ · v² = 2/3 · n₀ · E_đ",
    formulaDesc: "Mỗi cú va chạm truyền xung lượng 2mv_x. Tổng xung lượng của hàng tỷ va chạm trên một đơn vị diện tích trong 1 giây tạo nên áp suất chất khí.",
    siUnits: "p: Pa; n₀: hạt/m³; E_đ: J",
    params: [
      { id: "numParticles", label: "Số lượng hạt (N)", unit: "hạt", min: 30, max: 120, step: 10, defaultValue: 60 },
      { id: "colTemp", label: "Nhiệt độ (T)", unit: "K", min: 150, max: 600, step: 25, defaultValue: 300 }
    ],
    graph: { title: "Tần số va chạm lên thành bình", xLabel: "Thời gian (s)", yLabel: "Lực F (N)", type: "collisions" },
    instructions: {
      goal: "Giải thích cơ chế vi mô sinh ra áp suất chất khí.",
      tools: ["Thành bình có gắn cảm biến lực xung lượng vi mô", "Bộ đếm va chạm theo thời gian thực"],
      steps: [
        "1. Quan sát từng hạt va chạm và bật lại đàn hồi khỏi thành bình.",
        "2. Tăng số lượng hạt N: tần suất va chạm tăng, áp suất tăng.",
        "3. Tăng nhiệt độ T: tốc độ hạt tăng, độ lớn lực mỗi cú va chạm tăng, áp suất tăng."
      ],
      discussion: "Áp suất chất khí phụ thuộc vào những yếu tố vi mô nào? (Mật độ phân tử n₀ và động năng tịnh tiến trung bình của phân tử E_đ)."
    }
  },

  // ==========================================
  // CHƯƠNG III: TỪ TRƯỜNG (9 thí nghiệm)
  // ==========================================
  {
    id: "exp-12",
    chapterId: "ch3",
    chapterName: "Chương III: Từ trường",
    idx: 12,
    title: "Thí nghiệm khảo sát từ trường bằng kim nam châm",
    desc: "Di chuyển kim la bàn tự do trong vùng từ trường của thanh nam châm để xác định hướng của vector cảm ứng từ B.",
    formula: "B = B_N + B_S  (Kim nam châm chỉ hướng của vector B)",
    formulaDesc: "Trục của kim nam châm nằm cân bằng luôn tiếp tuyến với đường sức từ tại điểm đó. Cực Bắc của kim chỉ chiều của vector cảm ứng từ.",
    siUnits: "B: Tesla (T) hoặc mT; Góc θ: độ",
    params: [
        {"id":"magnetB0","label":"Từ tính nam châm (B₀)","unit":"mT","min":10,"max":100,"step":5,"defaultValue":50},
        {"id":"magnetDist","label":"Chiều dài thanh nam châm","unit":"cm","min":6,"max":16,"step":1,"defaultValue":10},
        {"id":"needleDist","label":"Khoảng cách kim đo (r)","unit":"cm","min":4,"max":25,"step":1,"defaultValue":12},
        {"id":"viewMode3D","label":"Chế độ (1: 3D Không gian, 0: 2D Mặt cắt)","unit":"","min":0,"max":1,"step":1,"defaultValue":1}
      ],
    graph: { title: "Độ lớn cảm ứng từ B theo khoảng cách r", xLabel: "r (cm)", yLabel: "B (mT)", type: "decay-1/r3" },
    instructions: {
      goal: "Dùng kim la bàn để phát hiện và xác định hướng của từ trường.",
      tools: ["Thanh nam châm thẳng hai cực N - S", "Kim nam châm thử có trục quay tự do"],
      steps: [
        "1. Dùng chuột kéo kim la bàn đến các vị trí khác nhau xung quanh thanh nam châm.",
        "2. Quan sát kim nam châm tự động quay và định hướng theo vector B địa phương.",
        "3. Ghi nhận góc lệch và độ lớn B hiển thị trên bảng kết quả."
      ],
      discussion: "Tại vị trí nào xung quanh nam châm thì từ trường có độ lớn mạnh nhất? (Tại hai đầu cực Bắc và Nam)."
    }
  },
  {
    id: "exp-13",
    chapterId: "ch3",
    chapterName: "Chương III: Từ trường",
    idx: 13,
    title: "Thí nghiệm khảo sát từ phổ và đường sức từ của nam châm",
    desc: "Mô phỏng hình ảnh mạt sắt sắp xếp xung quanh thanh nam châm thẳng và nam châm chữ U.",
    formula: "Đường sức từ: Vào cực Nam (S) - Ra cực Bắc (N)",
    formulaDesc: "Các đường sức từ là những đường cong khép kín. Nơi nào từ trường mạnh thì đường sức mau (dày), nơi nào từ trường yếu thì đường sức thưa.",
    siUnits: "Mật độ đường sức: Weber/m²",
    params: [
        {"id":"magnetShape","label":"Dạng nam châm (1: Thẳng, 2: Chữ U)","unit":"","min":1,"max":2,"step":1,"defaultValue":1},
        {"id":"filingDensity","label":"Mật độ mạt sắt","unit":"hạt","min":200,"max":1000,"step":100,"defaultValue":500},
        {"id":"showFieldLines","label":"Hiện đường sức từ (1: Có, 0: Ẩn)","unit":"","min":0,"max":1,"step":1,"defaultValue":1},
        {"id":"viewMode3D","label":"Chế độ (1: 3D Không gian, 0: 2D Mặt cắt)","unit":"","min":0,"max":1,"step":1,"defaultValue":1}
      ],
    graph: { title: "Mật độ đường sức từ theo bán kính", xLabel: "Khoảng cách r", yLabel: "Mật độ", type: "field-density" },
    instructions: {
      goal: "Quan sát từ phổ và quy ước chiều của đường sức từ.",
      tools: ["Tấm nhựa trong rắc mạt sắt", "Thanh nam châm thẳng và nam châm chữ U"],
      steps: [
        "1. Chọn dạng nam châm thẳng: quan sát các đường cong khép kín nối hai cực.",
        "2. Chuyển sang nam châm chữ U: quan sát vùng từ trường đều với các đường thẳng song song giữa hai nhánh.",
        "3. Đối chiếu chiều đường sức theo quy tắc 'Vào Nam ra Bắc'."
      ],
      discussion: "Từ trường đều là gì và thường xuất hiện ở đâu? (Là từ trường có vector B như nhau tại mọi điểm; xuất hiện giữa hai cực nam châm chữ U)."
    }
  },
  {
    id: "exp-14",
    chapterId: "ch3",
    chapterName: "Chương III: Từ trường",
    idx: 14,
    title: "Thí nghiệm khảo sát từ trường của dòng điện chạy trong dây dẫn thẳng",
    desc: "Khảo sát quy tắc nắm tay phải và sự suy giảm độ lớn cảm ứng từ theo khoảng cách r đến dây dẫn mang dòng điện.",
    formula: "B = 2 · 10⁻⁷ · (I / r)",
    formulaDesc: "Đường sức từ là các đường tròn đồng tâm nằm trong mặt phẳng vuông góc với dòng điện, tâm nằm trên dây dẫn. I: cường độ dòng điện, r: khoảng cách.",
    siUnits: "B: Tesla (T); I: Ampe (A); r: mét (m)",
    params: [
        {"id":"wireCurrent","label":"Cường độ dòng điện (I)","unit":"A","min":1,"max":20,"step":1,"defaultValue":5},
        {"id":"currentDir","label":"Chiều dòng điện (1: Lên, -1: Xuống)","unit":"","min":-1,"max":1,"step":2,"defaultValue":1},
        {"id":"ringRadius","label":"Bán kính vòng đo (r)","unit":"cm","min":2,"max":15,"step":1,"defaultValue":5},
        {"id":"viewMode3D","label":"Chế độ (1: 3D Không gian, 0: 2D Mặt cắt)","unit":"","min":0,"max":1,"step":1,"defaultValue":1}
      ],
    graph: { title: "Cảm ứng từ B theo khoảng cách r (1/r)", xLabel: "r (cm)", yLabel: "B (μT)", type: "hyperbola-1/r" },
    instructions: {
      goal: "Khảo sát từ trường của dòng điện thẳng dài và vận dụng quy tắc nắm tay phải.",
      tools: ["Dây dẫn thẳng nối nguồn điện một chiều", "Hệ thống kim la bàn đặt xung quanh"],
      steps: [
        "1. Đóng mạch điện và điều chỉnh cường độ dòng điện I.",
        "2. Quan sát chiều quay của các kim la bàn quanh dây dẫn.",
        "3. Đổi chiều dòng điện và quan sát chiều đường sức từ đảo ngược 180°.",
        "4. Kéo điểm đo ra xa dây dẫn để thấy độ lớn B giảm tỉ lệ nghịch với r."
      ],
      discussion: "Phát biểu quy tắc nắm tay phải xác định chiều từ trường của dòng điện thẳng."
    }
  },
  {
    id: "exp-15",
    chapterId: "ch3",
    chapterName: "Chương III: Từ trường",
    idx: 15,
    title: "Thí nghiệm khảo sát từ trường của dòng điện chạy trong ống dây",
    desc: "Khảo sát từ trường đều bên trong lòng ống dây (solenoid) và xác định cực từ ở hai đầu ống.",
    formula: "B = 4π · 10⁻⁷ · (N / ℓ) · I = 4π · 10⁻⁷ · n · I",
    formulaDesc: "Bên trong lòng ống dây hình trụ dài, từ trường là từ trường đều, các đường sức từ là những đường thẳng song song cùng chiều.",
    siUnits: "B: T; N: số vòng; ℓ: mét; n: vòng/m; I: A",
    params: [
        {"id":"solCurrent","label":"Dòng điện (I)","unit":"A","min":0.5,"max":8,"step":0.5,"defaultValue":3},
        {"id":"solTurns","label":"Mật độ vòng dây (n)","unit":"vòng/m","min":400,"max":2000,"step":100,"defaultValue":1000},
        {"id":"solLength","label":"Chiều dài ống dây (L)","unit":"cm","min":10,"max":30,"step":2,"defaultValue":20},
        {"id":"viewMode3D","label":"Chế độ (1: 3D Không gian, 0: 2D Mặt cắt)","unit":"","min":0,"max":1,"step":1,"defaultValue":1}
      ],
    graph: { title: "Cảm ứng từ B theo cường độ dòng điện I", xLabel: "I (A)", yLabel: "B (mT)", type: "linear" },
    instructions: {
      goal: "Khảo sát đặc điểm từ trường bên trong và bên ngoài ống dây mang dòng điện.",
      tools: ["Ống dây hình trụ dài", "Nguồn điện DC", "Kim la bàn thử"],
      steps: [
        "1. Cấp dòng điện I vào cuộn dây.",
        "2. Quan sát bên trong lòng ống dây: các đường sức thẳng, song song và mật độ đều.",
        "3. Quan sát bên ngoài ống dây: đường sức từ có dạng tương tự như của một thanh nam châm.",
        "4. Xác định cực Bắc và Nam của ống dây theo quy tắc nắm tay phải."
      ],
      discussion: "Muốn tăng độ mạnh từ trường trong lòng ống dây lên gấp đôi thì có những cách nào? (Tăng gấp đôi I hoặc tăng gấp đôi mật độ vòng dây n)."
    }
  },
  {
    id: "exp-16",
    chapterId: "ch3",
    chapterName: "Chương III: Từ trường",
    idx: 16,
    title: "Thí nghiệm khảo sát lực từ tác dụng lên đoạn dây dẫn mang dòng điện",
    desc: "Khảo sát lực Am-pe tác dụng lên đoạn dây dẫn đặt trong từ trường đều theo quy tắc bàn tay trái.",
    formula: "F = I · B · L · sin(α)",
    formulaDesc: "Lực từ F vuông góc với mặt phẳng chứa đoạn dòng điện IL và vector B. Chiều xác định theo quy tắc bàn tay trái. F đạt cực đại khi α = 90°.",
    siUnits: "F: Newton (N); I: A; B: T; L: m; α: độ",
    params: [
        {"id":"ampereI","label":"Dòng điện (I)","unit":"A","min":0.5,"max":8,"step":0.5,"defaultValue":4},
        {"id":"ampereB","label":"Cảm ứng từ (B)","unit":"T","min":0.1,"max":1,"step":0.05,"defaultValue":0.5},
        {"id":"ampereAngle","label":"Góc nghiêng dây (α)","unit":"độ","min":0,"max":90,"step":5,"defaultValue":90},
        {"id":"viewMode3D","label":"Chế độ (1: 3D Không gian, 0: 2D Mặt cắt)","unit":"","min":0,"max":1,"step":1,"defaultValue":1}
      ],
    graph: { title: "Lực từ F theo góc nghiêng α", xLabel: "α (độ)", yLabel: "F (N)", type: "sine" },
    instructions: {
      goal: "Xác định hướng và độ lớn của lực từ Am-pe tác dụng lên đoạn dây dẫn.",
      tools: ["Khung dây treo trong từ trường đều của nam châm chữ U", "Lực kế đo độ lớn lực"],
      steps: [
        "1. Cho dòng điện I chạy qua đoạn dây L.",
        "2. Quan sát phương, chiều và độ lệch của đoạn dây.",
        "3. Thay đổi góc nghiêng α từ 0° đến 90° để thấy lực F tăng từ 0 đến cực đại.",
        "4. Kiểm chứng quy tắc bàn tay trái."
      ],
      discussion: "Khi nào thì lực từ tác dụng lên đoạn dây mang dòng điện bằng 0? (Khi đoạn dây đặt song song với đường sức từ, α = 0° hoặc 180°)."
    }
  },
  {
    id: "exp-17",
    chapterId: "ch3",
    chapterName: "Chương III: Từ trường",
    idx: 17,
    title: "Thí nghiệm khảo sát hiện tượng cảm ứng điện từ",
    desc: "Đưa thanh nam châm chuyển động qua lại cuộn dây kín, quan sát kim điện kế lệch sinh dòng điện cảm ứng.",
    formula: "e_c = - ΔΦ / Δt  (với Φ = B · S · cos α)",
    formulaDesc: "Mỗi khi từ thông qua mạch kín biến thiên theo thời gian thì trong mạch xuất hiện một dòng điện cảm ứng.",
    siUnits: "Φ: Weber (Wb); ec: Volt (V); i: Ampe (A)",
    params: [
        {"id":"magnetSpeed","label":"Tốc độ di chuyển nam châm","unit":"m/s","min":0.1,"max":2.5,"step":0.1,"defaultValue":1},
        {"id":"coilTurns","label":"Số vòng dây cuộn (N)","unit":"vòng","min":50,"max":500,"step":50,"defaultValue":200},
        {"id":"magnetPole","label":"Cực đưa vào (1: Cực Bắc N, -1: Cực Nam S)","unit":"","min":-1,"max":1,"step":2,"defaultValue":1},
        {"id":"autoOscillate","label":"Chuyển động (1: Dao động, 0: Một chiều)","unit":"","min":0,"max":1,"step":1,"defaultValue":1},
        {"id":"viewMode3D","label":"Chế độ (1: 3D Không gian, 0: 2D Mặt cắt)","unit":"","min":0,"max":1,"step":1,"defaultValue":1}
      ],
    graph: { title: "Dòng điện cảm ứng i(t) theo chuyển động", xLabel: "t (s)", yLabel: "i (mA)", type: "ac-pulse" },
    instructions: {
      goal: "Khảo sát điều kiện xuất hiện dòng điện cảm ứng trong mạch kín.",
      tools: ["Cuộn dây có nhiều vòng", "Điện kế nhạy có số 0 ở giữa", "Thanh nam châm vĩnh cửu"],
      steps: [
        "1. Đưa cực Bắc của nam châm lại gần cuộn dây: kim điện kế lệch sang phải.",
        "2. Giữ nam châm đứng yên bên trong cuộn dây: kim điện kế chỉ về số 0.",
        "3. Rút nam châm ra xa cuộn dây: kim điện kế lệch sang trái.",
        "4. Tăng tốc độ dịch chuyển nam châm: kim điện kế lệch góc lớn hơn."
      ],
      discussion: "Tại sao khi giữ nam châm đứng yên bên trong cuộn dây thì lại không có dòng điện? (Vì từ thông không biến thiên, ΔΦ/Δt = 0)."
    }
  },
  {
    id: "exp-18",
    chapterId: "ch3",
    chapterName: "Chương III: Từ trường",
    idx: 18,
    title: "Thí nghiệm khảo sát chiều dòng điện cảm ứng theo định luật Lenz",
    desc: "Minh họa định luật Lenz: Dòng điện cảm ứng có chiều sao cho từ trường cảm ứng chống lại sự biến thiên của từ thông ban đầu.",
    formula: "Từ thông tăng: B_cảm_ứng ngược B_ngoài; Từ thông giảm: B_cảm_ứng cùng B_ngoài",
    formulaDesc: "Định luật Lenz thực chất là hệ quả của định luật bảo toàn năng lượng: công cơ học bỏ ra để thắng lực cản từ trường biến thành điện năng.",
    siUnits: "Chiều dòng điện: Ampe (A); Lực cản: Newton (N)",
    params: [
        {"id":"motionState","label":"Chuyển động nam châm (0: Lại gần, 1: Ra xa)","unit":"","min":0,"max":1,"step":1,"defaultValue":0},
        {"id":"ringType","label":"Loại vòng (1: Vòng nhôm kín, 2: Vòng xẻ rãnh)","unit":"","min":1,"max":2,"step":1,"defaultValue":1},
        {"id":"magnetPole","label":"Cực nam châm (1: Cực Bắc N, -1: Cực Nam S)","unit":"","min":-1,"max":1,"step":2,"defaultValue":1},
        {"id":"viewMode3D","label":"Chế độ (1: 3D Không gian, 0: 2D Mặt cắt)","unit":"","min":0,"max":1,"step":1,"defaultValue":1}
      ],
    graph: { title: "Từ thông và chiều dòng cảm ứng", xLabel: "Khoảng cách", yLabel: "Từ thông Φ", type: "flux-lenz" },
    instructions: {
      goal: "Xác định chiều dòng điện cảm ứng bằng định luật Lenz.",
      tools: ["Vòng nhôm nhẹ treo tự do", "Thanh nam châm mạnh"],
      steps: [
        "1. Đưa cực Bắc nam châm lại gần vòng dây: vòng dây bị đẩy lùi (xuất hiện cực Bắc cùng tên chống lại sự lại gần).",
        "2. Kéo nam châm ra xa: vòng dây bị hút theo (xuất hiện cực Nam trái tên chống lại sự ra xa).",
        "3. Sử dụng quy tắc nắm tay phải để suy ra chiều dòng điện chạy trong vòng dây."
      ],
      discussion: "Nếu vòng nhôm bị xẻ một rãnh hở thì khi đưa nam châm lại gần nó có bị đẩy lùi không? (Không, vì mạch hở không có dòng điện khép kín sinh ra lực cản)."
    }
  },
  {
    id: "exp-19",
    chapterId: "ch3",
    chapterName: "Chương III: Từ trường",
    idx: 19,
    title: "Thí nghiệm khảo sát suất điện động cảm ứng",
    desc: "Mô phỏng 3D tương tác 360° khung dây quay trong từ trường đều sinh ra suất điện động cảm ứng xoay chiều hình sin e(t) lệch pha π/2 với từ thông Φ(t).",
    formula: "Φ(t) = N·B·S·cos(ωt);  e(t) = -dΦ/dt = E₀·sin(ωt)",
    formulaDesc: "Suất điện động cảm ứng e(t) vuông pha (lệch π/2) so với từ thông Φ(t). Biên độ cực đại: E₀ = N·B·S·ω.",
    siUnits: "e: Volt (V); Φ: Weber (Wb); ω: rad/s; B: Tesla",
    params: [
      { id: "rotSpeed", label: "Tốc độ góc (ω)", unit: "rad/s", min: 1.0, max: 15.0, step: 0.5, defaultValue: 4.0 },
      { id: "magB", label: "Cảm ứng từ (B)", unit: "T", min: 0.1, max: 1.5, step: 0.05, defaultValue: 0.5 },
      { id: "coilTurnsN", label: "Số vòng dây (N)", unit: "vòng", min: 20, max: 200, step: 10, defaultValue: 100 },
      { id: "viewMode3D", label: "Chế độ (1: 3D Không gian, 0: 2D Mặt cắt)", unit: "", min: 0, max: 1, step: 1, defaultValue: 1 }
    ],
    graph: { title: "Dạng sóng từ thông Φ(t) và suất điện động e(t)", xLabel: "t (s)", yLabel: "e_c (V)", type: "sine-wave" },
    instructions: {
      goal: "Khảo sát sự phụ thuộc của suất điện động cảm ứng vào tốc độ biến thiên từ thông.",
      tools: ["Khung dây quay trong từ trường đều", "Dao động kí điện tử hiển thị sóng"],
      steps: [
        "1. Cho khung dây quay đều quanh trục vuông góc với đường sức từ.",
        "2. Quan sát đồ thị hình sin của suất điện động ec(t) trên màn hình.",
        "3. Tăng tốc độ quay ω: quan sát biên độ E₀ tăng và chu kì dao động giảm."
      ],
      discussion: "Tại vị trí mặt phẳng khung dây vuông góc với đường sức từ, tại sao từ thông cực đại nhưng suất điện động lại bằng 0? (Vì đạo hàm dΦ/dt = 0 tại điểm cực trị)."
    }
  },
  {
    id: "exp-20",
    chapterId: "ch3",
    chapterName: "Chương III: Từ trường",
    idx: 20,
    title: "Mô phỏng nguyên lí hoạt động của máy biến áp",
    desc: "Khảo sát tỉ số biến áp và biến dòng giữa hai cuộn sơ cấp và thứ cấp quấn trên lõi sắt khép kín.",
    formula: "U₁ / U₂ ≈ N₁ / N₂ ≈ I₂ / I₁",
    formulaDesc: "Máy tăng áp khi N₂ > N₁ (U₂ > U₁); máy hạ áp khi N₂ < N₁ (U₂ < U₁). Tần số dòng điện không đổi: f₁ = f₂.",
    siUnits: "U: Volt; I: Ampe; N: vòng",
    params: [
        {"id":"primaryN1","label":"Cuộn sơ cấp (N₁)","unit":"vòng","min":200,"max":2000,"step":100,"defaultValue":1000},
        {"id":"secondaryN2","label":"Cuộn thứ cấp (N₂)","unit":"vòng","min":100,"max":2000,"step":50,"defaultValue":500},
        {"id":"inputU1","label":"Điện áp vào (U₁)","unit":"V","min":50,"max":220,"step":10,"defaultValue":220},
        {"id":"viewMode3D","label":"Chế độ (1: 3D Không gian, 0: 2D Mặt cắt)","unit":"","min":0,"max":1,"step":1,"defaultValue":1}
      ],
    graph: { title: "Dạng sóng điện áp xoay chiều u₁(t) và u₂(t)", xLabel: "t (ms)", yLabel: "u (V)", type: "transformer-waves" },
    instructions: {
      goal: "Nắm vững nguyên tắc hoạt động của máy biến áp dựa trên hiện tượng cảm ứng điện từ.",
      tools: ["Mô hình máy biến áp với lõi sắt từ ghép chữ U", "Vôn kế xoay chiều AC"],
      steps: [
        "1. Cài đặt số vòng dây N₁ và N₂ trên bảng tham số.",
        "2. Đặt điện áp xoay chiều vào cuộn sơ cấp U₁ = 220V.",
        "3. Đọc điện áp ra U₂ ở cuộn thứ cấp và kiểm tra tỉ số U₁/U₂ = N₁/N₂.",
        "4. Thử nghiệm chế độ máy tăng áp (N₂ > N₁) và hạ áp (N₂ < N₁)."
      ],
      discussion: "Tại sao máy biến áp không hoạt động được với dòng điện một chiều không đổi? (Vì dòng DC tạo ra từ trường không đổi, dΦ/dt = 0 nên không sinh ra e_c ở cuộn thứ cấp)."
    }
  },

  // ==========================================
  // CHƯƠNG IV: VẬT LÍ HẠT NHÂN (5 thí nghiệm)
  // ==========================================
  {
    id: "exp-21",
    chapterId: "ch4",
    chapterName: "Chương IV: Vật lí hạt nhân",
    idx: 21,
    title: "Mô phỏng cấu tạo hạt nhân nguyên tử",
    desc: "Mô hình trực quan biểu diễn số proton (Z) và số neutron (N) liên kết bởi lực hạt nhân mạnh tạo thành hạt nhân nguyên tử.",
    formula: "Số khối: A = Z + N  (Điện tích hạt nhân: Q = +Z · e)",
    formulaDesc: "Proton mang điện tích +e, neutron không mang điện. Lực hạt nhân là lực tương tác mạnh, có bán kính tác dụng rất ngắn (~10⁻¹⁵ m).",
    siUnits: "Z: proton; N: neutron; A: nucleon; Q: C",
    params: [
      { id: "numProtons", label: "Số Proton (Z)", unit: "", min: 1, max: 20, step: 1, defaultValue: 6 },
      { id: "numNeutrons", label: "Số Neutron (N)", unit: "", min: 1, max: 25, step: 1, defaultValue: 6 }
    ],
    graph: { title: "Biểu đồ tỉ lệ N/Z và dải đồng vị bền", xLabel: "Z", yLabel: "N", type: "segre-chart" },
    instructions: {
      goal: "Hiểu thành phần cấu tạo, điện tích và kích thước của hạt nhân nguyên tử.",
      tools: ["Mô hình liên kết hạt nhân 2D tương tác"],
      steps: [
        "1. Thay đổi số proton Z và số neutron N trên bảng tham số.",
        "2. Quan sát kí hiệu hạt nhân tương ứng trong bảng tuần hoàn (ví dụ Z=6, N=6 là C-12).",
        "3. Quan sát vị trí điểm đồng vị trên biểu đồ dải bền Segre (N/Z ≈ 1 với các nguyên tố nhẹ)."
      ],
      discussion: "Tại sao các hạt proton mang điện tích cùng dấu đẩy nhau bằng lực Culông nhưng vẫn liên kết chặt chẽ trong hạt nhân? (Nhờ có lực hạt nhân mạnh lấn át lực đẩy Culông ở cự li ngắn)."
    }
  },
  {
    id: "exp-22",
    chapterId: "ch4",
    chapterName: "Chương IV: Vật lí hạt nhân",
    idx: 22,
    title: "Mô phỏng độ hụt khối và năng lượng liên kết hạt nhân",
    desc: "Khảo sát hệ thức Anh-xtanh: Khối lượng hạt nhân luôn nhỏ hơn tổng khối lượng của các nucleon riêng rẽ; tính năng lượng liên kết riêng.",
    formula: "Δm = [Z·mp + (A-Z)·mn] - m_X;  E_lk = Δm · c²",
    formulaDesc: "Năng lượng liên kết riêng ε = E_lk / A đặc trưng cho mức độ bền vững của hạt nhân. Các hạt nhân có số khối 50 < A < 70 bền vững nhất.",
    siUnits: "Δm: u; Elk: MeV; ε: MeV/nucleon",
    params: [
      { id: "targetZ", label: "Số Proton (Z)", unit: "", min: 2, max: 30, step: 1, defaultValue: 8 },
      { id: "targetA", label: "Số khối (A)", unit: "", min: 4, max: 65, step: 1, defaultValue: 16 }
    ],
    graph: { title: "Năng lượng liên kết riêng ε theo số khối A", xLabel: "A", yLabel: "ε (MeV/nucleon)", type: "binding-curve" },
    instructions: {
      goal: "Tính độ hụt khối Δm, năng lượng liên kết E_lk và năng lượng liên kết riêng.",
      tools: ["Bảng tính toán khối lượng nguyên tử chuẩn", "Đồ thị đường cong năng lượng liên kết"],
      steps: [
        "1. Chọn nguyên tố hạt nhân cần khảo sát (ví dụ O-16, Fe-56, He-4).",
        "2. Đọc độ hụt khối Δm và năng lượng liên kết E_lk = Δm · 931.5 MeV.",
        "3. So sánh năng lượng liên kết riêng ε để kết luận mức độ bền vững."
      ],
      discussion: "Hạt nhân nào có năng lượng liên kết riêng lớn nhất trong tự nhiên? (Hạt nhân Fe-56 với ε ≈ 8.8 MeV/nucleon)."
    }
  },
  {
    id: "exp-23",
    chapterId: "ch4",
    chapterName: "Chương IV: Vật lí hạt nhân",
    idx: 23,
    title: "Mô phỏng phản ứng phân hạch và nhiệt hạch",
    desc: "Mô phỏng cơ chế phân hạch U-235 giải phóng neutron dây chuyền và phản ứng nhiệt hạch D - T tổng hợp Heli.",
    formula: "Phân hạch: n + ²³⁵U ⟶ F₁ + F₂ + 2-3n + 200 MeV; Nhiệt hạch: ²H + ³H ⟶ ⁴He + n + 17.6 MeV",
    formulaDesc: "Cả hai phản ứng đều tỏa năng lượng rất lớn vì các hạt nhân sản phẩm có năng lượng liên kết riêng lớn hơn hạt nhân tham gia phản ứng.",
    siUnits: "Năng lượng: MeV; 1 MeV = 1.6 × 10⁻¹³ J",
    params: [
      { id: "reactionType", label: "Chế độ (1: Phân hạch, 2: Nhiệt hạch)", unit: "", min: 1, max: 2, step: 1, defaultValue: 1 }
    ],
    graph: { title: "Năng lượng tỏa ra theo chuỗi phản ứng", xLabel: "Bước", yLabel: "E (MeV)", type: "energy-release" },
    instructions: {
      goal: "Phân biệt cơ chế và điều kiện xảy ra phản ứng phân hạch và phản ứng nhiệt hạch.",
      tools: ["Mô hình động lực học phản ứng hạt nhân 2D"],
      steps: [
        "1. Chế độ Phân hạch: Bắn neutron chậm vào hạt nhân U-235, quan sát hạt nhân dao động và vỡ thành 2 mảnh kèm theo 2-3 neutron tự do.",
        "2. Chế độ Nhiệt hạch: Cho hai hạt nhân nhẹ Deuteri và Triti va chạm ở nhiệt độ hàng triệu độ để kết hợp thành hạt nhân Heli.",
        "3. Quan sát năng lượng tỏa ra tương ứng trên bảng kết quả."
      ],
      discussion: "Tại sao phản ứng nhiệt hạch chỉ xảy ra ở nhiệt độ cực cao hàng chục triệu độ K? (Để các hạt nhân có động năng đủ lớn thắng lực đẩy tĩnh điện Culông)."
    }
  },
  {
    id: "exp-24",
    chapterId: "ch4",
    chapterName: "Chương IV: Vật lí hạt nhân",
    idx: 24,
    title: "Mô phỏng hiện tượng phóng xạ và các dạng tia phóng xạ",
    desc: "Khảo sát bản chất, sự lệch trong điện trường và khả năng đâm xuyên qua giấy, nhôm, chì của các tia α, β⁻, β⁺ và γ.",
    formula: "Tia α: ⁴He; Tia β⁻: e⁻; Tia β⁺: e⁺; Tia γ: Sóng điện từ bước sóng cực ngắn",
    formulaDesc: "Tia α mang điện +2e; tia β mang điện ±e; tia γ không mang điện. Tia γ có khả năng đâm xuyên mạnh nhất, đi qua được tấm chì dày hàng cm.",
    siUnits: "Bề dày tấm chắn: mm; Liều lượng phóng xạ: Sievert (Sv)",
    params: [
      { id: "absorberMaterial", label: "Tấm chắn (0: Không, 1: Giấy, 2: Nhôm, 3: Chì)", unit: "", min: 0, max: 3, step: 1, defaultValue: 0 },
      { id: "eField", label: "Điện trường làm lệch (E)", unit: "kV/m", min: 0, max: 20, step: 2, defaultValue: 10 }
    ],
    graph: { title: "Cường độ tia phóng xạ sau khi qua tấm chắn", xLabel: "Bề dày (mm)", yLabel: "Cường độ I/I₀", type: "absorption" },
    instructions: {
      goal: "Phân biệt bản chất và tính chất vật lí của 3 loại tia phóng xạ chính: alpha, beta và gamma.",
      tools: ["Nguồn phát phóng xạ", "Tấm chắn giấy, lá nhôm, tấm chì", "Bản cực điện trường làm lệch quỹ đạo"],
      steps: [
        "1. Bật nguồn phóng xạ: quan sát quỹ đạo hạt trong điện trường (α lệch về bản âm, β⁻ lệch về bản dương, γ đi thẳng).",
        "2. Đặt tấm giấy: tia α bị chặn lại hoàn toàn.",
        "3. Đặt lá nhôm: tia β bị chặn lại.",
        "4. Đặt tấm chì dày: tia γ bị suy giảm mạnh."
      ],
      discussion: "Tại sao tia alpha bị lệch ít hơn tia beta trong cùng một điện trường mặc dù mang điện tích lớn hơn? (Vì khối lượng của hạt alpha lớn hơn hạt beta tới gần 7300 lần)."
    }
  },
  {
    id: "exp-25",
    chapterId: "ch4",
    chapterName: "Chương IV: Vật lí hạt nhân",
    idx: 25,
    title: "Mô phỏng quy luật phân rã phóng xạ và chu kì bán rã",
    desc: "Mô phỏng ma trận hạt nhân phân rã ngẫu nhiên theo thời gian; đối chiếu số hạt còn lại thực nghiệm với đường cong hàm mũ lý thuyết.",
    formula: "N(t) = N₀ · 2^(-t / T) = N₀ · e^(-λt)  (với λ = ln2 / T)",
    formulaDesc: "Chu kì bán rã T là khoảng thời gian để một nửa số hạt nhân của chất phóng xạ biến đổi thành hạt nhân khác. Quá trình mang tính thống kê ngẫu nhiên.",
    siUnits: "N: số hạt; T, t: giây; λ: 1/s",
    params: [
      { id: "halfLifeSec", label: "Chu kì bán rã (T)", unit: "giây", min: 4, max: 20, step: 1, defaultValue: 8 },
      { id: "initialNuclei", label: "Số hạt ban đầu (N₀)", unit: "hạt", min: 100, max: 400, step: 50, defaultValue: 256 }
    ],
    graph: { title: "Đường cong phân rã phóng xạ N(t)", xLabel: "Thời gian t (s)", yLabel: "Số hạt N", type: "decay-curve" },
    instructions: {
      goal: "Hiểu quy luật phân rã phóng xạ và ý nghĩa của chu kì bán rã.",
      tools: ["Mô phỏng ma trận hạt nhân ngẫu nhiên Monte Carlo", "Đồ thị so sánh thực nghiệm và lý thuyết"],
      steps: [
        "1. Chọn chu kì bán rã T = 8s và số hạt N₀ = 256.",
        "2. Nhấn 'Bắt đầu': quan sát từng hạt nhân đổi màu ngẫu nhiên khi phân rã.",
        "3. Tại các mốc thời gian t = T, 2T, 3T: kiểm tra số hạt còn lại xấp xỉ N₀/2, N₀/4, N₀/8.",
        "4. Quan sát điểm thực nghiệm bám sát đường cong lý thuyết mũ."
      ],
      discussion: "Có thể dự đoán chính xác thời điểm một hạt nhân cụ thể nào đó sẽ phân rã không? (Không, sự phân rã là hiện tượng hoàn toàn ngẫu nhiên ở cấp độ vi mô, quy luật chỉ đúng với số lượng lớn hạt)."
    }
  }
];

