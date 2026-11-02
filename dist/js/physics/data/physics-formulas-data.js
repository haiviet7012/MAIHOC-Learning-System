/**
 * js/physics/data/physics-formulas-data.js
 * Cơ sở dữ liệu Thư viện Công thức Vật lý MAIHOC
 * Nguồn dữ liệu chính thức trích xuất 100% nguyên bản từ 3 tài liệu:
 * - Vật lý Lớp 10: 4 chương, 46 công thức, 14 đại lượng chuẩn Hệ SI
 * - Vật lý Lớp 11: 4 chương, 42 công thức
 * - Vật lý Lớp 12: 4 chương, 37 công thức
 * Tổng cộng: 125 công thức chuẩn SGK Kết nối tri thức với cuộc sống
 */

export const PHYSICS_FORMULAS_DATA = {
  "10": {
    "grade": 10,
    "siTable": [
      {
        "quantity": "Độ dài, quãng đường",
        "symbol": "s, d",
        "unitSymbol": "m",
        "unitName": "mét",
        "category": "Đơn vị cơ bản",
        "raw": "Độ dài, quãng đường ($s, d$) & $\\text{m}$ & mét & Đơn vị cơ bản \\\\"
      },
      {
        "quantity": "Khối lượng",
        "symbol": "m",
        "unitSymbol": "kg",
        "unitName": "kilôgam",
        "category": "Đơn vị cơ bản",
        "raw": "Khối lượng ($m$) & $\\text{kg}$ & kilôgam & Đơn vị cơ bản \\\\"
      },
      {
        "quantity": "Thời gian",
        "symbol": "t",
        "unitSymbol": "s",
        "unitName": "giây",
        "category": "Đơn vị cơ bản",
        "raw": "Thời gian ($t$) & $\\text{s}$ & giây & Đơn vị cơ bản \\\\"
      },
      {
        "quantity": "Góc phẳng",
        "symbol": "\\alpha, \\varphi",
        "unitSymbol": "rad",
        "unitName": "radian",
        "category": "Đơn vị dẫn xuất",
        "raw": "Góc phẳng ($\\alpha, \\varphi$) & $\\text{rad}$ & radian & Đơn vị dẫn xuất \\\\"
      },
      {
        "quantity": "Tần số",
        "symbol": "f",
        "unitSymbol": "Hz",
        "unitName": "héc",
        "category": "Đơn vị dẫn xuất",
        "raw": "Tần số ($f$) & $\\text{Hz}$ & héc & Đơn vị dẫn xuất \\\\"
      },
      {
        "quantity": "Tốc độ, vận tốc",
        "symbol": "v",
        "unitSymbol": "m/s",
        "unitName": "mét trên giây",
        "category": "Đơn vị dẫn xuất",
        "raw": "Tốc độ, vận tốc ($v$) & $\\text{m/s}$ & mét trên giây & Đơn vị dẫn xuất \\\\"
      },
      {
        "quantity": "Gia tốc",
        "symbol": "a, g",
        "unitSymbol": "m/s^2",
        "unitName": "mét trên giây bình phương",
        "category": "Đơn vị dẫn xuất",
        "raw": "Gia tốc ($a, g$) & $\\text{m/s}^2$ & mét trên giây bình phương & Đơn vị dẫn xuất \\\\"
      },
      {
        "quantity": "Tốc độ góc",
        "symbol": "\\omega",
        "unitSymbol": "rad/s",
        "unitName": "radian trên giây",
        "category": "Đơn vị dẫn xuất",
        "raw": "Tốc độ góc ($\\omega$) & $\\text{rad/s}$ & radian trên giây & Đơn vị dẫn xuất \\\\"
      },
      {
        "quantity": "Lực, trọng lượng",
        "symbol": "F, P, T, N",
        "unitSymbol": "N",
        "unitName": "niutơn",
        "category": "Đơn vị dẫn xuất ($1\\text{ N} = 1\\text{ kg.m/s}^2$)",
        "raw": "Lực, trọng lượng ($F, P, T, N$) & $\\text{N}$ & niutơn & Đơn vị dẫn xuất ($1\\text{ N} = 1\\text{ kg.m/s}^2$) \\\\"
      },
      {
        "quantity": "Moment lực",
        "symbol": "M",
        "unitSymbol": "N.m",
        "unitName": "niutơn mét",
        "category": "Đơn vị dẫn xuất",
        "raw": "Moment lực ($M$) & $\\text{N.m}$ & niutơn mét & Đơn vị dẫn xuất \\\\"
      },
      {
        "quantity": "Công, Năng lượng",
        "symbol": "A, W",
        "unitSymbol": "J",
        "unitName": "jun",
        "category": "Đơn vị dẫn xuất ($1\\text{ J} = 1\\text{ N.m}$)",
        "raw": "Công, Năng lượng ($A, W$) & $\\text{J}$ & jun & Đơn vị dẫn xuất ($1\\text{ J} = 1\\text{ N.m}$) \\\\"
      },
      {
        "quantity": "Công suất",
        "symbol": "\\mathcal{P}",
        "unitSymbol": "W",
        "unitName": "oát",
        "category": "Đơn vị dẫn xuất ($1\\text{ W} = 1\\text{ J/s}$)",
        "raw": "Công suất ($\\mathcal{P}$) & $\\text{W}$ & oát & Đơn vị dẫn xuất ($1\\text{ W} = 1\\text{ J/s}$) \\\\"
      },
      {
        "quantity": "Khối lượng riêng",
        "symbol": "\\rho",
        "unitSymbol": "kg/m^3",
        "unitName": "kilôgam trên mét khối",
        "category": "Đơn vị dẫn xuất",
        "raw": "Khối lượng riêng ($\\rho$) & $\\text{kg/m}^3$ & kilôgam trên mét khối & Đơn vị dẫn xuất \\\\"
      },
      {
        "quantity": "Áp suất",
        "symbol": "p",
        "unitSymbol": "Pa",
        "unitName": "pascan",
        "category": "Đơn vị dẫn xuất ($1\\text{ Pa} = 1\\text{ N/m}^2$)",
        "raw": "Áp suất ($p$) & $\\text{Pa}$ & pascan & Đơn vị dẫn xuất ($1\\text{ Pa} = 1\\text{ N/m}^2$) \\\\"
      }
    ],
    "chapters": [
      {
        "chapterId": "grade10-ch1",
        "chapterNum": "CHƯƠNG I",
        "chapterName": "MỞ ĐẦU (TÍNH SAI SỐ VÀ GHI KẾT QUẢ ĐO)",
        "fullTitle": "CHƯƠNG I. MỞ ĐẦU (TÍNH SAI SỐ VÀ GHI KẾT QUẢ ĐO)",
        "subsections": [
          {
            "subId": "grade10-ch1-sub1",
            "title": "1. Công thức trọng tâm (Phép đo trực tiếp)",
            "type": "Trọng tâm",
            "formulas": [
              {
                "id": "PHY10-001",
                "grade": 10,
                "chapterId": "grade10-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "MỞ ĐẦU (TÍNH SAI SỐ VÀ GHI KẾT QUẢ ĐO)",
                "sectionTitle": "1. Công thức trọng tâm (Phép đo trực tiếp)",
                "sectionType": "Trọng tâm",
                "title": "Giá trị trung bình khi đo nhiều lần",
                "primaryMath": "\\overline{A} = \\frac{A_1 + A_2 + \\dots + A_n}{n}",
                "allMathBlocks": [
                  "\\overline{A} = \\frac{A_1 + A_2 + \\dots + A_n}{n}"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ \\overline{A} = \\frac{A_1 + A_2 + \\dots + A_n}{n} \\]"
              },
              {
                "id": "PHY10-002",
                "grade": 10,
                "chapterId": "grade10-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "MỞ ĐẦU (TÍNH SAI SỐ VÀ GHI KẾT QUẢ ĐO)",
                "sectionTitle": "1. Công thức trọng tâm (Phép đo trực tiếp)",
                "sectionType": "Trọng tâm",
                "title": "Sai số ngẫu nhiên tuyệt đối của từng lần đo",
                "primaryMath": "\\Delta A_1 = |\\overline{A} - A_1| \\;;\\quad \\Delta A_2 = |\\overline{A} - A_2| \\;;\\quad \\dots \\;;\\quad \\Delta A_n = |\\overline{A} - A_n|",
                "allMathBlocks": [
                  "\\Delta A_1 = |\\overline{A} - A_1| \\;;\\quad \\Delta A_2 = |\\overline{A} - A_2| \\;;\\quad \\dots \\;;\\quad \\Delta A_n = |\\overline{A} - A_n|"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ \\Delta A_1 = |\\overline{A} - A_1| \\;;\\quad \\Delta A_2 = |\\overline{A} - A_2| \\;;\\quad \\dots \\;;\\quad \\Delta A_n = |\\overline{A} - A_n| \\]"
              },
              {
                "id": "PHY10-003",
                "grade": 10,
                "chapterId": "grade10-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "MỞ ĐẦU (TÍNH SAI SỐ VÀ GHI KẾT QUẢ ĐO)",
                "sectionTitle": "1. Công thức trọng tâm (Phép đo trực tiếp)",
                "sectionType": "Trọng tâm",
                "title": "Sai số ngẫu nhiên tuyệt đối trung bình của $n$ lần đo",
                "primaryMath": "\\overline{\\Delta A} = \\frac{\\Delta A_1 + \\Delta A_2 + \\dots + \\Delta A_n}{n}",
                "allMathBlocks": [
                  "\\overline{\\Delta A} = \\frac{\\Delta A_1 + \\Delta A_2 + \\dots + \\Delta A_n}{n}"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ \\overline{\\Delta A} = \\frac{\\Delta A_1 + \\Delta A_2 + \\dots + \\Delta A_n}{n} \\]"
              },
              {
                "id": "PHY10-004",
                "grade": 10,
                "chapterId": "grade10-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "MỞ ĐẦU (TÍNH SAI SỐ VÀ GHI KẾT QUẢ ĐO)",
                "sectionTitle": "1. Công thức trọng tâm (Phép đo trực tiếp)",
                "sectionType": "Trọng tâm",
                "title": "Sai số tuyệt đối của phép đo",
                "primaryMath": "\\Delta A = \\overline{\\Delta A} + \\Delta A_{dc}",
                "allMathBlocks": [
                  "\\Delta A = \\overline{\\Delta A} + \\Delta A_{dc}"
                ],
                "subCases": [],
                "notes": [
                  "(Trong đó $\\Delta A_{dc}$ là sai số dụng cụ, thường lấy bằng một nửa hoặc một độ chia nhỏ nhất trên dụng cụ)."
                ],
                "variables": [
                  "\\textit{(Trong đó $\\Delta A_{dc}$ là sai số dụng cụ, thường lấy bằng một nửa hoặc một độ chia nhỏ nhất trên dụng cụ).}"
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ \\Delta A = \\overline{\\Delta A} + \\Delta A_{dc} \\]\n    \\textit{(Trong đó $\\Delta A_{dc}$ là sai số dụng cụ, thường lấy bằng một nửa hoặc một độ chia nhỏ nhất trên dụng cụ).}"
              },
              {
                "id": "PHY10-005",
                "grade": 10,
                "chapterId": "grade10-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "MỞ ĐẦU (TÍNH SAI SỐ VÀ GHI KẾT QUẢ ĐO)",
                "sectionTitle": "1. Công thức trọng tâm (Phép đo trực tiếp)",
                "sectionType": "Trọng tâm",
                "title": "Cách ghi kết quả đo đại lượng $A$",
                "primaryMath": "A = \\overline{A} \\pm \\Delta A \\quad \\text{hoặc} \\quad (\\overline{A} - \\Delta A) \\le A \\le (\\overline{A} + \\Delta A)",
                "allMathBlocks": [
                  "A = \\overline{A} \\pm \\Delta A \\quad \\text{hoặc} \\quad (\\overline{A} - \\Delta A) \\le A \\le (\\overline{A} + \\Delta A)"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ A = \\overline{A} \\pm \\Delta A \\quad \\text{hoặc} \\quad (\\overline{A} - \\Delta A) \\le A \\le (\\overline{A} + \\Delta A) \\]"
              },
              {
                "id": "PHY10-006",
                "grade": 10,
                "chapterId": "grade10-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "MỞ ĐẦU (TÍNH SAI SỐ VÀ GHI KẾT QUẢ ĐO)",
                "sectionTitle": "1. Công thức trọng tâm (Phép đo trực tiếp)",
                "sectionType": "Trọng tâm",
                "title": "Sai số tỉ đối của phép đo (đánh giá mức độ chính xác)",
                "primaryMath": "\\delta A = \\frac{\\Delta A}{\\overline{A}} \\cdot 100\\%",
                "allMathBlocks": [
                  "\\delta A = \\frac{\\Delta A}{\\overline{A}} \\cdot 100\\%"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ \\delta A = \\frac{\\Delta A}{\\overline{A}} \\cdot 100\\% \\]\n\\end{itemize}\n\n\\subsection*{\\textcolor{secondary}{2. Công thức mở rộng \\& Vận dụng (Phép đo gián tiếp)}}"
              }
            ]
          },
          {
            "subId": "grade10-ch1-sub2",
            "title": "2. Công thức mở rộng \\& Vận dụng (Phép đo gián tiếp)",
            "type": "Mở rộng & Vận dụng",
            "formulas": [
              {
                "id": "PHY10-007",
                "grade": 10,
                "chapterId": "grade10-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "MỞ ĐẦU (TÍNH SAI SỐ VÀ GHI KẾT QUẢ ĐO)",
                "sectionTitle": "2. Công thức mở rộng \\& Vận dụng (Phép đo gián tiếp)",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Sai số tuyệt đối của một tổng hay hiệu",
                "primaryMath": "\\Delta A = \\Delta B + \\Delta C",
                "allMathBlocks": [
                  "\\Delta A = \\Delta B + \\Delta C"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [
                  "} Nếu $A = B \\pm C$ thì:"
                ],
                "unit": "",
                "rawChunk": "} Nếu $A = B \\pm C$ thì:\n    \\[ \\Delta A = \\Delta B + \\Delta C \\]"
              },
              {
                "id": "PHY10-008",
                "grade": 10,
                "chapterId": "grade10-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "MỞ ĐẦU (TÍNH SAI SỐ VÀ GHI KẾT QUẢ ĐO)",
                "sectionTitle": "2. Công thức mở rộng \\& Vận dụng (Phép đo gián tiếp)",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Sai số tỉ đối của một tích hay thương",
                "primaryMath": "\\delta A = \\delta B + \\delta C",
                "allMathBlocks": [
                  "\\delta A = \\delta B + \\delta C"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [
                  "} Nếu $A = B \\cdot C$ hoặc $A = \\frac{B}{C}$ thì:"
                ],
                "unit": "",
                "rawChunk": "} Nếu $A = B \\cdot C$ hoặc $A = \\frac{B}{C}$ thì:\n    \\[ \\delta A = \\delta B + \\delta C \\]"
              },
              {
                "id": "PHY10-009",
                "grade": 10,
                "chapterId": "grade10-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "MỞ ĐẦU (TÍNH SAI SỐ VÀ GHI KẾT QUẢ ĐO)",
                "sectionTitle": "2. Công thức mở rộng \\& Vận dụng (Phép đo gián tiếp)",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Vận dụng đo tốc độ gián tiếp ($v = \\frac{s}{t}$)",
                "primaryMath": "\\delta v = \\delta s + \\delta t = \\left( \\frac{\\Delta s}{\\overline{s}} + \\frac{\\Delta t}{\\overline{t}} \\right) \\cdot 100\\% \\quad \\Rightarrow \\quad \\Delta v = \\delta v \\cdot \\overline{v}",
                "allMathBlocks": [
                  "\\delta v = \\delta s + \\delta t = \\left( \\frac{\\Delta s}{\\overline{s}} + \\frac{\\Delta t}{\\overline{t}} \\right) \\cdot 100\\% \\quad \\Rightarrow \\quad \\Delta v = \\delta v \\cdot \\overline{v}"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ \\delta v = \\delta s + \\delta t = \\left( \\frac{\\Delta s}{\\overline{s}} + \\frac{\\Delta t}{\\overline{t}} \\right) \\cdot 100\\% \\quad \\Rightarrow \\quad \\Delta v = \\delta v \\cdot \\overline{v} \\]"
              },
              {
                "id": "PHY10-010",
                "grade": 10,
                "chapterId": "grade10-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "MỞ ĐẦU (TÍNH SAI SỐ VÀ GHI KẾT QUẢ ĐO)",
                "sectionTitle": "2. Công thức mở rộng \\& Vận dụng (Phép đo gián tiếp)",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Sai số tỉ đối khi đại lượng chứa luỹ thừa hoặc căn thức",
                "primaryMath": "\\delta A = \\delta B + \\frac{1}{2}\\delta C",
                "allMathBlocks": [
                  "\\delta A = \\delta B + \\frac{1}{2}\\delta C"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [
                  "Nếu $A = B^m \\cdot C^n$ thì $\\delta A = |m|\\delta B + |n|\\delta C$. Ví dụ: Nếu $A = B\\sqrt{C} = B \\cdot C^{\\frac{1}{2}}$ thì:"
                ],
                "unit": "",
                "rawChunk": "}\n    Nếu $A = B^m \\cdot C^n$ thì $\\delta A = |m|\\delta B + |n|\\delta C$. Ví dụ: Nếu $A = B\\sqrt{C} = B \\cdot C^{\\frac{1}{2}}$ thì:\n    \\[ \\delta A = \\delta B + \\frac{1}{2}\\delta C \\]"
              },
              {
                "id": "PHY10-011",
                "grade": 10,
                "chapterId": "grade10-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "MỞ ĐẦU (TÍNH SAI SỐ VÀ GHI KẾT QUẢ ĐO)",
                "sectionTitle": "2. Công thức mở rộng \\& Vận dụng (Phép đo gián tiếp)",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Hệ thức liên hệ giữa năng lượng và khối lượng của Einstein",
                "primaryMath": "E = m \\cdot c^2",
                "allMathBlocks": [
                  "E = m \\cdot c^2"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ E = m \\cdot c^2 \\]\n\\end{itemize}\n\n\\vspace{8pt}\n\\textcolor{rulecolor}{\\rule{\\textwidth}{0.6pt}}\n\n\\section*{\\textcolor{primary}{CHƯƠNG II. ĐỘNG HỌC}}"
              }
            ]
          }
        ],
        "formulaCount": 11
      },
      {
        "chapterId": "grade10-ch2",
        "chapterNum": "CHƯƠNG II",
        "chapterName": "ĐỘNG HỌC",
        "fullTitle": "CHƯƠNG II. ĐỘNG HỌC",
        "subsections": [
          {
            "subId": "grade10-ch2-sub1",
            "title": "1. Công thức trọng tâm",
            "type": "Trọng tâm",
            "formulas": [
              {
                "id": "PHY10-012",
                "grade": 10,
                "chapterId": "grade10-ch2",
                "chapterNum": "CHƯƠNG II",
                "chapterName": "ĐỘNG HỌC",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Thời gian chuyển động và quãng đường đi được",
                "primaryMath": "\\Delta t = t_2 - t_1 \\quad (\\text{hay } t_n = t_0 + \\Delta t) \\;;\\qquad \\Delta s = s_2 - s_1",
                "allMathBlocks": [
                  "\\Delta t = t_2 - t_1 \\quad (\\text{hay } t_n = t_0 + \\Delta t) \\;;\\qquad \\Delta s = s_2 - s_1"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ \\Delta t = t_2 - t_1 \\quad (\\text{hay } t_n = t_0 + \\Delta t) \\;;\\qquad \\Delta s = s_2 - s_1 \\]"
              },
              {
                "id": "PHY10-013",
                "grade": 10,
                "chapterId": "grade10-ch2",
                "chapterNum": "CHƯƠNG II",
                "chapterName": "ĐỘNG HỌC",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Tốc độ trung bình",
                "primaryMath": "v_{tb} = \\frac{s}{t} = \\frac{\\Delta s}{\\Delta t} \\quad \\Rightarrow \\quad s = v \\cdot t \\;;\\quad t = \\frac{s}{v}",
                "allMathBlocks": [
                  "v_{tb} = \\frac{s}{t} = \\frac{\\Delta s}{\\Delta t} \\quad \\Rightarrow \\quad s = v \\cdot t \\;;\\quad t = \\frac{s}{v}"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ v_{tb} = \\frac{s}{t} = \\frac{\\Delta s}{\\Delta t} \\quad \\Rightarrow \\quad s = v \\cdot t \\;;\\quad t = \\frac{s}{v} \\]"
              },
              {
                "id": "PHY10-014",
                "grade": 10,
                "chapterId": "grade10-ch2",
                "chapterNum": "CHƯƠNG II",
                "chapterName": "ĐỘNG HỌC",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Vận tốc trung bình và vận tốc tức thời",
                "primaryMath": "\\vec{v} = \\frac{\\vec{d}}{t} = \\frac{\\Delta \\vec{d}}{\\Delta t} \\;;\\qquad \\vec{v}_t = \\frac{\\Delta \\vec{d}}{\\Delta t} \\quad (\\text{với } \\Delta t \\text{ rất nhỏ})",
                "allMathBlocks": [
                  "\\vec{v} = \\frac{\\vec{d}}{t} = \\frac{\\Delta \\vec{d}}{\\Delta t} \\;;\\qquad \\vec{v}_t = \\frac{\\Delta \\vec{d}}{\\Delta t} \\quad (\\text{với } \\Delta t \\text{ rất nhỏ})"
                ],
                "subCases": [],
                "notes": [
                  "Lưu ý:"
                ],
                "variables": [
                  "\\[ \\vec{v} = \\frac{\\vec{d}}{t} = \\frac{\\Delta \\vec{d}}{\\Delta t} \\;;\\qquad \\vec{v}_t = \\frac{\\Delta \\vec{d}}{\\Delta t} \\quad (\\text{với } \\Delta t \\text{ rất nhỏ}) \\]"
                ],
                "conditions": [
                  "\\textit{Lưu ý:} Khi vật chuyển động thẳng không đổi chiều theo chiều dương thì $d = s$ và $v = \\upsilon$. Khi vật đổi chiều chuyển động ngược chiều dương thì $s > 0$, $d < 0$ và $v = -\\upsilon$."
                ],
                "unit": "",
                "rawChunk": "}\n    \\[ \\vec{v} = \\frac{\\vec{d}}{t} = \\frac{\\Delta \\vec{d}}{\\Delta t} \\;;\\qquad \\vec{v}_t = \\frac{\\Delta \\vec{d}}{\\Delta t} \\quad (\\text{với } \\Delta t \\text{ rất nhỏ}) \\]\n    \\textit{Lưu ý:} Khi vật chuyển động thẳng không đổi chiều theo chiều dương thì $d = s$ và $v = \\upsilon$. Khi vật đổi chiều chuyển động ngược chiều dương thì $s > 0$, $d < 0$ và $v = -\\upsilon$."
              },
              {
                "id": "PHY10-015",
                "grade": 10,
                "chapterId": "grade10-ch2",
                "chapterNum": "CHƯƠNG II",
                "chapterName": "ĐỘNG HỌC",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Độ dịch chuyển và đồ thị $(d - t)$ trong chuyển động thẳng đều",
                "primaryMath": "d = v \\cdot t \\;;\\qquad \\text{Hệ số góc (độ dốc) của đồ thị } (d - t): \\quad v = \\frac{\\Delta d}{\\Delta t} = \\frac{d_2 - d_1}{t_2 - t_1}",
                "allMathBlocks": [
                  "d = v \\cdot t \\;;\\qquad \\text{Hệ số góc (độ dốc) của đồ thị } (d - t): \\quad v = \\frac{\\Delta d}{\\Delta t} = \\frac{d_2 - d_1}{t_2 - t_1}"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ d = v \\cdot t \\;;\\qquad \\text{Hệ số góc (độ dốc) của đồ thị } (d - t): \\quad v = \\frac{\\Delta d}{\\Delta t} = \\frac{d_2 - d_1}{t_2 - t_1} \\]"
              },
              {
                "id": "PHY10-016",
                "grade": 10,
                "chapterId": "grade10-ch2",
                "chapterNum": "CHƯƠNG II",
                "chapterName": "ĐỘNG HỌC",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Công thức cộng vận tốc (Tổng hợp vận tốc)",
                "primaryMath": "\\vec{v}_{1,3} = \\vec{v}_{1,2} + \\vec{v}_{2,3}",
                "allMathBlocks": [
                  "\\vec{v}_{1,3} = \\vec{v}_{1,2} + \\vec{v}_{2,3}"
                ],
                "subCases": [
                  {
                    "label": "Cùng phương, cùng chiều: $v_{1,3} = v_{1,2} + v_{2,3}$",
                    "math": ""
                  },
                  {
                    "label": "Cùng phương, ngược chiều: $v_{1,3} = |v_{1,2} - v_{2,3}|$",
                    "math": ""
                  },
                  {
                    "label": "Vuông góc với nhau ($",
                    "math": ""
                  }
                ],
                "notes": [],
                "variables": [
                  "\\item Vuông góc với nhau ($\\vec{v}_{1,2} \\perp \\vec{v}_{2,3}$): $v_{1,3} = \\sqrt{v_{1,2}^2 + v_{2,3}^2}$"
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ \\vec{v}_{1,3} = \\vec{v}_{1,2} + \\vec{v}_{2,3} \\]\n    \\begin{itemize}\n        \\item Cùng phương, cùng chiều: $v_{1,3} = v_{1,2} + v_{2,3}$\n        \\item Cùng phương, ngược chiều: $v_{1,3} = |v_{1,2} - v_{2,3}|$\n        \\item Vuông góc với nhau ($\\vec{v}_{1,2} \\perp \\vec{v}_{2,3}$): $v_{1,3} = \\sqrt{v_{1,2}^2 + v_{2,3}^2}$"
              },
              {
                "id": "PHY10-017",
                "grade": 10,
                "chapterId": "grade10-ch2",
                "chapterNum": "CHƯƠNG II",
                "chapterName": "ĐỘNG HỌC",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Gia tốc của chuyển động biến đổi",
                "primaryMath": "\\vec{a} = \\frac{\\Delta \\vec{v}}{\\Delta t} \\;;\\qquad a = \\frac{\\Delta v}{\\Delta t} = \\frac{v_t - v_0}{t - t_0}",
                "allMathBlocks": [
                  "\\vec{a} = \\frac{\\Delta \\vec{v}}{\\Delta t} \\;;\\qquad a = \\frac{\\Delta v}{\\Delta t} = \\frac{v_t - v_0}{t - t_0}"
                ],
                "subCases": [
                  {
                    "label": "Chuyển động nhanh dần: $",
                    "math": ""
                  },
                  {
                    "label": "Chuyển động chậm dần: $",
                    "math": ""
                  }
                ],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ \\vec{a} = \\frac{\\Delta \\vec{v}}{\\Delta t} \\;;\\qquad a = \\frac{\\Delta v}{\\Delta t} = \\frac{v_t - v_0}{t - t_0} \\]\n    \\begin{itemize}\n        \\item Chuyển động nhanh dần: $\\vec{a}$ cùng chiều $\\vec{v}$ ($a \\cdot v > 0$).\n        \\item Chuyển động chậm dần: $\\vec{a}$ ngược chiều $\\vec{v}$ ($a \\cdot v < 0$)."
              },
              {
                "id": "PHY10-018",
                "grade": 10,
                "chapterId": "grade10-ch2",
                "chapterNum": "CHƯƠNG II",
                "chapterName": "ĐỘNG HỌC",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Các công thức của chuyển động thẳng biến đổi đều ($a = \\text{hằng số}$)",
                "primaryMath": "v_t = v_0 + a \\cdot t",
                "allMathBlocks": [],
                "subCases": [
                  {
                    "label": "Công thức vận tốc tức thời: $v_t = v_0 + a",
                    "math": ""
                  },
                  {
                    "label": "Công thức độ dịch chuyển: $d = v_0",
                    "math": ""
                  },
                  {
                    "label": "Công thức độc lập thời gian: $v_t^2 - v_0^2 = 2",
                    "math": ""
                  }
                ],
                "notes": [],
                "variables": [],
                "conditions": [
                  "\\item Công thức vận tốc tức thời: $v_t = v_0 + a \\cdot t$ (khi $v_0 = 0 \\Rightarrow v_t = a \\cdot t$)."
                ],
                "unit": "",
                "rawChunk": "}\n    \\begin{enumerate}\n        \\item Công thức vận tốc tức thời: $v_t = v_0 + a \\cdot t$ (khi $v_0 = 0 \\Rightarrow v_t = a \\cdot t$).\n        \\item Công thức độ dịch chuyển: $d = v_0 \\cdot t + \\frac{1}{2} a \\cdot t^2$ (bằng diện tích hình thang giới hạn bởi đồ thị $v - t$).\n        \\item Công thức độc lập thời gian: $v_t^2 - v_0^2 = 2 \\cdot a \\cdot d$."
              },
              {
                "id": "PHY10-019",
                "grade": 10,
                "chapterId": "grade10-ch2",
                "chapterNum": "CHƯƠNG II",
                "chapterName": "ĐỘNG HỌC",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Công thức của sự rơi tự do ($v_0 = 0, a = g \\approx 9,8\\text{ m/s}^2$, chiều dương hướng xuống)",
                "primaryMath": "v_t = g \\cdot t \\;;\\qquad d = s = \\frac{1}{2} g \\cdot t^2 \\;;\\qquad v_t^2 = 2 \\cdot g \\cdot s \\quad \\Rightarrow \\quad t = \\sqrt{\\frac{2s}{g}}",
                "allMathBlocks": [
                  "v_t = g \\cdot t \\;;\\qquad d = s = \\frac{1}{2} g \\cdot t^2 \\;;\\qquad v_t^2 = 2 \\cdot g \\cdot s \\quad \\Rightarrow \\quad t = \\sqrt{\\frac{2s}{g}}"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ v_t = g \\cdot t \\;;\\qquad d = s = \\frac{1}{2} g \\cdot t^2 \\;;\\qquad v_t^2 = 2 \\cdot g \\cdot s \\quad \\Rightarrow \\quad t = \\sqrt{\\frac{2s}{g}} \\]\n\\end{itemize}\n\n\\subsection*{\\textcolor{secondary}{2. Công thức mở rộng \\& Vận dụng (Chuyển động ném \\& Thực hành)}}"
              }
            ]
          },
          {
            "subId": "grade10-ch2-sub2",
            "title": "2. Công thức mở rộng \\& Vận dụng (Chuyển động ném \\& Thực hành)",
            "type": "Mở rộng & Vận dụng",
            "formulas": [
              {
                "id": "PHY10-020",
                "grade": 10,
                "chapterId": "grade10-ch2",
                "chapterNum": "CHƯƠNG II",
                "chapterName": "ĐỘNG HỌC",
                "sectionTitle": "2. Công thức mở rộng \\& Vận dụng (Chuyển động ném \\& Thực hành)",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Chuyển động ném ngang (từ độ cao $H$ với vận tốc ban đầu $\\vec{v}_0$ nằm ngang)",
                "primaryMath": "Ox",
                "allMathBlocks": [],
                "subCases": [
                  {
                    "label": "Chuyển động thành phần theo phương ngang $Ox$ (thẳng đều): $v_x = v_0",
                    "math": ""
                  },
                  {
                    "label": "Chuyển động thành phần theo phương thẳng đứng $Oy$ (rơi tự do): $v_y = g",
                    "math": ""
                  },
                  {
                    "label": "Thời gian rơi chạm đất: $H =",
                    "math": ""
                  },
                  {
                    "label": "Tầm bay xa cực đại theo phương ngang: $L = d_{x",
                    "math": ""
                  },
                  {
                    "label": "Độ lớn vận tốc của vật tại thời điểm $t$ (hoặc khi chạm đất): $v =",
                    "math": ""
                  }
                ],
                "notes": [],
                "variables": [],
                "conditions": [
                  "\\item Độ lớn vận tốc của vật tại thời điểm $t$ (hoặc khi chạm đất): $v = \\sqrt{v_x^2 + v_y^2} = \\sqrt{v_0^2 + (g \\cdot t)^2}$"
                ],
                "unit": "",
                "rawChunk": "}\n    \\begin{itemize}\n        \\item Chuyển động thành phần theo phương ngang $Ox$ (thẳng đều): $v_x = v_0 \\;;\\quad d_x = v_0 \\cdot t$\n        \\item Chuyển động thành phần theo phương thẳng đứng $Oy$ (rơi tự do): $v_y = g \\cdot t \\;;\\quad d_y = \\frac{1}{2} g \\cdot t^2$\n        \\item Thời gian rơi chạm đất: $H = \\frac{1}{2} g \\cdot t_{\\max}^2 \\Rightarrow t_{\\max} = \\sqrt{\\frac{2H}{g}}$\n        \\item Tầm bay xa cực đại theo phương ngang: $L = d_{x\\max} = v_0 \\cdot t_{\\max} = v_0 \\sqrt{\\frac{2H}{g}}$\n        \\item Độ lớn vận tốc của vật tại thời điểm $t$ (hoặc khi chạm đất): $v = \\sqrt{v_x^2 + v_y^2} = \\sqrt{v_0^2 + (g \\cdot t)^2}$"
              },
              {
                "id": "PHY10-021",
                "grade": 10,
                "chapterId": "grade10-ch2",
                "chapterNum": "CHƯƠNG II",
                "chapterName": "ĐỘNG HỌC",
                "sectionTitle": "2. Công thức mở rộng \\& Vận dụng (Chuyển động ném \\& Thực hành)",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Chuyển động ném xiên (từ mặt đất với vận tốc đầu $v_0$, góc ném $\\alpha$ so với phương ngang)",
                "primaryMath": "H = d_{y\\max} = \\frac{v_{0y}^2}{2g} = \\frac{v_0^2 \\cdot \\sin^2\\alpha}{2g}",
                "allMathBlocks": [
                  "H = d_{y\\max} = \\frac{v_{0y}^2}{2g} = \\frac{v_0^2 \\cdot \\sin^2\\alpha}{2g}",
                  "L = d_{x\\max} = v_{0x} \\cdot t' = \\frac{v_0^2 \\cdot \\sin 2\\alpha}{g} \\quad (\\text{Đạt cực đại } L_{\\max} = \\frac{v_0^2}{g} \\text{ khi } \\alpha = 45^\\circ)"
                ],
                "subCases": [
                  {
                    "label": "Các thành phần vận tốc ban đầu: $v_{0x} = v_0",
                    "math": ""
                  },
                  {
                    "label": "Vận tốc theo phương thẳng đứng tại thời điểm $t$: $v_y = v_{0y} - g",
                    "math": ""
                  },
                  {
                    "label": "Thời gian từ lúc ném đến khi đạt tầm cao cực đại ($v_y = 0$): $t_1 =",
                    "math": ""
                  },
                  {
                    "label": "Tầm bay cao cực đại:",
                    "math": "H = d_{y\\max} = \\frac{v_{0y}^2}{2g} = \\frac{v_0^2 \\cdot \\sin^2\\alpha}{2g}"
                  },
                  {
                    "label": "Thời gian từ lúc ném đến khi rơi trở lại mặt đất cùng độ cao: $t' = 2t_1 =",
                    "math": ""
                  },
                  {
                    "label": "Tầm bay xa cực đại theo phương ngang:",
                    "math": "L = d_{x\\max} = v_{0x} \\cdot t' = \\frac{v_0^2 \\cdot \\sin 2\\alpha}{g} \\quad (\\text{Đạt cực đại } L_{\\max} = \\frac{v_0^2}{g} \\text{ khi } \\alpha = 45^\\circ)"
                  }
                ],
                "notes": [],
                "variables": [],
                "conditions": [
                  "\\item Thời gian từ lúc ném đến khi đạt tầm cao cực đại ($v_y = 0$): $t_1 = \\frac{v_{0y}}{g} = \\frac{v_0 \\sin\\alpha}{g}$",
                  "\\item Thời gian từ lúc ném đến khi rơi trở lại mặt đất cùng độ cao: $t' = 2t_1 = \\frac{2 v_0 \\sin\\alpha}{g}$",
                  "\\[ L = d_{x\\max} = v_{0x} \\cdot t' = \\frac{v_0^2 \\cdot \\sin 2\\alpha}{g} \\quad (\\text{Đạt cực đại } L_{\\max} = \\frac{v_0^2}{g} \\text{ khi } \\alpha = 45^\\circ) \\]"
                ],
                "unit": "",
                "rawChunk": "}\n    \\begin{itemize}\n        \\item Các thành phần vận tốc ban đầu: $v_{0x} = v_0 \\cos\\alpha \\;;\\quad v_{0y} = v_0 \\sin\\alpha$\n        \\item Vận tốc theo phương thẳng đứng tại thời điểm $t$: $v_y = v_{0y} - g \\cdot t = v_0 \\sin\\alpha - g \\cdot t$\n        \\item Thời gian từ lúc ném đến khi đạt tầm cao cực đại ($v_y = 0$): $t_1 = \\frac{v_{0y}}{g} = \\frac{v_0 \\sin\\alpha}{g}$\n        \\item Tầm bay cao cực đại:\n        \\[ H = d_{y\\max} = \\frac{v_{0y}^2}{2g} = \\frac{v_0^2 \\cdot \\sin^2\\alpha}{2g} \\]\n        \\item Thời gian từ lúc ném đến khi rơi trở lại mặt đất cùng độ cao: $t' = 2t_1 = \\frac{2 v_0 \\sin\\alpha}{g}$\n        \\item Tầm bay xa cực đại theo phương ngang:\n        \\[ L = d_{x\\max} = v_{0x} \\cdot t' = \\frac{v_0^2 \\cdot \\sin 2\\alpha}{g} \\quad (\\text{Đạt cực đại } L_{\\max} = \\frac{v_0^2}{g} \\text{ khi } \\alpha = 45^\\circ) \\]"
              },
              {
                "id": "PHY10-022",
                "grade": 10,
                "chapterId": "grade10-ch2",
                "chapterNum": "CHƯƠNG II",
                "chapterName": "ĐỘNG HỌC",
                "sectionTitle": "2. Công thức mở rộng \\& Vận dụng (Chuyển động ném \\& Thực hành)",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Công thức thực hành đo tốc độ và gia tốc bằng cổng quang điện",
                "primaryMath": "\\overline{v} = \\frac{\\overline{s}}{\\overline{t}}",
                "allMathBlocks": [],
                "subCases": [
                  {
                    "label": "Tốc độ trung bình giữa hai cổng quang điện E, F: $",
                    "math": ""
                  },
                  {
                    "label": "Tốc độ tức thời khi viên bi đường kính $d$ chắn một cổng quang điện: $",
                    "math": ""
                  }
                ],
                "notes": [],
                "variables": [],
                "conditions": [
                  "\\item Tốc độ tức thời khi viên bi đường kính $d$ chắn một cổng quang điện: $\\overline{v}_t = \\frac{\\overline{d}}{\\overline{t}}$"
                ],
                "unit": "",
                "rawChunk": "}\n    \\begin{itemize}\n        \\item Tốc độ trung bình giữa hai cổng quang điện E, F: $\\overline{v} = \\frac{\\overline{s}}{\\overline{t}}$\n        \\item Tốc độ tức thời khi viên bi đường kính $d$ chắn một cổng quang điện: $\\overline{v}_t = \\frac{\\overline{d}}{\\overline{t}}$\n    \\end{itemize}\n\\end{itemize}\n\n\\vspace{8pt}\n\\textcolor{rulecolor}{\\rule{\\textwidth}{0.6pt}}\n\n\\section*{\\textcolor{primary}{CHƯƠNG III. ĐỘNG LỰC HỌC}}"
              }
            ]
          }
        ],
        "formulaCount": 11
      },
      {
        "chapterId": "grade10-ch3",
        "chapterNum": "CHƯƠNG III",
        "chapterName": "ĐỘNG LỰC HỌC",
        "fullTitle": "CHƯƠNG III. ĐỘNG LỰC HỌC",
        "subsections": [
          {
            "subId": "grade10-ch3-sub1",
            "title": "1. Công thức trọng tâm",
            "type": "Trọng tâm",
            "formulas": [
              {
                "id": "PHY10-023",
                "grade": 10,
                "chapterId": "grade10-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "ĐỘNG LỰC HỌC",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Tổng hợp lực",
                "primaryMath": "\\vec{F} = \\vec{F}_1 + \\vec{F}_2 + \\vec{F}_3 + \\dots",
                "allMathBlocks": [
                  "\\vec{F} = \\vec{F}_1 + \\vec{F}_2 + \\vec{F}_3 + \\dots",
                  "F = \\sqrt{F_1^2 + F_2^2 + 2 F_1 F_2 \\cos\\alpha}"
                ],
                "subCases": [
                  {
                    "label": "Hai lực cùng phương, cùng chiều: $F = F_1 + F_2$",
                    "math": ""
                  },
                  {
                    "label": "Hai lực cùng phương, ngược chiều: $F = |F_1 - F_2|$",
                    "math": ""
                  },
                  {
                    "label": "Hai lực vuông góc ($",
                    "math": ""
                  },
                  {
                    "label": "Hai lực đồng quy hợp với nhau góc $",
                    "math": ""
                  }
                ],
                "notes": [],
                "variables": [
                  "\\item Hai lực đồng quy hợp với nhau góc $\\alpha$ bất kì (Định lí hàm số cosin):"
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ \\vec{F} = \\vec{F}_1 + \\vec{F}_2 + \\vec{F}_3 + \\dots \\]\n    \\begin{itemize}\n        \\item Hai lực cùng phương, cùng chiều: $F = F_1 + F_2$\n        \\item Hai lực cùng phương, ngược chiều: $F = |F_1 - F_2|$\n        \\item Hai lực vuông góc ($\\alpha = 90^\\circ$): $F = \\sqrt{F_1^2 + F_2^2}$\n        \\item Hai lực đồng quy hợp với nhau góc $\\alpha$ bất kì (Định lí hàm số cosin):\n        \\[ F = \\sqrt{F_1^2 + F_2^2 + 2 F_1 F_2 \\cos\\alpha} \\]"
              },
              {
                "id": "PHY10-024",
                "grade": 10,
                "chapterId": "grade10-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "ĐỘNG LỰC HỌC",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Điều kiện cân bằng của chất điểm (Các lực cân bằng)",
                "primaryMath": "\\vec{F} = \\vec{F}_1 + \\vec{F}_2 + \\vec{F}_3 + \\dots = \\vec{0}",
                "allMathBlocks": [
                  "\\vec{F} = \\vec{F}_1 + \\vec{F}_2 + \\vec{F}_3 + \\dots = \\vec{0}"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ \\vec{F} = \\vec{F}_1 + \\vec{F}_2 + \\vec{F}_3 + \\dots = \\vec{0} \\]"
              },
              {
                "id": "PHY10-025",
                "grade": 10,
                "chapterId": "grade10-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "ĐỘNG LỰC HỌC",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Định luật 2 Newton",
                "primaryMath": "\\vec{a} = \\frac{\\vec{F}}{m} \\quad \\text{hay} \\quad \\vec{F} = m \\cdot \\vec{a} \\qquad (1\\text{ N} = 1\\text{ kg} \\cdot 1\\text{ m/s}^2)",
                "allMathBlocks": [
                  "\\vec{a} = \\frac{\\vec{F}}{m} \\quad \\text{hay} \\quad \\vec{F} = m \\cdot \\vec{a} \\qquad (1\\text{ N} = 1\\text{ kg} \\cdot 1\\text{ m/s}^2)"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ \\vec{a} = \\frac{\\vec{F}}{m} \\quad \\text{hay} \\quad \\vec{F} = m \\cdot \\vec{a} \\qquad (1\\text{ N} = 1\\text{ kg} \\cdot 1\\text{ m/s}^2) \\]"
              },
              {
                "id": "PHY10-026",
                "grade": 10,
                "chapterId": "grade10-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "ĐỘNG LỰC HỌC",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Định luật 3 Newton (Cặp lực và phản lực trực đối)",
                "primaryMath": "\\vec{F}_{AB} = -\\vec{F}_{BA} \\quad \\text{với độ lớn } F_{AB} = F_{BA}",
                "allMathBlocks": [
                  "\\vec{F}_{AB} = -\\vec{F}_{BA} \\quad \\text{với độ lớn } F_{AB} = F_{BA}"
                ],
                "subCases": [],
                "notes": [],
                "variables": [
                  "\\[ \\vec{F}_{AB} = -\\vec{F}_{BA} \\quad \\text{với độ lớn } F_{AB} = F_{BA} \\]"
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ \\vec{F}_{AB} = -\\vec{F}_{BA} \\quad \\text{với độ lớn } F_{AB} = F_{BA} \\]"
              },
              {
                "id": "PHY10-027",
                "grade": 10,
                "chapterId": "grade10-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "ĐỘNG LỰC HỌC",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Trọng lực và Trọng lượng",
                "primaryMath": "\\vec{P} = m \\cdot \\vec{g} \\;;\\qquad \\text{Độ lớn: } P = m \\cdot g",
                "allMathBlocks": [
                  "\\vec{P} = m \\cdot \\vec{g} \\;;\\qquad \\text{Độ lớn: } P = m \\cdot g"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ \\vec{P} = m \\cdot \\vec{g} \\;;\\qquad \\text{Độ lớn: } P = m \\cdot g \\]"
              },
              {
                "id": "PHY10-028",
                "grade": 10,
                "chapterId": "grade10-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "ĐỘNG LỰC HỌC",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Lực ma sát nghỉ và Lực ma sát trượt",
                "primaryMath": "F_{ms} = \\mu \\cdot N \\quad \\Rightarrow \\quad \\mu = \\frac{F_{ms}}{N}",
                "allMathBlocks": [
                  "F_{ms} = \\mu \\cdot N \\quad \\Rightarrow \\quad \\mu = \\frac{F_{ms}}{N}"
                ],
                "subCases": [
                  {
                    "label": "Lực ma sát nghỉ có giá trị cực đại $F_0$. Khi ngoại lực đẩy/kéo $F",
                    "math": ""
                  },
                  {
                    "label": "Công thức độ lớn lực ma sát trượt:",
                    "math": "F_{ms} = \\mu \\cdot N \\quad \\Rightarrow \\quad \\mu = \\frac{F_{ms}}{N}"
                  }
                ],
                "notes": [
                  "(Trong đó $\\mu$ là hệ số ma sát trượt không có đơn vị, $N$ là độ lớn áp lực vuông góc lên bề mặt tiếp xúc)."
                ],
                "variables": [
                  "\\textit{(Trong đó $\\mu$ là hệ số ma sát trượt không có đơn vị, $N$ là độ lớn áp lực vuông góc lên bề mặt tiếp xúc).}"
                ],
                "conditions": [
                  "\\item Lực ma sát nghỉ có giá trị cực đại $F_0$. Khi ngoại lực đẩy/kéo $F \\le F_0$ thì $F_{msn} = F$; khi $F > F_0$ vật bắt đầu trượt."
                ],
                "unit": "",
                "rawChunk": "}\n    \\begin{itemize}\n        \\item Lực ma sát nghỉ có giá trị cực đại $F_0$. Khi ngoại lực đẩy/kéo $F \\le F_0$ thì $F_{msn} = F$; khi $F > F_0$ vật bắt đầu trượt.\n        \\item Công thức độ lớn lực ma sát trượt:\n        \\[ F_{ms} = \\mu \\cdot N \\quad \\Rightarrow \\quad \\mu = \\frac{F_{ms}}{N} \\]\n        \\textit{(Trong đó $\\mu$ là hệ số ma sát trượt không có đơn vị, $N$ là độ lớn áp lực vuông góc lên bề mặt tiếp xúc).}"
              },
              {
                "id": "PHY10-029",
                "grade": 10,
                "chapterId": "grade10-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "ĐỘNG LỰC HỌC",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Moment lực đối với một trục quay",
                "primaryMath": "M = F \\cdot d \\qquad (\\text{Đơn vị: N.m, với } d \\text{ là cánh tay đòn — khoảng cách từ trục quay đến giá của lực})",
                "allMathBlocks": [
                  "M = F \\cdot d \\qquad (\\text{Đơn vị: N.m, với } d \\text{ là cánh tay đòn — khoảng cách từ trục quay đến giá của lực})"
                ],
                "subCases": [],
                "notes": [],
                "variables": [
                  "\\[ M = F \\cdot d \\qquad (\\text{Đơn vị: N.m, với } d \\text{ là cánh tay đòn — khoảng cách từ trục quay đến giá của lực}) \\]"
                ],
                "conditions": [],
                "unit": "N",
                "rawChunk": "}\n    \\[ M = F \\cdot d \\qquad (\\text{Đơn vị: N.m, với } d \\text{ là cánh tay đòn — khoảng cách từ trục quay đến giá của lực}) \\]"
              },
              {
                "id": "PHY10-030",
                "grade": 10,
                "chapterId": "grade10-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "ĐỘNG LỰC HỌC",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Quy tắc moment lực (Điều kiện cân bằng của vật rắn có trục quay cố định)",
                "primaryMath": "\\sum M_{\\text{cùng chiều kim đồng hồ}} = \\sum M_{\\text{ngược chiều kim đồng hồ}} \\quad \\text{hay} \\quad \\sum M = 0 \\quad (F_1 \\cdot d_1 = F_2 \\cdot d_2)",
                "allMathBlocks": [
                  "\\sum M_{\\text{cùng chiều kim đồng hồ}} = \\sum M_{\\text{ngược chiều kim đồng hồ}} \\quad \\text{hay} \\quad \\sum M = 0 \\quad (F_1 \\cdot d_1 = F_2 \\cdot d_2)"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ \\sum M_{\\text{cùng chiều kim đồng hồ}} = \\sum M_{\\text{ngược chiều kim đồng hồ}} \\quad \\text{hay} \\quad \\sum M = 0 \\quad (F_1 \\cdot d_1 = F_2 \\cdot d_2) \\]"
              },
              {
                "id": "PHY10-031",
                "grade": 10,
                "chapterId": "grade10-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "ĐỘNG LỰC HỌC",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Moment của ngẫu lực",
                "primaryMath": "M = F_1 \\cdot d_1 + F_2 \\cdot d_2 = F(d_1 + d_2) = F \\cdot d",
                "allMathBlocks": [
                  "M = F_1 \\cdot d_1 + F_2 \\cdot d_2 = F(d_1 + d_2) = F \\cdot d"
                ],
                "subCases": [],
                "notes": [
                  "(Trong đó $F = F_1 = F_2$ là độ lớn của mỗi lực, $d = d_1 + d_2$ là khoảng cách giữa hai giá của ngẫu lực)."
                ],
                "variables": [
                  "\\textit{(Trong đó $F = F_1 = F_2$ là độ lớn của mỗi lực, $d = d_1 + d_2$ là khoảng cách giữa hai giá của ngẫu lực).}"
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ M = F_1 \\cdot d_1 + F_2 \\cdot d_2 = F(d_1 + d_2) = F \\cdot d \\]\n    \\textit{(Trong đó $F = F_1 = F_2$ là độ lớn của mỗi lực, $d = d_1 + d_2$ là khoảng cách giữa hai giá của ngẫu lực).}"
              },
              {
                "id": "PHY10-032",
                "grade": 10,
                "chapterId": "grade10-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "ĐỘNG LỰC HỌC",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Điều kiện cân bằng tổng quát của vật rắn",
                "primaryMath": "\\begin{cases} \\sum \\vec{F} = \\vec{0} \\\\ \\sum M = 0 \\quad (\\text{đối với một điểm bất kì chọn làm trục quay}) \\end{cases}",
                "allMathBlocks": [
                  "\\begin{cases} \\sum \\vec{F} = \\vec{0} \\\\ \\sum M = 0 \\quad (\\text{đối với một điểm bất kì chọn làm trục quay}) \\end{cases}"
                ],
                "subCases": [],
                "notes": [],
                "variables": [
                  "\\[ \\begin{cases} \\sum \\vec{F} = \\vec{0} \\\\ \\sum M = 0 \\quad (\\text{đối với một điểm bất kì chọn làm trục quay}) \\end{cases} \\]"
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ \\begin{cases} \\sum \\vec{F} = \\vec{0} \\\\ \\sum M = 0 \\quad (\\text{đối với một điểm bất kì chọn làm trục quay}) \\end{cases} \\]\n\\end{itemize}\n\n\\subsection*{\\textcolor{secondary}{2. Công thức mở rộng \\& Giải bài toán Động lực học}}"
              }
            ]
          },
          {
            "subId": "grade10-ch3-sub2",
            "title": "2. Công thức mở rộng \\& Giải bài toán Động lực học",
            "type": "Mở rộng & Vận dụng",
            "formulas": [
              {
                "id": "PHY10-033",
                "grade": 10,
                "chapterId": "grade10-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "ĐỘNG LỰC HỌC",
                "sectionTitle": "2. Công thức mở rộng \\& Giải bài toán Động lực học",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Lực đẩy Archimedes (Lực nâng vật trong chất lưu)",
                "primaryMath": "F_A = \\rho \\cdot g \\cdot V",
                "allMathBlocks": [
                  "F_A = \\rho \\cdot g \\cdot V"
                ],
                "subCases": [],
                "notes": [
                  "(Trong đó $\\rho$ là khối lượng riêng của chất lỏng/khí $(\\text{kg/m}^3)$, $V$ là thể tích phần chất lưu bị vật chiếm chỗ $(\\text{m}^3)$)."
                ],
                "variables": [
                  "\\textit{(Trong đó $\\rho$ là khối lượng riêng của chất lỏng/khí $(\\text{kg/m}^3)$, $V$ là thể tích phần chất lưu bị vật chiếm chỗ $(\\text{m}^3)$).}"
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ F_A = \\rho \\cdot g \\cdot V \\]\n    \\textit{(Trong đó $\\rho$ là khối lượng riêng của chất lỏng/khí $(\\text{kg/m}^3)$, $V$ là thể tích phần chất lưu bị vật chiếm chỗ $(\\text{m}^3)$).}"
              },
              {
                "id": "PHY10-034",
                "grade": 10,
                "chapterId": "grade10-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "ĐỘNG LỰC HỌC",
                "sectionTitle": "2. Công thức mở rộng \\& Giải bài toán Động lực học",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Phương pháp chiếu hệ trục toạ độ vuông góc $Ox, Oy$ trong bài toán Động lực học",
                "primaryMath": "\\begin{cases} Ox: F_x = F_{1x} + F_{2x} + \\dots = m \\cdot a_x = m \\cdot a \\\\ Oy: F_y = F_{1y} + F_{2y} + \\dots = 0 \\end{cases}",
                "allMathBlocks": [
                  "\\begin{cases} Ox: F_x = F_{1x} + F_{2x} + \\dots = m \\cdot a_x = m \\cdot a \\\\ Oy: F_y = F_{1y} + F_{2y} + \\dots = 0 \\end{cases}"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ \\begin{cases} Ox: F_x = F_{1x} + F_{2x} + \\dots = m \\cdot a_x = m \\cdot a \\\\ Oy: F_y = F_{1y} + F_{2y} + \\dots = 0 \\end{cases} \\]"
              },
              {
                "id": "PHY10-035",
                "grade": 10,
                "chapterId": "grade10-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "ĐỘNG LỰC HỌC",
                "sectionTitle": "2. Công thức mở rộng \\& Giải bài toán Động lực học",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Các trường hợp chuyển động điển hình (Tổng quan)",
                "primaryMath": "F = m(a + \\mu g) \\;;\\quad a = g(\\sin\\alpha - \\mu\\cos\\alpha)",
                "allMathBlocks": [],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\begin{enumerate}"
              },
              {
                "id": "PHY10-036",
                "grade": 10,
                "chapterId": "grade10-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "ĐỘNG LỰC HỌC",
                "sectionTitle": "2. Công thức mở rộng \\& Giải bài toán Động lực học",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Vật chuyển động trên mặt phẳng ngang dưới tác dụng của lực kéo $\\vec{F}$ nằm ngang",
                "primaryMath": "N = P = m \\cdot g \\;;\\qquad F_{ms} = \\mu \\cdot m \\cdot g \\;;\\qquad a = \\frac{F - \\mu m g}{m} \\quad \\text{hay} \\quad F = m(a + \\mu g)",
                "allMathBlocks": [
                  "N = P = m \\cdot g \\;;\\qquad F_{ms} = \\mu \\cdot m \\cdot g \\;;\\qquad a = \\frac{F - \\mu m g}{m} \\quad \\text{hay} \\quad F = m(a + \\mu g)"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n        \\[ N = P = m \\cdot g \\;;\\qquad F_{ms} = \\mu \\cdot m \\cdot g \\;;\\qquad a = \\frac{F - \\mu m g}{m} \\quad \\text{hay} \\quad F = m(a + \\mu g) \\]"
              },
              {
                "id": "PHY10-037",
                "grade": 10,
                "chapterId": "grade10-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "ĐỘNG LỰC HỌC",
                "sectionTitle": "2. Công thức mở rộng \\& Giải bài toán Động lực học",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Vật chuyển động trên mặt phẳng ngang với lực kéo $\\vec{F}$ chếch lên góc $\\alpha$ so với phương ngang",
                "primaryMath": "N = m \\cdot g - F \\sin\\alpha \\;;\\qquad F \\cos\\alpha - \\mu(m g - F \\sin\\alpha) = m \\cdot a",
                "allMathBlocks": [
                  "N = m \\cdot g - F \\sin\\alpha \\;;\\qquad F \\cos\\alpha - \\mu(m g - F \\sin\\alpha) = m \\cdot a",
                  "F = \\frac{\\mu \\cdot m \\cdot g}{\\cos\\alpha + \\mu \\sin\\alpha}"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [
                  "Khi vật chuyển động thẳng đều ($a = 0$):"
                ],
                "unit": "",
                "rawChunk": "}\n        \\[ N = m \\cdot g - F \\sin\\alpha \\;;\\qquad F \\cos\\alpha - \\mu(m g - F \\sin\\alpha) = m \\cdot a \\]\n        Khi vật chuyển động thẳng đều ($a = 0$):\n        \\[ F = \\frac{\\mu \\cdot m \\cdot g}{\\cos\\alpha + \\mu \\sin\\alpha} \\]"
              },
              {
                "id": "PHY10-038",
                "grade": 10,
                "chapterId": "grade10-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "ĐỘNG LỰC HỌC",
                "sectionTitle": "2. Công thức mở rộng \\& Giải bài toán Động lực học",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Vật trượt xuống mặt phẳng nghiêng góc $\\alpha$ so với phương ngang",
                "primaryMath": "P_x = m \\cdot g \\cdot \\sin\\alpha \\;;\\qquad N = P_y = m \\cdot g \\cdot \\cos\\alpha \\;;\\qquad F_{ms} = \\mu \\cdot m \\cdot g \\cdot \\cos\\alpha",
                "allMathBlocks": [
                  "P_x = m \\cdot g \\cdot \\sin\\alpha \\;;\\qquad N = P_y = m \\cdot g \\cdot \\cos\\alpha \\;;\\qquad F_{ms} = \\mu \\cdot m \\cdot g \\cdot \\cos\\alpha",
                  "a = g(\\sin\\alpha - \\mu \\cos\\alpha)"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n        \\[ P_x = m \\cdot g \\cdot \\sin\\alpha \\;;\\qquad N = P_y = m \\cdot g \\cdot \\cos\\alpha \\;;\\qquad F_{ms} = \\mu \\cdot m \\cdot g \\cdot \\cos\\alpha \\]\n        Gia tốc trượt xuống mặt phẳng nghiêng:\n        \\[ a = g(\\sin\\alpha - \\mu \\cos\\alpha) \\]"
              },
              {
                "id": "PHY10-039",
                "grade": 10,
                "chapterId": "grade10-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "ĐỘNG LỰC HỌC",
                "sectionTitle": "2. Công thức mở rộng \\& Giải bài toán Động lực học",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Quy tắc tổng hợp hai lực song song cùng chiều (Bài 22)",
                "primaryMath": "F = F_1 + F_2 \\qquad \\text{và} \\qquad \\frac{F_1}{F_2} = \\frac{d_2}{d_1} = \\frac{OB}{OA} = \\frac{AB - OA}{OA}",
                "allMathBlocks": [
                  "F = F_1 + F_2 \\qquad \\text{và} \\qquad \\frac{F_1}{F_2} = \\frac{d_2}{d_1} = \\frac{OB}{OA} = \\frac{AB - OA}{OA}"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ F = F_1 + F_2 \\qquad \\text{và} \\qquad \\frac{F_1}{F_2} = \\frac{d_2}{d_1} = \\frac{OB}{OA} = \\frac{AB - OA}{OA} \\]"
              },
              {
                "id": "PHY10-040",
                "grade": 10,
                "chapterId": "grade10-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "ĐỘNG LỰC HỌC",
                "sectionTitle": "2. Công thức mở rộng \\& Giải bài toán Động lực học",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Xác định gia tốc trên máng đệm khí (Thí nghiệm Bài 15)",
                "primaryMath": "a = \\frac{2s}{t^2} \\quad (\\text{khi } v_0 = 0) \\qquad \\text{hoặc} \\qquad a = \\frac{v_2^2 - v_1^2}{2s} \\quad (\\text{khi đo vận tốc tức thời } v_1, v_2 \\text{ qua 2 cổng quang})",
                "allMathBlocks": [
                  "a = \\frac{2s}{t^2} \\quad (\\text{khi } v_0 = 0) \\qquad \\text{hoặc} \\qquad a = \\frac{v_2^2 - v_1^2}{2s} \\quad (\\text{khi đo vận tốc tức thời } v_1, v_2 \\text{ qua 2 cổng quang})"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [
                  "\\[ a = \\frac{2s}{t^2} \\quad (\\text{khi } v_0 = 0) \\qquad \\text{hoặc} \\qquad a = \\frac{v_2^2 - v_1^2}{2s} \\quad (\\text{khi đo vận tốc tức thời } v_1, v_2 \\text{ qua 2 cổng quang}) \\]"
                ],
                "unit": "",
                "rawChunk": "}\n    \\[ a = \\frac{2s}{t^2} \\quad (\\text{khi } v_0 = 0) \\qquad \\text{hoặc} \\qquad a = \\frac{v_2^2 - v_1^2}{2s} \\quad (\\text{khi đo vận tốc tức thời } v_1, v_2 \\text{ qua 2 cổng quang}) \\]\n\\end{itemize}\n\n\\vspace{8pt}\n\\textcolor{rulecolor}{\\rule{\\textwidth}{0.6pt}}\n\n\\section*{\\textcolor{primary}{CHƯƠNG IV. NĂNG LƯỢNG, CÔNG, CÔNG SUẤT (BÀI 23 – BÀI 25)}}"
              }
            ]
          }
        ],
        "formulaCount": 18
      },
      {
        "chapterId": "grade10-ch4",
        "chapterNum": "CHƯƠNG IV",
        "chapterName": "NĂNG LƯỢNG, CÔNG, CÔNG SUẤT (BÀI 23 – BÀI 25)",
        "fullTitle": "CHƯƠNG IV. NĂNG LƯỢNG, CÔNG, CÔNG SUẤT (BÀI 23 – BÀI 25)",
        "subsections": [
          {
            "subId": "grade10-ch4-sub1",
            "title": "1. Công cơ học",
            "type": "Chuyên đề",
            "formulas": [
              {
                "id": "PHY10-041",
                "grade": 10,
                "chapterId": "grade10-ch4",
                "chapterNum": "CHƯƠNG IV",
                "chapterName": "NĂNG LƯỢNG, CÔNG, CÔNG SUẤT (BÀI 23 – BÀI 25)",
                "sectionTitle": "1. Công cơ học",
                "sectionType": "Chuyên đề",
                "title": "Khi lực không đổi $\\vec{F}$ cùng hướng với chuyển động",
                "primaryMath": "A = F \\cdot s = F \\cdot d \\qquad (1\\text{ J} = 1\\text{ N} \\cdot 1\\text{ m})",
                "allMathBlocks": [
                  "A = F \\cdot s = F \\cdot d \\qquad (1\\text{ J} = 1\\text{ N} \\cdot 1\\text{ m})"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ A = F \\cdot s = F \\cdot d \\qquad (1\\text{ J} = 1\\text{ N} \\cdot 1\\text{ m}) \\]"
              },
              {
                "id": "PHY10-042",
                "grade": 10,
                "chapterId": "grade10-ch4",
                "chapterNum": "CHƯƠNG IV",
                "chapterName": "NĂNG LƯỢNG, CÔNG, CÔNG SUẤT (BÀI 23 – BÀI 25)",
                "sectionTitle": "1. Công cơ học",
                "sectionType": "Chuyên đề",
                "title": "Khi lực không đổi $\\vec{F}$ hợp với hướng chuyển động một góc $\\alpha$",
                "primaryMath": "A = F \\cdot s \\cdot \\cos\\alpha = F \\cdot d \\cdot \\cos\\alpha",
                "allMathBlocks": [
                  "A = F \\cdot s \\cdot \\cos\\alpha = F \\cdot d \\cdot \\cos\\alpha"
                ],
                "subCases": [
                  {
                    "label": "$0^",
                    "math": ""
                  },
                  {
                    "label": "$",
                    "math": ""
                  },
                  {
                    "label": "$90^",
                    "math": ""
                  }
                ],
                "notes": [],
                "variables": [
                  "\\item $\\alpha = 90^\\circ \\Rightarrow \\cos\\alpha = 0$: Lực vuông góc với phương dịch chuyển, không sinh công ($A = 0$)."
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ A = F \\cdot s \\cdot \\cos\\alpha = F \\cdot d \\cdot \\cos\\alpha \\]\n    \\begin{itemize}\n        \\item $0^\\circ \\le \\alpha < 90^\\circ \\Rightarrow \\cos\\alpha > 0$: Công phát động ($A > 0$).\n        \\item $\\alpha = 90^\\circ \\Rightarrow \\cos\\alpha = 0$: Lực vuông góc với phương dịch chuyển, không sinh công ($A = 0$).\n        \\item $90^\\circ < \\alpha \\le 180^\\circ \\Rightarrow \\cos\\alpha < 0$: Công cản ($A < 0$)."
              },
              {
                "id": "PHY10-043",
                "grade": 10,
                "chapterId": "grade10-ch4",
                "chapterNum": "CHƯƠNG IV",
                "chapterName": "NĂNG LƯỢNG, CÔNG, CÔNG SUẤT (BÀI 23 – BÀI 25)",
                "sectionTitle": "1. Công cơ học",
                "sectionType": "Chuyên đề",
                "title": "Công tối thiểu để nâng đều một vật lên độ cao $h$",
                "primaryMath": "A_{\\min} = P \\cdot h = m \\cdot g \\cdot h \\quad (\\text{không phụ thuộc vào hình dạng đường đi thẳng đứng hay nghiêng})",
                "allMathBlocks": [
                  "A_{\\min} = P \\cdot h = m \\cdot g \\cdot h \\quad (\\text{không phụ thuộc vào hình dạng đường đi thẳng đứng hay nghiêng})"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ A_{\\min} = P \\cdot h = m \\cdot g \\cdot h \\quad (\\text{không phụ thuộc vào hình dạng đường đi thẳng đứng hay nghiêng}) \\]\n\\end{itemize}\n\n\\subsection*{\\textcolor{secondary}{2. Công suất (Tốc độ sinh công)}}"
              }
            ]
          },
          {
            "subId": "grade10-ch4-sub2",
            "title": "2. Công suất (Tốc độ sinh công)",
            "type": "Chuyên đề",
            "formulas": [
              {
                "id": "PHY10-044",
                "grade": 10,
                "chapterId": "grade10-ch4",
                "chapterNum": "CHƯƠNG IV",
                "chapterName": "NĂNG LƯỢNG, CÔNG, CÔNG SUẤT (BÀI 23 – BÀI 25)",
                "sectionTitle": "2. Công suất (Tốc độ sinh công)",
                "sectionType": "Chuyên đề",
                "title": "Công thức định nghĩa công suất",
                "primaryMath": "\\mathcal{P} = \\frac{A}{t} \\qquad \\left(1\\text{ W} = \\frac{1\\text{ J}}{1\\text{ s}} \\;;\\quad 1\\text{ kW} = 10^3\\text{ W} \\;;\\quad 1\\text{ MW} = 10^6\\text{ W}\\right)",
                "allMathBlocks": [
                  "\\mathcal{P} = \\frac{A}{t} \\qquad \\left(1\\text{ W} = \\frac{1\\text{ J}}{1\\text{ s}} \\;;\\quad 1\\text{ kW} = 10^3\\text{ W} \\;;\\quad 1\\text{ MW} = 10^6\\text{ W}\\right)"
                ],
                "subCases": [],
                "notes": [
                  "Chú ý mở rộng:"
                ],
                "variables": [],
                "conditions": [
                  "\\textit{Chú ý mở rộng:} Đơn vị kilôoát giờ ($\\text{kW.h}$) là đơn vị của công/năng lượng: $1\\text{ kW.h} = 1\\,000\\text{ W} \\cdot 3\\,600\\text{ s} = 3\\,600\\,000\\text{ J} = 3,6\\text{ MJ}$."
                ],
                "unit": "kilôoát giờ (kW",
                "rawChunk": "}\n    \\[ \\mathcal{P} = \\frac{A}{t} \\qquad \\left(1\\text{ W} = \\frac{1\\text{ J}}{1\\text{ s}} \\;;\\quad 1\\text{ kW} = 10^3\\text{ W} \\;;\\quad 1\\text{ MW} = 10^6\\text{ W}\\right) \\]\n    \\textit{Chú ý mở rộng:} Đơn vị kilôoát giờ ($\\text{kW.h}$) là đơn vị của công/năng lượng: $1\\text{ kW.h} = 1\\,000\\text{ W} \\cdot 3\\,600\\text{ s} = 3\\,600\\,000\\text{ J} = 3,6\\text{ MJ}$."
              },
              {
                "id": "PHY10-045",
                "grade": 10,
                "chapterId": "grade10-ch4",
                "chapterNum": "CHƯƠNG IV",
                "chapterName": "NĂNG LƯỢNG, CÔNG, CÔNG SUẤT (BÀI 23 – BÀI 25)",
                "sectionTitle": "2. Công suất (Tốc độ sinh công)",
                "sectionType": "Chuyên đề",
                "title": "Liên hệ giữa công suất với lực kéo và tốc độ",
                "primaryMath": "\\mathcal{P} = \\frac{A}{t} = \\frac{F \\cdot s}{t} = F \\cdot v",
                "allMathBlocks": [],
                "subCases": [
                  {
                    "label": "Công suất trung bình: $",
                    "math": ""
                  },
                  {
                    "label": "Công suất tức thời: $",
                    "math": ""
                  }
                ],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\begin{itemize}\n        \\item Công suất trung bình: $\\mathcal{P} = \\frac{A}{t} = \\frac{F \\cdot s}{t} = F \\cdot v$\n        \\item Công suất tức thời: $\\mathcal{P}_t = F \\cdot v_t$\n    \\end{itemize}\n\\end{itemize}\n\n\\subsection*{\\textcolor{secondary}{3. Động năng}}"
              }
            ]
          },
          {
            "subId": "grade10-ch4-sub3",
            "title": "3. Động năng",
            "type": "Chuyên đề",
            "formulas": [
              {
                "id": "PHY10-046",
                "grade": 10,
                "chapterId": "grade10-ch4",
                "chapterNum": "CHƯƠNG IV",
                "chapterName": "NĂNG LƯỢNG, CÔNG, CÔNG SUẤT (BÀI 23 – BÀI 25)",
                "sectionTitle": "3. Động năng",
                "sectionType": "Chuyên đề",
                "title": "Động năng của một vật khối lượng $m$ đang chuyển động với tốc độ $v$",
                "primaryMath": "W_{\\text{đ}} = \\frac{1}{2} m \\cdot v^2 \\qquad (\\text{Đơn vị: Jun (J)})",
                "allMathBlocks": [
                  "W_{\\text{đ}} = \\frac{1}{2} m \\cdot v^2 \\qquad (\\text{Đơn vị: Jun (J)})"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "Jun (J",
                "rawChunk": "}\n    \\[ W_{\\text{đ}} = \\frac{1}{2} m \\cdot v^2 \\qquad (\\text{Đơn vị: Jun (J)}) \\]"
              }
            ]
          }
        ],
        "formulaCount": 6
      }
    ],
    "totalFormulas": 46
  },
  "11": {
    "grade": 11,
    "siTable": [],
    "chapters": [
      {
        "chapterId": "grade11-ch1",
        "chapterNum": "CHƯƠNG I",
        "chapterName": "DAO ĐỘNG",
        "fullTitle": "CHƯƠNG I. DAO ĐỘNG",
        "subsections": [
          {
            "subId": "grade11-ch1-sub1",
            "title": "1. Công thức trọng tâm",
            "type": "Trọng tâm",
            "formulas": [
              {
                "id": "PHY11-001",
                "grade": 11,
                "chapterId": "grade11-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "DAO ĐỘNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Phương trình li độ của dao động điều hoà",
                "primaryMath": "x = A \\cos(\\omega t + \\varphi)",
                "allMathBlocks": [
                  "x = A \\cos(\\omega t + \\varphi)"
                ],
                "subCases": [],
                "notes": [
                  "Trong đó:"
                ],
                "variables": [
                  "\\textit{Trong đó:} $x$ là li độ dao động; $A$ là biên độ dao động ($A > 0$); $(\\omega t + \\varphi)$ là pha của dao động tại thời điểm $t$ ($\\text{rad}$); $\\varphi$ là pha ban đầu ($-\\pi \\le \\varphi \\le \\pi$, đơn vị $\\text{rad}$)."
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ x = A \\cos(\\omega t + \\varphi) \\]\n    \\textit{Trong đó:} $x$ là li độ dao động; $A$ là biên độ dao động ($A > 0$); $(\\omega t + \\varphi)$ là pha của dao động tại thời điểm $t$ ($\\text{rad}$); $\\varphi$ là pha ban đầu ($-\\pi \\le \\varphi \\le \\pi$, đơn vị $\\text{rad}$)."
              },
              {
                "id": "PHY11-002",
                "grade": 11,
                "chapterId": "grade11-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "DAO ĐỘNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Mối liên hệ giữa chu kì $T$, tần số $f$ và tần số góc $\\omega$",
                "primaryMath": "f = \\frac{1}{T} \\qquad \\text{và} \\qquad \\omega = \\frac{2\\pi}{T} = 2\\pi f \\quad (\\text{Đơn vị: } T \\text{ (s)}, \\; f \\text{ (Hz)}, \\; \\omega \\text{ (rad/s)})",
                "allMathBlocks": [
                  "f = \\frac{1}{T} \\qquad \\text{và} \\qquad \\omega = \\frac{2\\pi}{T} = 2\\pi f \\quad (\\text{Đơn vị: } T \\text{ (s)}, \\; f \\text{ (Hz)}, \\; \\omega \\text{ (rad/s)})"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "T  (s",
                "rawChunk": "}\n    \\[ f = \\frac{1}{T} \\qquad \\text{và} \\qquad \\omega = \\frac{2\\pi}{T} = 2\\pi f \\quad (\\text{Đơn vị: } T \\text{ (s)}, \\; f \\text{ (Hz)}, \\; \\omega \\text{ (rad/s)}) \\]"
              },
              {
                "id": "PHY11-003",
                "grade": 11,
                "chapterId": "grade11-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "DAO ĐỘNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Độ lệch pha giữa hai dao động điều hoà cùng chu kì (cùng tần số)",
                "primaryMath": "\\Delta \\varphi = \\varphi_1 - \\varphi_2",
                "allMathBlocks": [
                  "\\Delta \\varphi = \\varphi_1 - \\varphi_2"
                ],
                "subCases": [
                  {
                    "label": "Nếu $",
                    "math": ""
                  },
                  {
                    "label": "Nếu $",
                    "math": ""
                  },
                  {
                    "label": "Nếu $",
                    "math": ""
                  },
                  {
                    "label": "Nếu $",
                    "math": ""
                  }
                ],
                "notes": [],
                "variables": [],
                "conditions": [
                  "\\item Nếu $\\varphi_1 > \\varphi_2$: dao động 1 sớm pha hơn dao động 2.",
                  "\\item Nếu $\\varphi_1 < \\varphi_2$: dao động 1 trễ pha hơn dao động 2.",
                  "\\item Nếu $\\varphi_1 = \\varphi_2$: hai dao động cùng (đồng) pha.",
                  "\\item Nếu $\\varphi_1 = \\varphi_2 \\pm \\pi$: hai dao động ngược pha."
                ],
                "unit": "",
                "rawChunk": "}\n    \\[ \\Delta \\varphi = \\varphi_1 - \\varphi_2 \\]\n    \\begin{itemize}\n        \\item Nếu $\\varphi_1 > \\varphi_2$: dao động 1 sớm pha hơn dao động 2.\n        \\item Nếu $\\varphi_1 < \\varphi_2$: dao động 1 trễ pha hơn dao động 2.\n        \\item Nếu $\\varphi_1 = \\varphi_2$: hai dao động cùng (đồng) pha.\n        \\item Nếu $\\varphi_1 = \\varphi_2 \\pm \\pi$: hai dao động ngược pha."
              },
              {
                "id": "PHY11-004",
                "grade": 11,
                "chapterId": "grade11-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "DAO ĐỘNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Phương trình vận tốc trong dao động điều hoà",
                "primaryMath": "v = \\frac{\\Delta x}{\\Delta t} = x' = -\\omega A \\sin(\\omega t + \\varphi) = \\omega A \\cos\\left(\\omega t + \\varphi + \\frac{\\pi}{2}\\right)",
                "allMathBlocks": [
                  "v = \\frac{\\Delta x}{\\Delta t} = x' = -\\omega A \\sin(\\omega t + \\varphi) = \\omega A \\cos\\left(\\omega t + \\varphi + \\frac{\\pi}{2}\\right)"
                ],
                "subCases": [
                  {
                    "label": "Vận tốc sớm pha $",
                    "math": ""
                  },
                  {
                    "label": "Tại vị trí cân bằng ($x = 0$): $v =",
                    "math": ""
                  },
                  {
                    "label": "Tại vị trí biên ($x =",
                    "math": ""
                  }
                ],
                "notes": [],
                "variables": [
                  "\\item Vận tốc sớm pha $\\frac{\\pi}{2}$ so với li độ $x$."
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ v = \\frac{\\Delta x}{\\Delta t} = x' = -\\omega A \\sin(\\omega t + \\varphi) = \\omega A \\cos\\left(\\omega t + \\varphi + \\frac{\\pi}{2}\\right) \\]\n    \\begin{itemize}\n        \\item Vận tốc sớm pha $\\frac{\\pi}{2}$ so với li độ $x$.\n        \\item Tại vị trí cân bằng ($x = 0$): $v = \\pm \\omega A \\Rightarrow$ tốc độ cực đại $v_{\\max} = \\omega A$.\n        \\item Tại vị trí biên ($x = \\pm A$): $v = 0$."
              },
              {
                "id": "PHY11-005",
                "grade": 11,
                "chapterId": "grade11-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "DAO ĐỘNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Phương trình gia tốc trong dao động điều hoà",
                "primaryMath": "a = \\frac{\\Delta v}{\\Delta t} = v' = -\\omega^2 A \\cos(\\omega t + \\varphi) = -\\omega^2 x",
                "allMathBlocks": [
                  "a = \\frac{\\Delta v}{\\Delta t} = v' = -\\omega^2 A \\cos(\\omega t + \\varphi) = -\\omega^2 x"
                ],
                "subCases": [
                  {
                    "label": "Gia tốc luôn ngược pha với li độ $x$ và sớm pha $",
                    "math": ""
                  },
                  {
                    "label": "Tại vị trí cân bằng ($x = 0$): $a = 0$.",
                    "math": ""
                  },
                  {
                    "label": "Tại vị trí biên ($x =",
                    "math": ""
                  }
                ],
                "notes": [],
                "variables": [
                  "\\item Gia tốc luôn ngược pha với li độ $x$ và sớm pha $\\frac{\\pi}{2}$ so với vận tốc $v$; vectơ gia tốc luôn hướng về vị trí cân bằng."
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ a = \\frac{\\Delta v}{\\Delta t} = v' = -\\omega^2 A \\cos(\\omega t + \\varphi) = -\\omega^2 x \\]\n    \\begin{itemize}\n        \\item Gia tốc luôn ngược pha với li độ $x$ và sớm pha $\\frac{\\pi}{2}$ so với vận tốc $v$; vectơ gia tốc luôn hướng về vị trí cân bằng.\n        \\item Tại vị trí cân bằng ($x = 0$): $a = 0$.\n        \\item Tại vị trí biên ($x = \\pm A$): $a = \\mp \\omega^2 A \\Rightarrow$ độ lớn gia tốc cực đại $a_{\\max} = \\omega^2 A$."
              },
              {
                "id": "PHY11-006",
                "grade": 11,
                "chapterId": "grade11-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "DAO ĐỘNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Động năng, thế năng và cơ năng trong dao động điều hoà (Tổng quan)",
                "primaryMath": "W = W_{\\text{đ}} + W_t = \\frac{1}{2}m\\omega^2 A^2 = \\text{hằng số}",
                "allMathBlocks": [],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\begin{itemize}"
              },
              {
                "id": "PHY11-007",
                "grade": 11,
                "chapterId": "grade11-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "DAO ĐỘNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Động năng",
                "primaryMath": "W_{\\text{đ}} = \\frac{1}{2} m v^2 = \\frac{1}{2} m \\omega^2 A^2 \\sin^2(\\omega t + \\varphi) = \\frac{1}{2} m \\omega^2 (A^2 - x^2)",
                "allMathBlocks": [
                  "W_{\\text{đ}} = \\frac{1}{2} m v^2 = \\frac{1}{2} m \\omega^2 A^2 \\sin^2(\\omega t + \\varphi) = \\frac{1}{2} m \\omega^2 (A^2 - x^2)"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n        \\[ W_{\\text{đ}} = \\frac{1}{2} m v^2 = \\frac{1}{2} m \\omega^2 A^2 \\sin^2(\\omega t + \\varphi) = \\frac{1}{2} m \\omega^2 (A^2 - x^2) \\]"
              },
              {
                "id": "PHY11-008",
                "grade": 11,
                "chapterId": "grade11-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "DAO ĐỘNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Thế năng",
                "primaryMath": "W_t = \\frac{1}{2} m \\omega^2 x^2 = \\frac{1}{2} m \\omega^2 A^2 \\cos^2(\\omega t + \\varphi)",
                "allMathBlocks": [
                  "W_t = \\frac{1}{2} m \\omega^2 x^2 = \\frac{1}{2} m \\omega^2 A^2 \\cos^2(\\omega t + \\varphi)"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n        \\[ W_t = \\frac{1}{2} m \\omega^2 x^2 = \\frac{1}{2} m \\omega^2 A^2 \\cos^2(\\omega t + \\varphi) \\]"
              },
              {
                "id": "PHY11-009",
                "grade": 11,
                "chapterId": "grade11-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "DAO ĐỘNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Cơ năng (bảo toàn khi bỏ qua ma sát)",
                "primaryMath": "W = W_{\\text{đ}} + W_t = W_{\\text{đ}\\max} = W_{t\\max} = \\frac{1}{2} m \\omega^2 A^2 = \\text{hằng số}",
                "allMathBlocks": [
                  "W = W_{\\text{đ}} + W_t = W_{\\text{đ}\\max} = W_{t\\max} = \\frac{1}{2} m \\omega^2 A^2 = \\text{hằng số}"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n        \\[ W = W_{\\text{đ}} + W_t = W_{\\text{đ}\\max} = W_{t\\max} = \\frac{1}{2} m \\omega^2 A^2 = \\text{hằng số} \\]"
              },
              {
                "id": "PHY11-010",
                "grade": 11,
                "chapterId": "grade11-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "DAO ĐỘNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Điều kiện hiện tượng cộng hưởng",
                "primaryMath": "f = f_0 \\qquad (\\text{Tần số } f \\text{ của ngoại lực cưỡng bức bằng tần số riêng } f_0 \\text{ của hệ dao động})",
                "allMathBlocks": [
                  "f = f_0 \\qquad (\\text{Tần số } f \\text{ của ngoại lực cưỡng bức bằng tần số riêng } f_0 \\text{ của hệ dao động})"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ f = f_0 \\qquad (\\text{Tần số } f \\text{ của ngoại lực cưỡng bức bằng tần số riêng } f_0 \\text{ của hệ dao động}) \\]\n\\end{itemize}\n\n\\subsection*{\\textcolor{secondary}{2. Công thức mở rộng \\& Vận dụng}}"
              }
            ]
          },
          {
            "subId": "grade11-ch1-sub2",
            "title": "2. Công thức mở rộng \\& Vận dụng",
            "type": "Mở rộng & Vận dụng",
            "formulas": [
              {
                "id": "PHY11-011",
                "grade": 11,
                "chapterId": "grade11-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "DAO ĐỘNG",
                "sectionTitle": "2. Công thức mở rộng \\& Vận dụng",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Mối liên hệ với chuyển động tròn đều và chiều dài quỹ đạo",
                "primaryMath": "M",
                "allMathBlocks": [],
                "subCases": [
                  {
                    "label": "Hình chiếu của điểm $M$ chuyển động tròn đều bán kính $OM = A$, tốc độ góc $",
                    "math": ""
                  },
                  {
                    "label": "Chiều dài quỹ đạo dao động điều hoà: $L = 2A",
                    "math": ""
                  }
                ],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\begin{itemize}\n        \\item Hình chiếu của điểm $M$ chuyển động tròn đều bán kính $OM = A$, tốc độ góc $\\omega$ lên trục $Ox$: $x = OM \\cos(\\omega t + \\varphi)$.\n        \\item Chiều dài quỹ đạo dao động điều hoà: $L = 2A \\Rightarrow A = \\frac{L}{2}$."
              },
              {
                "id": "PHY11-012",
                "grade": 11,
                "chapterId": "grade11-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "DAO ĐỘNG",
                "sectionTitle": "2. Công thức mở rộng \\& Vận dụng",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Hệ thức độc lập với thời gian và xác định pha ban đầu (Bài 3, Bài 4)",
                "primaryMath": "v = \\pm \\omega \\sqrt{A^2 - x^2} \\quad \\Leftrightarrow \\quad A = \\sqrt{x^2 + \\frac{v^2}{\\omega^2}} \\;;\\qquad \\tan\\varphi = -\\frac{\\omega x_0}{v_0}",
                "allMathBlocks": [
                  "v = \\pm \\omega \\sqrt{A^2 - x^2} \\quad \\Leftrightarrow \\quad A = \\sqrt{x^2 + \\frac{v^2}{\\omega^2}} \\;;\\qquad \\tan\\varphi = -\\frac{\\omega x_0}{v_0}"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ v = \\pm \\omega \\sqrt{A^2 - x^2} \\quad \\Leftrightarrow \\quad A = \\sqrt{x^2 + \\frac{v^2}{\\omega^2}} \\;;\\qquad \\tan\\varphi = -\\frac{\\omega x_0}{v_0} \\]"
              },
              {
                "id": "PHY11-013",
                "grade": 11,
                "chapterId": "grade11-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "DAO ĐỘNG",
                "sectionTitle": "2. Công thức mở rộng \\& Vận dụng",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Con lắc lò xo (độ cứng $k$, vật nặng khối lượng $m$)",
                "primaryMath": "\\omega = \\sqrt{\\frac{k}{m}} \\;;\\qquad T = 2\\pi\\sqrt{\\frac{m}{k}} \\;;\\qquad W_t = \\frac{1}{2} k x^2 \\;;\\qquad W = \\frac{1}{2} k A^2 = \\frac{1}{2} m \\omega^2 A^2",
                "allMathBlocks": [
                  "\\omega = \\sqrt{\\frac{k}{m}} \\;;\\qquad T = 2\\pi\\sqrt{\\frac{m}{k}} \\;;\\qquad W_t = \\frac{1}{2} k x^2 \\;;\\qquad W = \\frac{1}{2} k A^2 = \\frac{1}{2} m \\omega^2 A^2"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ \\omega = \\sqrt{\\frac{k}{m}} \\;;\\qquad T = 2\\pi\\sqrt{\\frac{m}{k}} \\;;\\qquad W_t = \\frac{1}{2} k x^2 \\;;\\qquad W = \\frac{1}{2} k A^2 = \\frac{1}{2} m \\omega^2 A^2 \\]"
              },
              {
                "id": "PHY11-014",
                "grade": 11,
                "chapterId": "grade11-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "DAO ĐỘNG",
                "sectionTitle": "2. Công thức mở rộng \\& Vận dụng",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Con lắc đơn (chiều dài dây $l$, gia tốc rơi tự do $g$, li độ góc $\\alpha_0 \\le 10^\\circ$)",
                "primaryMath": "\\omega = \\sqrt{\\frac{g}{l}} \\;;\\qquad T = 2\\pi\\sqrt{\\frac{l}{g}}",
                "allMathBlocks": [
                  "\\omega = \\sqrt{\\frac{g}{l}} \\;;\\qquad T = 2\\pi\\sqrt{\\frac{l}{g}}",
                  "W_t = mgl(1 - \\cos\\alpha) = 2mgl\\sin^2\\frac{\\alpha}{2} \\approx \\frac{1}{2} mgl \\alpha^2 = \\frac{1}{2} m \\frac{g}{l} s^2",
                  "W_{\\text{đ}} = W - W_t = mgl(\\cos\\alpha - \\cos\\alpha_0) \\approx \\frac{1}{2} mgl (\\alpha_0^2 - \\alpha^2)"
                ],
                "subCases": [
                  {
                    "label": "Mối liên hệ giữa li độ dài $s$ và li độ góc $",
                    "math": ""
                  },
                  {
                    "label": "Tần số góc và chu kì dao động điều hoà:",
                    "math": "\\omega = \\sqrt{\\frac{g}{l}} \\;;\\qquad T = 2\\pi\\sqrt{\\frac{l}{g}}"
                  },
                  {
                    "label": "Thế năng và động năng của con lắc đơn tại li độ góc $",
                    "math": ""
                  }
                ],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\begin{itemize}\n        \\item Mối liên hệ giữa li độ dài $s$ và li độ góc $\\alpha$ ($\\text{rad}$): $s = \\alpha \\cdot l$ (biên độ dài $A = s_0 = \\alpha_0 \\cdot l$).\n        \\item Tần số góc và chu kì dao động điều hoà:\n        \\[ \\omega = \\sqrt{\\frac{g}{l}} \\;;\\qquad T = 2\\pi\\sqrt{\\frac{l}{g}} \\]\n        \\item Thế năng và động năng của con lắc đơn tại li độ góc $\\alpha$:\n        \\[ W_t = mgl(1 - \\cos\\alpha) = 2mgl\\sin^2\\frac{\\alpha}{2} \\approx \\frac{1}{2} mgl \\alpha^2 = \\frac{1}{2} m \\frac{g}{l} s^2 \\]\n        \\[ W_{\\text{đ}} = W - W_t = mgl(\\cos\\alpha - \\cos\\alpha_0) \\approx \\frac{1}{2} mgl (\\alpha_0^2 - \\alpha^2) \\]"
              },
              {
                "id": "PHY11-015",
                "grade": 11,
                "chapterId": "grade11-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "DAO ĐỘNG",
                "sectionTitle": "2. Công thức mở rộng \\& Vận dụng",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Vị trí động năng bằng $n$ lần thế năng ($W_{\\text{đ}} = n W_t$)",
                "primaryMath": "W = W_{\\text{đ}} + W_t = (n + 1) W_t \\quad \\Rightarrow \\quad x = \\pm \\frac{A}{\\sqrt{n + 1}} \\quad \\text{và} \\quad \\alpha = \\pm \\frac{\\alpha_0}{\\sqrt{n + 1}}",
                "allMathBlocks": [
                  "W = W_{\\text{đ}} + W_t = (n + 1) W_t \\quad \\Rightarrow \\quad x = \\pm \\frac{A}{\\sqrt{n + 1}} \\quad \\text{và} \\quad \\alpha = \\pm \\frac{\\alpha_0}{\\sqrt{n + 1}}"
                ],
                "subCases": [],
                "notes": [
                  "Trường hợp đặc biệt khi $W_{\\text{đ}} = W_t$ ($n = 1$):"
                ],
                "variables": [],
                "conditions": [
                  "\\textit{Trường hợp đặc biệt khi $W_{\\text{đ}} = W_t$ ($n = 1$):} $x = \\pm \\frac{A}{\\sqrt{2}}$ và $\\alpha = \\pm \\frac{\\alpha_0}{\\sqrt{2}}$."
                ],
                "unit": "",
                "rawChunk": "}\n    \\[ W = W_{\\text{đ}} + W_t = (n + 1) W_t \\quad \\Rightarrow \\quad x = \\pm \\frac{A}{\\sqrt{n + 1}} \\quad \\text{và} \\quad \\alpha = \\pm \\frac{\\alpha_0}{\\sqrt{n + 1}} \\]\n    \\textit{Trường hợp đặc biệt khi $W_{\\text{đ}} = W_t$ ($n = 1$):} $x = \\pm \\frac{A}{\\sqrt{2}}$ và $\\alpha = \\pm \\frac{\\alpha_0}{\\sqrt{2}}$.\n\\end{itemize}\n\n\\vspace{8pt}\n\\textcolor{rulecolor}{\\rule{\\textwidth}{0.6pt}}\n\n\\section*{\\textcolor{primary}{CHƯƠNG II. SÓNG}}"
              }
            ]
          }
        ],
        "formulaCount": 15
      },
      {
        "chapterId": "grade11-ch2",
        "chapterNum": "CHƯƠNG II",
        "chapterName": "SÓNG",
        "fullTitle": "CHƯƠNG II. SÓNG",
        "subsections": [
          {
            "subId": "grade11-ch2-sub1",
            "title": "1. Công thức trọng tâm",
            "type": "Trọng tâm",
            "formulas": [
              {
                "id": "PHY11-016",
                "grade": 11,
                "chapterId": "grade11-ch2",
                "chapterNum": "CHƯƠNG II",
                "chapterName": "SÓNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Chu kì, tần số, tốc độ truyền sóng và bước sóng",
                "primaryMath": "f = \\frac{1}{T} \\;;\\qquad v = \\frac{s}{t} \\;;\\qquad \\lambda = v \\cdot T = \\frac{v}{f} \\quad \\Rightarrow \\quad v = \\lambda \\cdot f",
                "allMathBlocks": [
                  "f = \\frac{1}{T} \\;;\\qquad v = \\frac{s}{t} \\;;\\qquad \\lambda = v \\cdot T = \\frac{v}{f} \\quad \\Rightarrow \\quad v = \\lambda \\cdot f"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ f = \\frac{1}{T} \\;;\\qquad v = \\frac{s}{t} \\;;\\qquad \\lambda = v \\cdot T = \\frac{v}{f} \\quad \\Rightarrow \\quad v = \\lambda \\cdot f \\]"
              },
              {
                "id": "PHY11-017",
                "grade": 11,
                "chapterId": "grade11-ch2",
                "chapterNum": "CHƯƠNG II",
                "chapterName": "SÓNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Bước sóng của sóng điện từ truyền trong chân không ($c = 3 \\cdot 10^8\\text{ m/s}$)",
                "primaryMath": "\\lambda = c \\cdot T = \\frac{c}{f}",
                "allMathBlocks": [
                  "\\lambda = c \\cdot T = \\frac{c}{f}"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ \\lambda = c \\cdot T = \\frac{c}{f} \\]"
              },
              {
                "id": "PHY11-018",
                "grade": 11,
                "chapterId": "grade11-ch2",
                "chapterNum": "CHƯƠNG II",
                "chapterName": "SÓNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Giao thoa sóng ánh sáng (Thí nghiệm khe Young)",
                "primaryMath": "i = \\frac{\\lambda D}{a} \\quad \\Rightarrow \\quad \\lambda = \\frac{i \\cdot a}{D}",
                "allMathBlocks": [
                  "i = \\frac{\\lambda D}{a} \\quad \\Rightarrow \\quad \\lambda = \\frac{i \\cdot a}{D}"
                ],
                "subCases": [],
                "notes": [
                  "Trong đó:"
                ],
                "variables": [
                  "\\textit{Trong đó:} $a = F_1 F_2$ là khoảng cách giữa hai khe hẹp; $D = IO$ là khoảng cách từ hai khe đến màn quan sát; $i$ là khoảng vân (khoảng cách giữa hai vân sáng hoặc hai vân tối liên tiếp)."
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ i = \\frac{\\lambda D}{a} \\quad \\Rightarrow \\quad \\lambda = \\frac{i \\cdot a}{D} \\]\n    \\textit{Trong đó:} $a = F_1 F_2$ là khoảng cách giữa hai khe hẹp; $D = IO$ là khoảng cách từ hai khe đến màn quan sát; $i$ là khoảng vân (khoảng cách giữa hai vân sáng hoặc hai vân tối liên tiếp)."
              },
              {
                "id": "PHY11-019",
                "grade": 11,
                "chapterId": "grade11-ch2",
                "chapterNum": "CHƯƠNG II",
                "chapterName": "SÓNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Điều kiện có sóng dừng trên dây đàn hồi và trong cột không khí (Tổng quan)",
                "primaryMath": "L = n\\frac{\\lambda}{2} \\quad \\text{hoặc} \\quad L = (2n + 1)\\frac{\\lambda}{4}",
                "allMathBlocks": [],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\begin{itemize}"
              },
              {
                "id": "PHY11-020",
                "grade": 11,
                "chapterId": "grade11-ch2",
                "chapterNum": "CHƯƠNG II",
                "chapterName": "SÓNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Sợi dây có hai đầu cố định",
                "primaryMath": "L = n \\frac{\\lambda}{2} \\quad \\Rightarrow \\quad f = n \\frac{v}{2L} \\qquad (\\text{với } n = 1, 2, 3, \\dots \\text{ là số bụng sóng})",
                "allMathBlocks": [
                  "L = n \\frac{\\lambda}{2} \\quad \\Rightarrow \\quad f = n \\frac{v}{2L} \\qquad (\\text{với } n = 1, 2, 3, \\dots \\text{ là số bụng sóng})"
                ],
                "subCases": [],
                "notes": [
                  "(Đối với nhạc cụ dây khi phát âm cơ bản ứng với $n = 1$: $\\lambda = 2L$ và $f = \\frac{v}{2L}$)."
                ],
                "variables": [
                  "\\[ L = n \\frac{\\lambda}{2} \\quad \\Rightarrow \\quad f = n \\frac{v}{2L} \\qquad (\\text{với } n = 1, 2, 3, \\dots \\text{ là số bụng sóng}) \\]",
                  "\\textit{(Đối với nhạc cụ dây khi phát âm cơ bản ứng với $n = 1$: $\\lambda = 2L$ và $f = \\frac{v}{2L}$).}"
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "} Chiều dài dây $L$ bằng một số nguyên lần nửa bước sóng:\n        \\[ L = n \\frac{\\lambda}{2} \\quad \\Rightarrow \\quad f = n \\frac{v}{2L} \\qquad (\\text{với } n = 1, 2, 3, \\dots \\text{ là số bụng sóng}) \\]\n        \\textit{(Đối với nhạc cụ dây khi phát âm cơ bản ứng với $n = 1$: $\\lambda = 2L$ và $f = \\frac{v}{2L}$).}"
              },
              {
                "id": "PHY11-021",
                "grade": 11,
                "chapterId": "grade11-ch2",
                "chapterNum": "CHƯƠNG II",
                "chapterName": "SÓNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Sợi dây một đầu cố định, một đầu tự do (hoặc ống khí một đầu kín, một đầu hở)",
                "primaryMath": "L = (2n + 1)\\frac{\\lambda}{4} \\quad \\Rightarrow \\quad f = (2n + 1)\\frac{v}{4L} \\qquad (\\text{với } n = 0, 1, 2, 3, \\dots)",
                "allMathBlocks": [
                  "L = (2n + 1)\\frac{\\lambda}{4} \\quad \\Rightarrow \\quad f = (2n + 1)\\frac{v}{4L} \\qquad (\\text{với } n = 0, 1, 2, 3, \\dots)"
                ],
                "subCases": [],
                "notes": [],
                "variables": [
                  "\\[ L = (2n + 1)\\frac{\\lambda}{4} \\quad \\Rightarrow \\quad f = (2n + 1)\\frac{v}{4L} \\qquad (\\text{với } n = 0, 1, 2, 3, \\dots) \\]"
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "} Chiều dài $L$ bằng một số lẻ lần một phần tư bước sóng:\n        \\[ L = (2n + 1)\\frac{\\lambda}{4} \\quad \\Rightarrow \\quad f = (2n + 1)\\frac{v}{4L} \\qquad (\\text{với } n = 0, 1, 2, 3, \\dots) \\]\n    \\end{itemize}\n\\end{itemize}\n\n\\subsection*{\\textcolor{secondary}{2. Công thức mở rộng \\& Vận dụng}}"
              }
            ]
          },
          {
            "subId": "grade11-ch2-sub2",
            "title": "2. Công thức mở rộng \\& Vận dụng",
            "type": "Mở rộng & Vận dụng",
            "formulas": [
              {
                "id": "PHY11-022",
                "grade": 11,
                "chapterId": "grade11-ch2",
                "chapterNum": "CHƯƠNG II",
                "chapterName": "SÓNG",
                "sectionTitle": "2. Công thức mở rộng \\& Vận dụng",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Cường độ sóng $I$",
                "primaryMath": "\\text{W/m}^2",
                "allMathBlocks": [],
                "subCases": [],
                "notes": [],
                "variables": [
                  "} Là năng lượng sóng truyền qua một đơn vị diện tích vuông góc với phương truyền sóng trong một đơn vị thời gian (Đơn vị: $\\text{W/m}^2$)."
                ],
                "conditions": [],
                "unit": "W/m^2",
                "rawChunk": "} Là năng lượng sóng truyền qua một đơn vị diện tích vuông góc với phương truyền sóng trong một đơn vị thời gian (Đơn vị: $\\text{W/m}^2$)."
              },
              {
                "id": "PHY11-023",
                "grade": 11,
                "chapterId": "grade11-ch2",
                "chapterNum": "CHƯƠNG II",
                "chapterName": "SÓNG",
                "sectionTitle": "2. Công thức mở rộng \\& Vận dụng",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Độ lệch pha theo khoảng cách trên phương truyền sóng và giao thoa sóng cơ",
                "primaryMath": "d = k\\lambda",
                "allMathBlocks": [],
                "subCases": [
                  {
                    "label": "Những điểm cách nguồn một khoảng $d = k",
                    "math": ""
                  },
                  {
                    "label": "Khoảng cách giữa hai gợn sóng tròn liên tiếp: $",
                    "math": ""
                  },
                  {
                    "label": "Khoảng cách giữa hai cực đại giao thoa liên tiếp trên đoạn thẳng nối hai nguồn $S_1 S_2$ (hoặc giữa hai nút sóng / hai bụng sóng liên tiếp trong sóng dừng): $",
                    "math": ""
                  },
                  {
                    "label": "Khoảng cách giữa một nút sóng và một bụng sóng liền kề trong sóng dừng: $",
                    "math": ""
                  }
                ],
                "notes": [],
                "variables": [
                  "\\item Những điểm cách nguồn một khoảng $d = k\\lambda$ dao động đồng pha với nguồn; những điểm cách nguồn $d = \\left(k + \\frac{1}{2}\\right)\\lambda$ dao động ngược pha với nguồn."
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\begin{itemize}\n        \\item Những điểm cách nguồn một khoảng $d = k\\lambda$ dao động đồng pha với nguồn; những điểm cách nguồn $d = \\left(k + \\frac{1}{2}\\right)\\lambda$ dao động ngược pha với nguồn.\n        \\item Khoảng cách giữa hai gợn sóng tròn liên tiếp: $\\lambda = R_{n+1} - R_n$.\n        \\item Khoảng cách giữa hai cực đại giao thoa liên tiếp trên đoạn thẳng nối hai nguồn $S_1 S_2$ (hoặc giữa hai nút sóng / hai bụng sóng liên tiếp trong sóng dừng): $\\Delta d = \\frac{\\lambda}{2}$.\n        \\item Khoảng cách giữa một nút sóng và một bụng sóng liền kề trong sóng dừng: $\\Delta d = \\frac{\\lambda}{4}$."
              },
              {
                "id": "PHY11-024",
                "grade": 11,
                "chapterId": "grade11-ch2",
                "chapterNum": "CHƯƠNG II",
                "chapterName": "SÓNG",
                "sectionTitle": "2. Công thức mở rộng \\& Vận dụng",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Giao thoa đồng thời hai bức xạ đơn sắc $\\lambda_1$ và $\\lambda_2$ (Bài 14)",
                "primaryMath": "x = k_1 i_1 = k_2 i_2 \\quad \\Leftrightarrow \\quad k_1 \\lambda_1 = k_2 \\lambda_2 \\qquad (\\text{với } k_1, k_2 \\in \\mathbb{Z})",
                "allMathBlocks": [
                  "x = k_1 i_1 = k_2 i_2 \\quad \\Leftrightarrow \\quad k_1 \\lambda_1 = k_2 \\lambda_2 \\qquad (\\text{với } k_1, k_2 \\in \\mathbb{Z})"
                ],
                "subCases": [],
                "notes": [],
                "variables": [
                  "Vị trí vân sáng trùng màu với vân sáng trung tâm thoả mãn:",
                  "\\[ x = k_1 i_1 = k_2 i_2 \\quad \\Leftrightarrow \\quad k_1 \\lambda_1 = k_2 \\lambda_2 \\qquad (\\text{với } k_1, k_2 \\in \\mathbb{Z}) \\]"
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    Vị trí vân sáng trùng màu với vân sáng trung tâm thoả mãn:\n    \\[ x = k_1 i_1 = k_2 i_2 \\quad \\Leftrightarrow \\quad k_1 \\lambda_1 = k_2 \\lambda_2 \\qquad (\\text{với } k_1, k_2 \\in \\mathbb{Z}) \\]"
              },
              {
                "id": "PHY11-025",
                "grade": 11,
                "chapterId": "grade11-ch2",
                "chapterNum": "CHƯƠNG II",
                "chapterName": "SÓNG",
                "sectionTitle": "2. Công thức mở rộng \\& Vận dụng",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Thực hành đo tốc độ truyền âm bằng cộng hưởng sóng dừng trong ống khí (Bài 15)",
                "primaryMath": "d = l_2 - l_1 = \\frac{\\lambda}{2} \\quad \\Rightarrow \\quad \\lambda = 2d = 2(l_2 - l_1) \\quad \\Rightarrow \\quad v = \\lambda f = 2df",
                "allMathBlocks": [
                  "d = l_2 - l_1 = \\frac{\\lambda}{2} \\quad \\Rightarrow \\quad \\lambda = 2d = 2(l_2 - l_1) \\quad \\Rightarrow \\quad v = \\lambda f = 2df"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    Khoảng cách giữa hai vị trí liên tiếp của pít-tông mà âm nghe được to nhất:\n    \\[ d = l_2 - l_1 = \\frac{\\lambda}{2} \\quad \\Rightarrow \\quad \\lambda = 2d = 2(l_2 - l_1) \\quad \\Rightarrow \\quad v = \\lambda f = 2df \\]\n    Sai số tỉ đối của phép đo tốc độ truyền âm: $\\delta v = \\delta d + \\delta f$.\n\\end{itemize}\n\n\\vspace{8pt}\n\\textcolor{rulecolor}{\\rule{\\textwidth}{0.6pt}}\n\n\\section*{\\textcolor{primary}{CHƯƠNG III. ĐIỆN TRƯỜNG}}"
              }
            ]
          }
        ],
        "formulaCount": 10
      },
      {
        "chapterId": "grade11-ch3",
        "chapterNum": "CHƯƠNG III",
        "chapterName": "ĐIỆN TRƯỜNG",
        "fullTitle": "CHƯƠNG III. ĐIỆN TRƯỜNG",
        "subsections": [
          {
            "subId": "grade11-ch3-sub1",
            "title": "1. Công thức trọng tâm",
            "type": "Trọng tâm",
            "formulas": [
              {
                "id": "PHY11-026",
                "grade": 11,
                "chapterId": "grade11-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "ĐIỆN TRƯỜNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Định luật Coulomb về lực tương tác giữa hai điện tích điểm trong chân không (hoặc không khí)",
                "primaryMath": "F = \\frac{|q_1 q_2|}{4\\pi \\varepsilon_0 r^2} = \\frac{k |q_1 q_2|}{r^2}",
                "allMathBlocks": [
                  "F = \\frac{|q_1 q_2|}{4\\pi \\varepsilon_0 r^2} = \\frac{k |q_1 q_2|}{r^2}"
                ],
                "subCases": [],
                "notes": [
                  "Trong đó:"
                ],
                "variables": [
                  "\\textit{Trong đó:} $r$ là khoảng cách giữa hai điện tích điểm ($\\text{m}$); hằng số điện $\\varepsilon_0 = 8,85 \\cdot 10^{-12}\\text{ C}^2/(\\text{N.m}^2)$; hệ số tỉ lệ $k = \\frac{1}{4\\pi \\varepsilon_0} = 9 \\cdot 10^9\\text{ N.m}^2/\\text{C}^2$."
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ F = \\frac{|q_1 q_2|}{4\\pi \\varepsilon_0 r^2} = \\frac{k |q_1 q_2|}{r^2} \\]\n    \\textit{Trong đó:} $r$ là khoảng cách giữa hai điện tích điểm ($\\text{m}$); hằng số điện $\\varepsilon_0 = 8,85 \\cdot 10^{-12}\\text{ C}^2/(\\text{N.m}^2)$; hệ số tỉ lệ $k = \\frac{1}{4\\pi \\varepsilon_0} = 9 \\cdot 10^9\\text{ N.m}^2/\\text{C}^2$."
              },
              {
                "id": "PHY11-027",
                "grade": 11,
                "chapterId": "grade11-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "ĐIỆN TRƯỜNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Cường độ điện trường tại một điểm",
                "primaryMath": "\\vec{E} = \\frac{\\vec{F}}{q} \\quad \\Rightarrow \\quad \\vec{F} = q \\vec{E} \\;;\\qquad \\text{Độ lớn: } E = \\frac{F}{|q|} \\quad (\\text{Đơn vị: V/m})",
                "allMathBlocks": [
                  "\\vec{E} = \\frac{\\vec{F}}{q} \\quad \\Rightarrow \\quad \\vec{F} = q \\vec{E} \\;;\\qquad \\text{Độ lớn: } E = \\frac{F}{|q|} \\quad (\\text{Đơn vị: V/m})"
                ],
                "subCases": [],
                "notes": [
                  "(Nếu $q > 0$ thì $\\vec{F}$ cùng chiều $\\vec{E}$; nếu $q < 0$ thì $\\vec{F}$ ngược chiều $\\vec{E}$)."
                ],
                "variables": [],
                "conditions": [
                  "\\textit{(Nếu $q > 0$ thì $\\vec{F}$ cùng chiều $\\vec{E}$; nếu $q < 0$ thì $\\vec{F}$ ngược chiều $\\vec{E}$).}"
                ],
                "unit": "V/m",
                "rawChunk": "}\n    \\[ \\vec{E} = \\frac{\\vec{F}}{q} \\quad \\Rightarrow \\quad \\vec{F} = q \\vec{E} \\;;\\qquad \\text{Độ lớn: } E = \\frac{F}{|q|} \\quad (\\text{Đơn vị: V/m}) \\]\n    \\textit{(Nếu $q > 0$ thì $\\vec{F}$ cùng chiều $\\vec{E}$; nếu $q < 0$ thì $\\vec{F}$ ngược chiều $\\vec{E}$).}"
              },
              {
                "id": "PHY11-028",
                "grade": 11,
                "chapterId": "grade11-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "ĐIỆN TRƯỜNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Cường độ điện trường do một điện tích điểm $Q$ gây ra tại điểm cách nó khoảng $r$",
                "primaryMath": "E = \\frac{|Q|}{4\\pi \\varepsilon_0 r^2} = \\frac{k |Q|}{r^2}",
                "allMathBlocks": [
                  "E = \\frac{|Q|}{4\\pi \\varepsilon_0 r^2} = \\frac{k |Q|}{r^2}"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ E = \\frac{|Q|}{4\\pi \\varepsilon_0 r^2} = \\frac{k |Q|}{r^2} \\]"
              },
              {
                "id": "PHY11-029",
                "grade": 11,
                "chapterId": "grade11-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "ĐIỆN TRƯỜNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Nguyên lí chồng chất điện trường (Cường độ điện trường của hệ điện tích điểm)",
                "primaryMath": "\\vec{E} = \\vec{E}_1 + \\vec{E}_2 + \\vec{E}_3 + \\dots",
                "allMathBlocks": [
                  "\\vec{E} = \\vec{E}_1 + \\vec{E}_2 + \\vec{E}_3 + \\dots"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ \\vec{E} = \\vec{E}_1 + \\vec{E}_2 + \\vec{E}_3 + \\dots \\]"
              },
              {
                "id": "PHY11-030",
                "grade": 11,
                "chapterId": "grade11-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "ĐIỆN TRƯỜNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Cường độ điện trường đều giữa hai bản phẳng song song nhiễm điện trái dấu",
                "primaryMath": "E = \\frac{U}{d}",
                "allMathBlocks": [
                  "E = \\frac{U}{d}"
                ],
                "subCases": [],
                "notes": [
                  "(Với $U$ là hiệu điện thế giữa hai bản phẳng ($\\text{V}$), $d$ là khoảng cách giữa hai bản phẳng ($\\text{m}$))."
                ],
                "variables": [
                  "\\textit{(Với $U$ là hiệu điện thế giữa hai bản phẳng ($\\text{V}$), $d$ là khoảng cách giữa hai bản phẳng ($\\text{m}$)).}"
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ E = \\frac{U}{d} \\]\n    \\textit{(Với $U$ là hiệu điện thế giữa hai bản phẳng ($\\text{V}$), $d$ là khoảng cách giữa hai bản phẳng ($\\text{m}$)).}"
              },
              {
                "id": "PHY11-031",
                "grade": 11,
                "chapterId": "grade11-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "ĐIỆN TRƯỜNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Công của lực điện và Thế năng điện",
                "primaryMath": "A_{MN} = q E d \\qquad (\\text{với } d = \\overline{MM'} \\text{ là độ dài đại số hình chiếu của } MN \\text{ lên đường sức điện})",
                "allMathBlocks": [
                  "A_{MN} = q E d \\qquad (\\text{với } d = \\overline{MM'} \\text{ là độ dài đại số hình chiếu của } MN \\text{ lên đường sức điện})",
                  "W_M = A_{M\\infty} = V_M \\cdot q"
                ],
                "subCases": [
                  {
                    "label": "Công của lực điện làm dịch chuyển điện tích $q$ từ $M$ đến $N$ trong điện trường đều:",
                    "math": "A_{MN} = q E d \\qquad (\\text{với } d = \\overline{MM'} \\text{ là độ dài đại số hình chiếu của } MN \\text{ lên đường sức điện})"
                  },
                  {
                    "label": "Thế năng của điện tích $q$ tại điểm $M$ trong điện trường đều (chọn bản âm làm mốc): $W_M = q E d$.",
                    "math": ""
                  },
                  {
                    "label": "Thế năng của điện tích $q$ tại điểm $M$ trong điện trường bất kì (chọn mốc ở vô cực):",
                    "math": "W_M = A_{M\\infty} = V_M \\cdot q"
                  },
                  {
                    "label": "Liên hệ giữa công của lực điện và độ giảm thế năng điện: $A_{MN} = W_M - W_N$.",
                    "math": ""
                  }
                ],
                "notes": [],
                "variables": [
                  "\\[ A_{MN} = q E d \\qquad (\\text{với } d = \\overline{MM'} \\text{ là độ dài đại số hình chiếu của } MN \\text{ lên đường sức điện}) \\]"
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\begin{itemize}\n        \\item Công của lực điện làm dịch chuyển điện tích $q$ từ $M$ đến $N$ trong điện trường đều:\n        \\[ A_{MN} = q E d \\qquad (\\text{với } d = \\overline{MM'} \\text{ là độ dài đại số hình chiếu của } MN \\text{ lên đường sức điện}) \\]\n        \\item Thế năng của điện tích $q$ tại điểm $M$ trong điện trường đều (chọn bản âm làm mốc): $W_M = q E d$.\n        \\item Thế năng của điện tích $q$ tại điểm $M$ trong điện trường bất kì (chọn mốc ở vô cực):\n        \\[ W_M = A_{M\\infty} = V_M \\cdot q \\]\n        \\item Liên hệ giữa công của lực điện và độ giảm thế năng điện: $A_{MN} = W_M - W_N$."
              },
              {
                "id": "PHY11-032",
                "grade": 11,
                "chapterId": "grade11-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "ĐIỆN TRƯỜNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Điện thế và Hiệu điện thế",
                "primaryMath": "U_{MN} = V_M - V_N = \\frac{A_{MN}}{q} \\quad \\Rightarrow \\quad A_{MN} = q (V_M - V_N) = q U_{MN}",
                "allMathBlocks": [
                  "U_{MN} = V_M - V_N = \\frac{A_{MN}}{q} \\quad \\Rightarrow \\quad A_{MN} = q (V_M - V_N) = q U_{MN}",
                  "E_M = E_N = E = \\frac{U}{d} = \\frac{V_M - V_N}{\\overline{MN}}"
                ],
                "subCases": [
                  {
                    "label": "Điện thế tại một điểm trong điện trường: $V_M =",
                    "math": ""
                  },
                  {
                    "label": "Hiệu điện thế giữa hai điểm $M, N$ và công của lực điện:",
                    "math": "U_{MN} = V_M - V_N = \\frac{A_{MN}}{q} \\quad \\Rightarrow \\quad A_{MN} = q (V_M - V_N) = q U_{MN}"
                  },
                  {
                    "label": "Liên hệ giữa cường độ điện trường và điện thế dọc theo đường sức:",
                    "math": "E_M = E_N = E = \\frac{U}{d} = \\frac{V_M - V_N}{\\overline{MN}}"
                  }
                ],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "Vôn (V",
                "rawChunk": "}\n    \\begin{itemize}\n        \\item Điện thế tại một điểm trong điện trường: $V_M = \\frac{A_{M\\infty}}{q} = \\frac{W_M}{q}$ (Đơn vị: Vôn ($\\text{V}$)).\n        \\item Hiệu điện thế giữa hai điểm $M, N$ và công của lực điện:\n        \\[ U_{MN} = V_M - V_N = \\frac{A_{MN}}{q} \\quad \\Rightarrow \\quad A_{MN} = q (V_M - V_N) = q U_{MN} \\]\n        \\item Liên hệ giữa cường độ điện trường và điện thế dọc theo đường sức:\n        \\[ E_M = E_N = E = \\frac{U}{d} = \\frac{V_M - V_N}{\\overline{MN}} \\]"
              },
              {
                "id": "PHY11-033",
                "grade": 11,
                "chapterId": "grade11-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "ĐIỆN TRƯỜNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Tụ điện và Điện dung của tụ điện",
                "primaryMath": "C = \\frac{Q}{U} \\quad \\Rightarrow \\quad Q = C \\cdot U \\qquad (\\text{Đơn vị: Fara (F); } 1\\,\\mu\\text{F} = 10^{-6}\\text{ F}, \\; 1\\text{ nF} = 10^{-9}\\text{ F}, \\; 1\\text{ pF} = 10^{-12}\\text{ F})",
                "allMathBlocks": [
                  "C = \\frac{Q}{U} \\quad \\Rightarrow \\quad Q = C \\cdot U \\qquad (\\text{Đơn vị: Fara (F); } 1\\,\\mu\\text{F} = 10^{-6}\\text{ F}, \\; 1\\text{ nF} = 10^{-9}\\text{ F}, \\; 1\\text{ pF} = 10^{-12}\\text{ F})"
                ],
                "subCases": [
                  {
                    "label": "Điện dung của tụ điện:",
                    "math": "C = \\frac{Q}{U} \\quad \\Rightarrow \\quad Q = C \\cdot U \\qquad (\\text{Đơn vị: Fara (F); } 1\\,\\mu\\text{F} = 10^{-6}\\text{ F}, \\; 1\\text{ nF} = 10^{-9}\\text{ F}, \\; 1\\text{ pF} = 10^{-12}\\text{ F})"
                  }
                ],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "Fara (F",
                "rawChunk": "}\n    \\begin{itemize}\n        \\item Điện dung của tụ điện:\n        \\[ C = \\frac{Q}{U} \\quad \\Rightarrow \\quad Q = C \\cdot U \\qquad (\\text{Đơn vị: Fara (F); } 1\\,\\mu\\text{F} = 10^{-6}\\text{ F}, \\; 1\\text{ nF} = 10^{-9}\\text{ F}, \\; 1\\text{ pF} = 10^{-12}\\text{ F}) \\]"
              },
              {
                "id": "PHY11-034",
                "grade": 11,
                "chapterId": "grade11-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "ĐIỆN TRƯỜNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Ghép nối tiếp $n$ tụ điện",
                "primaryMath": "U = U_1 + U_2 + \\dots + U_n \\;;\\qquad Q = Q_1 = Q_2 = \\dots = Q_n \\;;\\qquad \\frac{1}{C_{nt}} = \\frac{1}{C_1} + \\frac{1}{C_2} + \\dots + \\frac{1}{C_n}",
                "allMathBlocks": [
                  "U = U_1 + U_2 + \\dots + U_n \\;;\\qquad Q = Q_1 = Q_2 = \\dots = Q_n \\;;\\qquad \\frac{1}{C_{nt}} = \\frac{1}{C_1} + \\frac{1}{C_2} + \\dots + \\frac{1}{C_n}"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n        \\[ U = U_1 + U_2 + \\dots + U_n \\;;\\qquad Q = Q_1 = Q_2 = \\dots = Q_n \\;;\\qquad \\frac{1}{C_{nt}} = \\frac{1}{C_1} + \\frac{1}{C_2} + \\dots + \\frac{1}{C_n} \\]"
              },
              {
                "id": "PHY11-035",
                "grade": 11,
                "chapterId": "grade11-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "ĐIỆN TRƯỜNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Ghép song song $n$ tụ điện",
                "primaryMath": "U = U_1 = U_2 = \\dots = U_n \\;;\\qquad Q = Q_1 + Q_2 + \\dots + Q_n \\;;\\qquad C_{ss} = C_1 + C_2 + \\dots + C_n",
                "allMathBlocks": [
                  "U = U_1 = U_2 = \\dots = U_n \\;;\\qquad Q = Q_1 + Q_2 + \\dots + Q_n \\;;\\qquad C_{ss} = C_1 + C_2 + \\dots + C_n"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n        \\[ U = U_1 = U_2 = \\dots = U_n \\;;\\qquad Q = Q_1 + Q_2 + \\dots + Q_n \\;;\\qquad C_{ss} = C_1 + C_2 + \\dots + C_n \\]"
              },
              {
                "id": "PHY11-036",
                "grade": 11,
                "chapterId": "grade11-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "ĐIỆN TRƯỜNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Năng lượng của tụ điện (Năng lượng điện trường trong tụ điện)",
                "primaryMath": "W = \\frac{Q \\cdot U}{2} = \\frac{Q^2}{2C} = \\frac{C \\cdot U^2}{2} \\qquad (\\text{Đơn vị: Jun (J)})",
                "allMathBlocks": [
                  "W = \\frac{Q \\cdot U}{2} = \\frac{Q^2}{2C} = \\frac{C \\cdot U^2}{2} \\qquad (\\text{Đơn vị: Jun (J)})"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "Jun (J",
                "rawChunk": "}\n        \\[ W = \\frac{Q \\cdot U}{2} = \\frac{Q^2}{2C} = \\frac{C \\cdot U^2}{2} \\qquad (\\text{Đơn vị: Jun (J)}) \\]\n    \\end{itemize}\n\\end{itemize}\n\n\\subsection*{\\textcolor{secondary}{2. Công thức mở rộng \\& Vận dụng}}"
              }
            ]
          },
          {
            "subId": "grade11-ch3-sub2",
            "title": "2. Công thức mở rộng \\& Vận dụng",
            "type": "Mở rộng & Vận dụng",
            "formulas": [
              {
                "id": "PHY11-037",
                "grade": 11,
                "chapterId": "grade11-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "ĐIỆN TRƯỜNG",
                "sectionTitle": "2. Công thức mở rộng \\& Vận dụng",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Chuyển động của hạt mang điện $q$, khối lượng $m$ bay vào điện trường đều $\\vec{E}$ với vận tốc $\\vec{v}_0 \\perp \\vec{E}$ (Bài 18)",
                "primaryMath": "a_y = \\frac{F_y}{m} = \\frac{|q|E}{m} = \\frac{|q|U}{md} \\;;\\qquad y = \\frac{1}{2} a_y t^2 = \\frac{1}{2} \\frac{|q|U}{md} t^2",
                "allMathBlocks": [
                  "a_y = \\frac{F_y}{m} = \\frac{|q|E}{m} = \\frac{|q|U}{md} \\;;\\qquad y = \\frac{1}{2} a_y t^2 = \\frac{1}{2} \\frac{|q|U}{md} t^2",
                  "y = \\frac{1}{2} \\frac{|q|E}{m v_0^2} x^2 = \\frac{1}{2} \\frac{|q|U}{m d v_0^2} x^2"
                ],
                "subCases": [
                  {
                    "label": "Phương trình chuyển động theo trục $Ox$ (cùng hướng $",
                    "math": ""
                  },
                  {
                    "label": "Gia tốc và phương trình chuyển động theo trục $Oy$ (dọc theo phương đường sức):",
                    "math": "a_y = \\frac{F_y}{m} = \\frac{|q|E}{m} = \\frac{|q|U}{md} \\;;\\qquad y = \\frac{1}{2} a_y t^2 = \\frac{1}{2} \\frac{|q|U}{md} t^2"
                  },
                  {
                    "label": "Phương trình quỹ đạo dạng parabol:",
                    "math": "y = \\frac{1}{2} \\frac{|q|E}{m v_0^2} x^2 = \\frac{1}{2} \\frac{|q|U}{m d v_0^2} x^2"
                  }
                ],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\begin{itemize}\n        \\item Phương trình chuyển động theo trục $Ox$ (cùng hướng $\\vec{v}_0$): $x = v_0 \\cdot t$.\n        \\item Gia tốc và phương trình chuyển động theo trục $Oy$ (dọc theo phương đường sức):\n        \\[ a_y = \\frac{F_y}{m} = \\frac{|q|E}{m} = \\frac{|q|U}{md} \\;;\\qquad y = \\frac{1}{2} a_y t^2 = \\frac{1}{2} \\frac{|q|U}{md} t^2 \\]\n        \\item Phương trình quỹ đạo dạng parabol:\n        \\[ y = \\frac{1}{2} \\frac{|q|E}{m v_0^2} x^2 = \\frac{1}{2} \\frac{|q|U}{m d v_0^2} x^2 \\]\n    \\end{itemize}\n\\end{itemize}\n\n\\vspace{8pt}\n\\textcolor{rulecolor}{\\rule{\\textwidth}{0.6pt}}\n\n\\section*{\\textcolor{primary}{CHƯƠNG IV. DÒNG ĐIỆN. MẠCH ĐIỆN (BÀI 22 – BÀI 23)}}"
              }
            ]
          }
        ],
        "formulaCount": 12
      },
      {
        "chapterId": "grade11-ch4",
        "chapterNum": "CHƯƠNG IV",
        "chapterName": "DÒNG ĐIỆN. MẠCH ĐIỆN (BÀI 22 – BÀI 23)",
        "fullTitle": "CHƯƠNG IV. DÒNG ĐIỆN. MẠCH ĐIỆN (BÀI 22 – BÀI 23)",
        "subsections": [
          {
            "subId": "grade11-ch4-sub1",
            "title": "1. Cường độ dòng điện",
            "type": "Chuyên đề",
            "formulas": [
              {
                "id": "PHY11-038",
                "grade": 11,
                "chapterId": "grade11-ch4",
                "chapterNum": "CHƯƠNG IV",
                "chapterName": "DÒNG ĐIỆN. MẠCH ĐIỆN (BÀI 22 – BÀI 23)",
                "sectionTitle": "1. Cường độ dòng điện",
                "sectionType": "Chuyên đề",
                "title": "Công thức định nghĩa cường độ dòng điện",
                "primaryMath": "I = \\frac{\\Delta q}{\\Delta t} \\quad \\Rightarrow \\quad \\Delta q = I \\cdot \\Delta t \\qquad (\\text{Đơn vị: } I \\text{ (A)}, \\; \\Delta q \\text{ (C)}, \\; \\Delta t \\text{ (s)}; \\quad 1\\text{ C} = 1\\text{ A.s})",
                "allMathBlocks": [
                  "I = \\frac{\\Delta q}{\\Delta t} \\quad \\Rightarrow \\quad \\Delta q = I \\cdot \\Delta t \\qquad (\\text{Đơn vị: } I \\text{ (A)}, \\; \\Delta q \\text{ (C)}, \\; \\Delta t \\text{ (s)}; \\quad 1\\text{ C} = 1\\text{ A.s})"
                ],
                "subCases": [],
                "notes": [
                  "Mở rộng:"
                ],
                "variables": [],
                "conditions": [],
                "unit": "I  (A",
                "rawChunk": "}\n    \\[ I = \\frac{\\Delta q}{\\Delta t} \\quad \\Rightarrow \\quad \\Delta q = I \\cdot \\Delta t \\qquad (\\text{Đơn vị: } I \\text{ (A)}, \\; \\Delta q \\text{ (C)}, \\; \\Delta t \\text{ (s)}; \\quad 1\\text{ C} = 1\\text{ A.s}) \\]\n    \\textit{Mở rộng:} Đơn vị $\\text{mAh}$ (miliampe giờ) ghi trên pin, ắc quy là đơn vị đo điện lượng dự trữ: $1\\text{ mAh} = 10^{-3}\\text{ A} \\cdot 3\\,600\\text{ s} = 3,6\\text{ C}$."
              },
              {
                "id": "PHY11-039",
                "grade": 11,
                "chapterId": "grade11-ch4",
                "chapterNum": "CHƯƠNG IV",
                "chapterName": "DÒNG ĐIỆN. MẠCH ĐIỆN (BÀI 22 – BÀI 23)",
                "sectionTitle": "1. Cường độ dòng điện",
                "sectionType": "Chuyên đề",
                "title": "Liên hệ giữa cường độ dòng điện với mật độ và tốc độ dịch chuyển có hướng của hạt mang điện",
                "primaryMath": "I = S \\cdot n \\cdot v \\cdot e",
                "allMathBlocks": [
                  "I = S \\cdot n \\cdot v \\cdot e"
                ],
                "subCases": [],
                "notes": [
                  "Trong đó:"
                ],
                "variables": [
                  "\\textit{Trong đó:} $S$ là diện tích tiết diện thẳng của dây dẫn ($\\text{m}^2$, với dây tiết diện tròn đường kính $d$ thì $S = \\frac{\\pi d^2}{4}$); $n$ là mật độ hạt mang điện ($\\text{hạt/m}^3$); $v$ là tốc độ dịch chuyển có hướng của electron ($\\text{m/s}$); $e = 1,6 \\cdot 10^{-19}\\text{ C}$ là độ lớn điện tích nguyên tố."
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ I = S \\cdot n \\cdot v \\cdot e \\]\n    \\textit{Trong đó:} $S$ là diện tích tiết diện thẳng của dây dẫn ($\\text{m}^2$, với dây tiết diện tròn đường kính $d$ thì $S = \\frac{\\pi d^2}{4}$); $n$ là mật độ hạt mang điện ($\\text{hạt/m}^3$); $v$ là tốc độ dịch chuyển có hướng của electron ($\\text{m/s}$); $e = 1,6 \\cdot 10^{-19}\\text{ C}$ là độ lớn điện tích nguyên tố.\n\\end{itemize}\n\n\\subsection*{\\textcolor{secondary}{2. Điện trở và Định luật Ohm}}"
              }
            ]
          },
          {
            "subId": "grade11-ch4-sub2",
            "title": "2. Điện trở và Định luật Ohm",
            "type": "Chuyên đề",
            "formulas": [
              {
                "id": "PHY11-040",
                "grade": 11,
                "chapterId": "grade11-ch4",
                "chapterNum": "CHƯƠNG IV",
                "chapterName": "DÒNG ĐIỆN. MẠCH ĐIỆN (BÀI 22 – BÀI 23)",
                "sectionTitle": "2. Điện trở và Định luật Ohm",
                "sectionType": "Chuyên đề",
                "title": "Định nghĩa điện trở và Định luật Ohm đối với vật dẫn kim loại",
                "primaryMath": "R = \\frac{U}{I} \\quad \\Rightarrow \\quad I = \\frac{U}{R} \\qquad \\left(1\\,\\Omega = \\frac{1\\text{ V}}{1\\text{ A}} \\;;\\quad 1\\text{ k}\\Omega = 10^3\\,\\Omega \\;;\\quad 1\\text{ M}\\Omega = 10^6\\,\\Omega\\right)",
                "allMathBlocks": [
                  "R = \\frac{U}{I} \\quad \\Rightarrow \\quad I = \\frac{U}{R} \\qquad \\left(1\\,\\Omega = \\frac{1\\text{ V}}{1\\text{ A}} \\;;\\quad 1\\text{ k}\\Omega = 10^3\\,\\Omega \\;;\\quad 1\\text{ M}\\Omega = 10^6\\,\\Omega\\right)"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ R = \\frac{U}{I} \\quad \\Rightarrow \\quad I = \\frac{U}{R} \\qquad \\left(1\\,\\Omega = \\frac{1\\text{ V}}{1\\text{ A}} \\;;\\quad 1\\text{ k}\\Omega = 10^3\\,\\Omega \\;;\\quad 1\\text{ M}\\Omega = 10^6\\,\\Omega\\right) \\]"
              },
              {
                "id": "PHY11-041",
                "grade": 11,
                "chapterId": "grade11-ch4",
                "chapterNum": "CHƯƠNG IV",
                "chapterName": "DÒNG ĐIỆN. MẠCH ĐIỆN (BÀI 22 – BÀI 23)",
                "sectionTitle": "2. Điện trở và Định luật Ohm",
                "sectionType": "Chuyên đề",
                "title": "Đường đặc trưng Vôn – Ampe của điện trở và Độ dẫn điện",
                "primaryMath": "I = k \\cdot U \\qquad \\text{với độ dẫn điện (hệ số góc/độ dốc): } k = \\frac{1}{R} = \\tan\\alpha",
                "allMathBlocks": [
                  "I = k \\cdot U \\qquad \\text{với độ dẫn điện (hệ số góc/độ dốc): } k = \\frac{1}{R} = \\tan\\alpha"
                ],
                "subCases": [],
                "notes": [],
                "variables": [
                  "\\[ I = k \\cdot U \\qquad \\text{với độ dẫn điện (hệ số góc/độ dốc): } k = \\frac{1}{R} = \\tan\\alpha \\]"
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ I = k \\cdot U \\qquad \\text{với độ dẫn điện (hệ số góc/độ dốc): } k = \\frac{1}{R} = \\tan\\alpha \\]"
              },
              {
                "id": "PHY11-042",
                "grade": 11,
                "chapterId": "grade11-ch4",
                "chapterNum": "CHƯƠNG IV",
                "chapterName": "DÒNG ĐIỆN. MẠCH ĐIỆN (BÀI 22 – BÀI 23)",
                "sectionTitle": "2. Điện trở và Định luật Ohm",
                "sectionType": "Chuyên đề",
                "title": "Công thức mở rộng (Phụ thuộc của điện trở vào kích thước, vật liệu)",
                "primaryMath": "R = \\rho \\frac{l}{S}",
                "allMathBlocks": [
                  "R = \\rho \\frac{l}{S}"
                ],
                "subCases": [],
                "notes": [
                  "(Trong đó $\\rho$ là điện trở suất của vật liệu ($\\Omega\\text{.m}$), $l$ là chiều dài dây dẫn ($\\text{m}$), $S$ là tiết diện thẳng của dây dẫn ($\\text{m}^2$))."
                ],
                "variables": [
                  "\\textit{(Trong đó $\\rho$ là điện trở suất của vật liệu ($\\Omega\\text{.m}$), $l$ là chiều dài dây dẫn ($\\text{m}$), $S$ là tiết diện thẳng của dây dẫn ($\\text{m}^2$)).}"
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ R = \\rho \\frac{l}{S} \\]\n    \\textit{(Trong đó $\\rho$ là điện trở suất của vật liệu ($\\Omega\\text{.m}$), $l$ là chiều dài dây dẫn ($\\text{m}$), $S$ là tiết diện thẳng của dây dẫn ($\\text{m}^2$)).}"
              }
            ]
          }
        ],
        "formulaCount": 5
      }
    ],
    "totalFormulas": 42
  },
  "12": {
    "grade": 12,
    "siTable": [],
    "chapters": [
      {
        "chapterId": "grade12-ch1",
        "chapterNum": "CHƯƠNG I",
        "chapterName": "VẬT LÍ NHIỆT",
        "fullTitle": "CHƯƠNG I. VẬT LÍ NHIỆT",
        "subsections": [
          {
            "subId": "grade12-ch1-sub1",
            "title": "1. Công thức trọng tâm",
            "type": "Trọng tâm",
            "formulas": [
              {
                "id": "PHY12-001",
                "grade": 12,
                "chapterId": "grade12-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "VẬT LÍ NHIỆT",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Định luật I của Nhiệt động lực học",
                "primaryMath": "\\Delta U = A + Q",
                "allMathBlocks": [
                  "\\Delta U = A + Q"
                ],
                "subCases": [
                  {
                    "label": "$Q > 0$: Vật nhận nhiệt lượng từ vật khác;",
                    "math": ""
                  },
                  {
                    "label": "$A > 0$: Vật nhận công từ vật khác;",
                    "math": ""
                  }
                ],
                "notes": [
                  "Quy ước dấu của công $A$ và nhiệt lượng $Q$:"
                ],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ \\Delta U = A + Q \\]\n    \\textit{Quy ước dấu của công $A$ và nhiệt lượng $Q$:}\n    \\begin{itemize}\n        \\item $Q > 0$: Vật nhận nhiệt lượng từ vật khác; \\quad $Q < 0$: Vật truyền nhiệt lượng cho vật khác.\n        \\item $A > 0$: Vật nhận công từ vật khác; \\quad $A < 0$: Vật thực hiện công lên vật khác."
              },
              {
                "id": "PHY12-002",
                "grade": 12,
                "chapterId": "grade12-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "VẬT LÍ NHIỆT",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Chuyển đổi giữa thang nhiệt độ Celsius ($^\\circ\\text{C}$) và thang nhiệt độ tuyệt đối Kelvin ($\\text{K}$)",
                "primaryMath": "T(\\text{K}) = t(^\\circ\\text{C}) + 273,15 \\quad \\text{hoặc làm tròn:} \\quad T(\\text{K}) = t(^\\circ\\text{C}) + 273 \\;;\\qquad \\Delta T(\\text{K}) = \\Delta t(^\\circ\\text{C})",
                "allMathBlocks": [
                  "T(\\text{K}) = t(^\\circ\\text{C}) + 273,15 \\quad \\text{hoặc làm tròn:} \\quad T(\\text{K}) = t(^\\circ\\text{C}) + 273 \\;;\\qquad \\Delta T(\\text{K}) = \\Delta t(^\\circ\\text{C})"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ T(\\text{K}) = t(^\\circ\\text{C}) + 273,15 \\quad \\text{hoặc làm tròn:} \\quad T(\\text{K}) = t(^\\circ\\text{C}) + 273 \\;;\\qquad \\Delta T(\\text{K}) = \\Delta t(^\\circ\\text{C}) \\]"
              },
              {
                "id": "PHY12-003",
                "grade": 12,
                "chapterId": "grade12-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "VẬT LÍ NHIỆT",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Nhiệt dung riêng $c$ và nhiệt lượng làm thay đổi nhiệt độ của vật",
                "primaryMath": "c = \\frac{Q}{m \\Delta T} \\quad \\Rightarrow \\quad Q = m c \\Delta T = m c (T_2 - T_1) \\qquad (\\text{Đơn vị của } c: \\text{J/(kg.K)})",
                "allMathBlocks": [
                  "c = \\frac{Q}{m \\Delta T} \\quad \\Rightarrow \\quad Q = m c \\Delta T = m c (T_2 - T_1) \\qquad (\\text{Đơn vị của } c: \\text{J/(kg.K)})"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "của  c: J/(kg",
                "rawChunk": "}\n    \\[ c = \\frac{Q}{m \\Delta T} \\quad \\Rightarrow \\quad Q = m c \\Delta T = m c (T_2 - T_1) \\qquad (\\text{Đơn vị của } c: \\text{J/(kg.K)}) \\]"
              },
              {
                "id": "PHY12-004",
                "grade": 12,
                "chapterId": "grade12-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "VẬT LÍ NHIỆT",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Nhiệt nóng chảy riêng $\\lambda$ và nhiệt lượng trong quá trình nóng chảy ở nhiệt độ nóng chảy",
                "primaryMath": "\\lambda = \\frac{Q}{m} \\quad \\Rightarrow \\quad Q = \\lambda m \\qquad (\\text{Đơn vị của } \\lambda: \\text{J/kg})",
                "allMathBlocks": [
                  "\\lambda = \\frac{Q}{m} \\quad \\Rightarrow \\quad Q = \\lambda m \\qquad (\\text{Đơn vị của } \\lambda: \\text{J/kg})"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "của  \\lambda: J/kg",
                "rawChunk": "}\n    \\[ \\lambda = \\frac{Q}{m} \\quad \\Rightarrow \\quad Q = \\lambda m \\qquad (\\text{Đơn vị của } \\lambda: \\text{J/kg}) \\]"
              },
              {
                "id": "PHY12-005",
                "grade": 12,
                "chapterId": "grade12-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "VẬT LÍ NHIỆT",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Nhiệt hoá hơi riêng $L$ và nhiệt lượng trong quá trình hoá hơi hoàn toàn ở nhiệt độ xác định",
                "primaryMath": "L = \\frac{Q}{m} \\quad \\Rightarrow \\quad Q = L m \\qquad (\\text{Đơn vị của } L: \\text{J/kg})",
                "allMathBlocks": [
                  "L = \\frac{Q}{m} \\quad \\Rightarrow \\quad Q = L m \\qquad (\\text{Đơn vị của } L: \\text{J/kg})"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "của  L: J/kg",
                "rawChunk": "}\n    \\[ L = \\frac{Q}{m} \\quad \\Rightarrow \\quad Q = L m \\qquad (\\text{Đơn vị của } L: \\text{J/kg}) \\]"
              },
              {
                "id": "PHY12-006",
                "grade": 12,
                "chapterId": "grade12-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "VẬT LÍ NHIỆT",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Phương trình cân bằng nhiệt (Khi các vật chỉ truyền nhiệt cho nhau, cô lập với bên ngoài)",
                "primaryMath": "|Q_{\\text{toả}}| = |Q_{\\text{thu}}| \\quad \\Rightarrow \\quad Q_{\\text{toả}} + Q_{\\text{thu}} = 0",
                "allMathBlocks": [
                  "|Q_{\\text{toả}}| = |Q_{\\text{thu}}| \\quad \\Rightarrow \\quad Q_{\\text{toả}} + Q_{\\text{thu}} = 0"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ |Q_{\\text{toả}}| = |Q_{\\text{thu}}| \\quad \\Rightarrow \\quad Q_{\\text{toả}} + Q_{\\text{thu}} = 0 \\]\n\\end{itemize}\n\n\\subsection*{\\textcolor{secondary}{2. Công thức mở rộng \\& Thực hành}}"
              }
            ]
          },
          {
            "subId": "grade12-ch1-sub2",
            "title": "2. Công thức mở rộng \\& Thực hành",
            "type": "Mở rộng & Vận dụng",
            "formulas": [
              {
                "id": "PHY12-007",
                "grade": 12,
                "chapterId": "grade12-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "VẬT LÍ NHIỆT",
                "sectionTitle": "2. Công thức mở rộng \\& Thực hành",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Chuyển đổi sang thang nhiệt độ Fahrenheit ($^\\circ\\text{F}$) và các tính chất đo nhiệt độ (Bài 3)",
                "primaryMath": "t(^\\circ\\text{F}) = 32 + 1,8 \\, t(^\\circ\\text{C})",
                "allMathBlocks": [],
                "subCases": [
                  {
                    "label": "Công thức chuyển đổi Fahrenheit – Celsius: $t(^",
                    "math": ""
                  },
                  {
                    "label": "Sự phụ thuộc vào nhiệt độ của điện trở dây platin ($0^",
                    "math": ""
                  },
                  {
                    "label": "Hiệu điện thế cặp nhiệt điện: $U = k",
                    "math": ""
                  },
                  {
                    "label": "Hệ thức dịch chuyển Wien đối với bức xạ nhiệt: $",
                    "math": ""
                  }
                ],
                "notes": [],
                "variables": [
                  "\\item Hệ thức dịch chuyển Wien đối với bức xạ nhiệt: $\\lambda_{\\max} \\cdot T = 2\\,900\\,\\mu\\text{m.K}$."
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\begin{itemize}\n        \\item Công thức chuyển đổi Fahrenheit – Celsius: $t(^\\circ\\text{F}) = 32 + 1,8 \\, t(^\\circ\\text{C})$.\n        \\item Sự phụ thuộc vào nhiệt độ của điện trở dây platin ($0^\\circ\\text{C} \\div 600^\\circ\\text{C}$): $R_t = R_0(1 + At + Bt^2)$.\n        \\item Hiệu điện thế cặp nhiệt điện: $U = k \\cdot t$.\n        \\item Hệ thức dịch chuyển Wien đối với bức xạ nhiệt: $\\lambda_{\\max} \\cdot T = 2\\,900\\,\\mu\\text{m.K}$."
              },
              {
                "id": "PHY12-008",
                "grade": 12,
                "chapterId": "grade12-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "VẬT LÍ NHIỆT",
                "sectionTitle": "2. Công thức mở rộng \\& Thực hành",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Công thức thực hành đo các đại lượng nhiệt bằng nhiệt lượng kế (Tổng quan)",
                "primaryMath": "Q_{\\text{toả}} = \\overline{\\mathcal{P}} \\cdot \\tau \\;;\\quad Q_{\\text{thu}} = m \\cdot c \\cdot \\Delta t",
                "allMathBlocks": [],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\begin{itemize}"
              },
              {
                "id": "PHY12-009",
                "grade": 12,
                "chapterId": "grade12-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "VẬT LÍ NHIỆT",
                "sectionTitle": "2. Công thức mở rộng \\& Thực hành",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Đo nhiệt dung riêng của nước (Bài 4)",
                "primaryMath": "c_{\\text{H}_2\\text{O}} = \\frac{Q}{m \\Delta t} = \\frac{\\overline{\\mathcal{P}}(\\tau_N - \\tau_M)}{m(t_N - t_M)}",
                "allMathBlocks": [
                  "c_{\\text{H}_2\\text{O}} = \\frac{Q}{m \\Delta t} = \\frac{\\overline{\\mathcal{P}}(\\tau_N - \\tau_M)}{m(t_N - t_M)}"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n        \\[ c_{\\text{H}_2\\text{O}} = \\frac{Q}{m \\Delta t} = \\frac{\\overline{\\mathcal{P}}(\\tau_N - \\tau_M)}{m(t_N - t_M)} \\]"
              },
              {
                "id": "PHY12-010",
                "grade": 12,
                "chapterId": "grade12-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "VẬT LÍ NHIỆT",
                "sectionTitle": "2. Công thức mở rộng \\& Thực hành",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Đo nhiệt nóng chảy riêng của nước đá (Bài 5)",
                "primaryMath": "\\lambda_{\\text{H}_2\\text{O}} = \\frac{\\overline{\\mathcal{P}} \\tau_M}{m}",
                "allMathBlocks": [
                  "\\lambda_{\\text{H}_2\\text{O}} = \\frac{\\overline{\\mathcal{P}} \\tau_M}{m}"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n        \\[ \\lambda_{\\text{H}_2\\text{O}} = \\frac{\\overline{\\mathcal{P}} \\tau_M}{m} \\]"
              },
              {
                "id": "PHY12-011",
                "grade": 12,
                "chapterId": "grade12-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "VẬT LÍ NHIỆT",
                "sectionTitle": "2. Công thức mở rộng \\& Thực hành",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Đo nhiệt hoá hơi riêng của nước (Bài 6)",
                "primaryMath": "L = \\frac{Q}{\\Delta m} = \\frac{\\overline{\\mathcal{P}}(\\tau_Q - \\tau_P)}{m_P - m_Q}",
                "allMathBlocks": [
                  "L = \\frac{Q}{\\Delta m} = \\frac{\\overline{\\mathcal{P}}(\\tau_Q - \\tau_P)}{m_P - m_Q}"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n        \\[ L = \\frac{Q}{\\Delta m} = \\frac{\\overline{\\mathcal{P}}(\\tau_Q - \\tau_P)}{m_P - m_Q} \\]"
              },
              {
                "id": "PHY12-012",
                "grade": 12,
                "chapterId": "grade12-ch1",
                "chapterNum": "CHƯƠNG I",
                "chapterName": "VẬT LÍ NHIỆT",
                "sectionTitle": "2. Công thức mở rộng \\& Thực hành",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Kết hợp hiệu suất $H$ của thiết bị đun nóng công suất $\\mathcal{P}$ trong thời gian $t$",
                "primaryMath": "Q_{\\text{thu}} = H \\cdot Q_{\\text{toả}} = H \\cdot \\mathcal{P} \\cdot t",
                "allMathBlocks": [
                  "Q_{\\text{thu}} = H \\cdot Q_{\\text{toả}} = H \\cdot \\mathcal{P} \\cdot t"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ Q_{\\text{thu}} = H \\cdot Q_{\\text{toả}} = H \\cdot \\mathcal{P} \\cdot t \\]\n\\end{itemize}\n\n\\vspace{8pt}\n\\textcolor{rulecolor}{\\rule{\\textwidth}{0.6pt}}\n\n\\section*{\\textcolor{primary}{CHƯƠNG II. KHÍ LÍ TƯỞNG}}"
              }
            ]
          }
        ],
        "formulaCount": 12
      },
      {
        "chapterId": "grade12-ch2",
        "chapterNum": "CHƯƠNG II",
        "chapterName": "KHÍ LÍ TƯỞNG",
        "fullTitle": "CHƯƠNG II. KHÍ LÍ TƯỞNG",
        "subsections": [
          {
            "subId": "grade12-ch2-sub1",
            "title": "1. Công thức trọng tâm",
            "type": "Trọng tâm",
            "formulas": [
              {
                "id": "PHY12-013",
                "grade": 12,
                "chapterId": "grade12-ch2",
                "chapterNum": "CHƯƠNG II",
                "chapterName": "KHÍ LÍ TƯỞNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Định luật Boyle (Quá trình đẳng nhiệt: $T = \\text{hằng số}$)",
                "primaryMath": "p V = \\text{hằng số} \\quad \\Leftrightarrow \\quad p_1 V_1 = p_2 V_2",
                "allMathBlocks": [
                  "p V = \\text{hằng số} \\quad \\Leftrightarrow \\quad p_1 V_1 = p_2 V_2"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ p V = \\text{hằng số} \\quad \\Leftrightarrow \\quad p_1 V_1 = p_2 V_2 \\]"
              },
              {
                "id": "PHY12-014",
                "grade": 12,
                "chapterId": "grade12-ch2",
                "chapterNum": "CHƯƠNG II",
                "chapterName": "KHÍ LÍ TƯỞNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Định luật Charles (Quá trình đẳng áp: $p = \\text{hằng số}$)",
                "primaryMath": "\\frac{V - V_0}{V_0 \\Delta t} = \\frac{1}{273} \\quad \\Rightarrow \\quad V = V_0(1 + \\alpha t)",
                "allMathBlocks": [
                  "\\frac{V - V_0}{V_0 \\Delta t} = \\frac{1}{273} \\quad \\Rightarrow \\quad V = V_0(1 + \\alpha t)",
                  "\\frac{V}{T} = \\text{hằng số} \\quad \\Leftrightarrow \\quad \\frac{V_1}{T_1} = \\frac{V_2}{T_2}"
                ],
                "subCases": [
                  {
                    "label": "Theo nhiệt độ Celsius ($t$) với hệ số giãn nở $",
                    "math": ""
                  },
                  {
                    "label": "Theo nhiệt độ tuyệt đối Kelvin ($T$):",
                    "math": "\\frac{V}{T} = \\text{hằng số} \\quad \\Leftrightarrow \\quad \\frac{V_1}{T_1} = \\frac{V_2}{T_2}"
                  }
                ],
                "notes": [],
                "variables": [
                  "\\item Theo nhiệt độ Celsius ($t$) với hệ số giãn nở $\\alpha = \\frac{1}{273}\\text{ K}^{-1}$:"
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\begin{itemize}\n        \\item Theo nhiệt độ Celsius ($t$) với hệ số giãn nở $\\alpha = \\frac{1}{273}\\text{ K}^{-1}$:\n        \\[ \\frac{V - V_0}{V_0 \\Delta t} = \\frac{1}{273} \\quad \\Rightarrow \\quad V = V_0(1 + \\alpha t) \\]\n        \\item Theo nhiệt độ tuyệt đối Kelvin ($T$):\n        \\[ \\frac{V}{T} = \\text{hằng số} \\quad \\Leftrightarrow \\quad \\frac{V_1}{T_1} = \\frac{V_2}{T_2} \\]"
              },
              {
                "id": "PHY12-015",
                "grade": 12,
                "chapterId": "grade12-ch2",
                "chapterNum": "CHƯƠNG II",
                "chapterName": "KHÍ LÍ TƯỞNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Quá trình đẳng tích ($V = \\text{hằng số}$, hệ quả từ phương trình trạng thái)",
                "primaryMath": "\\frac{p}{T} = \\text{hằng số} \\quad \\Leftrightarrow \\quad \\frac{p_1}{T_1} = \\frac{p_2}{T_2}",
                "allMathBlocks": [
                  "\\frac{p}{T} = \\text{hằng số} \\quad \\Leftrightarrow \\quad \\frac{p_1}{T_1} = \\frac{p_2}{T_2}"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ \\frac{p}{T} = \\text{hằng số} \\quad \\Leftrightarrow \\quad \\frac{p_1}{T_1} = \\frac{p_2}{T_2} \\]"
              },
              {
                "id": "PHY12-016",
                "grade": 12,
                "chapterId": "grade12-ch2",
                "chapterNum": "CHƯƠNG II",
                "chapterName": "KHÍ LÍ TƯỞNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Phương trình trạng thái của một lượng khí lí tưởng xác định",
                "primaryMath": "\\frac{p V}{T} = \\text{hằng số} \\quad \\Leftrightarrow \\quad \\frac{p_1 V_1}{T_1} = \\frac{p_2 V_2}{T_2}",
                "allMathBlocks": [
                  "\\frac{p V}{T} = \\text{hằng số} \\quad \\Leftrightarrow \\quad \\frac{p_1 V_1}{T_1} = \\frac{p_2 V_2}{T_2}"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ \\frac{p V}{T} = \\text{hằng số} \\quad \\Leftrightarrow \\quad \\frac{p_1 V_1}{T_1} = \\frac{p_2 V_2}{T_2} \\]"
              },
              {
                "id": "PHY12-017",
                "grade": 12,
                "chapterId": "grade12-ch2",
                "chapterNum": "CHƯƠNG II",
                "chapterName": "KHÍ LÍ TƯỞNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Phương trình Clapeyron (Phương trình trạng thái của $n$ mol khí lí tưởng)",
                "primaryMath": "p V = n R T \\qquad \\text{với } n = \\frac{m}{M} = \\frac{N}{N_A} \\quad \\text{và hằng số khí lí tưởng } R = 8,31\\text{ J/(mol.K)}",
                "allMathBlocks": [
                  "p V = n R T \\qquad \\text{với } n = \\frac{m}{M} = \\frac{N}{N_A} \\quad \\text{và hằng số khí lí tưởng } R = 8,31\\text{ J/(mol.K)}"
                ],
                "subCases": [],
                "notes": [],
                "variables": [
                  "\\[ p V = n R T \\qquad \\text{với } n = \\frac{m}{M} = \\frac{N}{N_A} \\quad \\text{và hằng số khí lí tưởng } R = 8,31\\text{ J/(mol.K)} \\]"
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ p V = n R T \\qquad \\text{với } n = \\frac{m}{M} = \\frac{N}{N_A} \\quad \\text{và hằng số khí lí tưởng } R = 8,31\\text{ J/(mol.K)} \\]"
              },
              {
                "id": "PHY12-018",
                "grade": 12,
                "chapterId": "grade12-ch2",
                "chapterNum": "CHƯƠNG II",
                "chapterName": "KHÍ LÍ TƯỞNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Áp suất chất khí theo mô hình động học phân tử",
                "primaryMath": "p = \\frac{1}{3} \\frac{N m}{V} \\overline{v^2} = \\frac{1}{3} \\mu m \\overline{v^2} = \\frac{2}{3} \\mu \\overline{E_{\\text{đ}}}",
                "allMathBlocks": [
                  "p = \\frac{1}{3} \\frac{N m}{V} \\overline{v^2} = \\frac{1}{3} \\mu m \\overline{v^2} = \\frac{2}{3} \\mu \\overline{E_{\\text{đ}}}"
                ],
                "subCases": [],
                "notes": [
                  "Trong đó:"
                ],
                "variables": [
                  "\\textit{Trong đó:} $\\mu = \\frac{N}{V}$ là mật độ phân tử ($\\text{phân tử/m}^3$); $m$ là khối lượng một phân tử khí ($\\text{kg}$); $\\overline{v^2} = \\frac{v_1^2 + v_2^2 + \\dots + v_N^2}{N}$ là trung bình của các bình phương tốc độ; $\\overline{E_{\\text{đ}}} = \\frac{1}{2} m \\overline{v^2}$ là động năng tịnh tiến trung bình của phân tử."
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ p = \\frac{1}{3} \\frac{N m}{V} \\overline{v^2} = \\frac{1}{3} \\mu m \\overline{v^2} = \\frac{2}{3} \\mu \\overline{E_{\\text{đ}}} \\]\n    \\textit{Trong đó:} $\\mu = \\frac{N}{V}$ là mật độ phân tử ($\\text{phân tử/m}^3$); $m$ là khối lượng một phân tử khí ($\\text{kg}$); $\\overline{v^2} = \\frac{v_1^2 + v_2^2 + \\dots + v_N^2}{N}$ là trung bình của các bình phương tốc độ; $\\overline{E_{\\text{đ}}} = \\frac{1}{2} m \\overline{v^2}$ là động năng tịnh tiến trung bình của phân tử."
              },
              {
                "id": "PHY12-019",
                "grade": 12,
                "chapterId": "grade12-ch2",
                "chapterNum": "CHƯƠNG II",
                "chapterName": "KHÍ LÍ TƯỞNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Mối quan hệ giữa động năng tịnh tiến trung bình của phân tử và nhiệt độ tuyệt đối $T$",
                "primaryMath": "\\overline{E_{\\text{đ}}} = \\frac{3}{2} \\frac{R}{N_A} T = \\frac{3}{2} k T",
                "allMathBlocks": [
                  "\\overline{E_{\\text{đ}}} = \\frac{3}{2} \\frac{R}{N_A} T = \\frac{3}{2} k T"
                ],
                "subCases": [],
                "notes": [
                  "Trong đó:"
                ],
                "variables": [
                  "\\textit{Trong đó:} Số Avogadro $N_A = 6,02 \\cdot 10^{23}\\text{ hạt/mol}$; hằng số Boltzmann $k = \\frac{R}{N_A} = 1,38 \\cdot 10^{-23}\\text{ J/K}$."
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ \\overline{E_{\\text{đ}}} = \\frac{3}{2} \\frac{R}{N_A} T = \\frac{3}{2} k T \\]\n    \\textit{Trong đó:} Số Avogadro $N_A = 6,02 \\cdot 10^{23}\\text{ hạt/mol}$; hằng số Boltzmann $k = \\frac{R}{N_A} = 1,38 \\cdot 10^{-23}\\text{ J/K}$.\n\\end{itemize}\n\n\\subsection*{\\textcolor{secondary}{2. Công thức mở rộng \\& Vận dụng}}"
              }
            ]
          },
          {
            "subId": "grade12-ch2-sub2",
            "title": "2. Công thức mở rộng \\& Vận dụng",
            "type": "Mở rộng & Vận dụng",
            "formulas": [
              {
                "id": "PHY12-020",
                "grade": 12,
                "chapterId": "grade12-ch2",
                "chapterNum": "CHƯƠNG II",
                "chapterName": "KHÍ LÍ TƯỞNG",
                "sectionTitle": "2. Công thức mở rộng \\& Vận dụng",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Tốc độ thống kê của các phân tử khí và quá trình va chạm lên thành bình (Bài 8, Bài 12)",
                "primaryMath": "v_{\\text{rms}} = \\sqrt{\\overline{v^2}} = \\sqrt{\\frac{3kT}{m}} = \\sqrt{\\frac{3RT}{M}}",
                "allMathBlocks": [
                  "v_{\\text{rms}} = \\sqrt{\\overline{v^2}} = \\sqrt{\\frac{3kT}{m}} = \\sqrt{\\frac{3RT}{M}}",
                  "F_m = \\frac{m v^2}{l} \\;;\\qquad p_m = \\frac{m}{V} v^2"
                ],
                "subCases": [
                  {
                    "label": "Tốc độ trung bình số học: $",
                    "math": ""
                  },
                  {
                    "label": "Tốc độ căn quân phương của phân tử khí:",
                    "math": "v_{\\text{rms}} = \\sqrt{\\overline{v^2}} = \\sqrt{\\frac{3kT}{m}} = \\sqrt{\\frac{3RT}{M}}"
                  },
                  {
                    "label": "Độ biến thiên động lượng của 1 phân tử khí va chạm đàn hồi trực diện với thành bình: $|",
                    "math": ""
                  },
                  {
                    "label": "Lực trung bình và áp suất do 1 phân tử khí tác dụng lên thành bình lập phương cạnh $l$ ($V = l^3$):",
                    "math": "F_m = \\frac{m v^2}{l} \\;;\\qquad p_m = \\frac{m}{V} v^2"
                  }
                ],
                "notes": [],
                "variables": [
                  "\\item Độ biến thiên động lượng của 1 phân tử khí va chạm đàn hồi trực diện với thành bình: $|\\Delta p| = 2mv$."
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\begin{itemize}\n        \\item Tốc độ trung bình số học: $\\overline{v} = \\frac{v_1 + v_2 + \\dots + v_n}{n}$.\n        \\item Tốc độ căn quân phương của phân tử khí:\n        \\[ v_{\\text{rms}} = \\sqrt{\\overline{v^2}} = \\sqrt{\\frac{3kT}{m}} = \\sqrt{\\frac{3RT}{M}} \\]\n        \\item Độ biến thiên động lượng của 1 phân tử khí va chạm đàn hồi trực diện với thành bình: $|\\Delta p| = 2mv$.\n        \\item Lực trung bình và áp suất do 1 phân tử khí tác dụng lên thành bình lập phương cạnh $l$ ($V = l^3$):\n        \\[ F_m = \\frac{m v^2}{l} \\;;\\qquad p_m = \\frac{m}{V} v^2 \\]"
              },
              {
                "id": "PHY12-021",
                "grade": 12,
                "chapterId": "grade12-ch2",
                "chapterNum": "CHƯƠNG II",
                "chapterName": "KHÍ LÍ TƯỞNG",
                "sectionTitle": "2. Công thức mở rộng \\& Vận dụng",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Liên hệ với khối lượng riêng của chất khí ($\\rho = \\frac{m}{V}$) và bài toán bọt khí / mở nắp bình (Bài 9, Bài 10, Bài 13)",
                "primaryMath": "\\rho",
                "allMathBlocks": [],
                "subCases": [
                  {
                    "label": "Phương trình trạng thái theo khối lượng riêng $",
                    "math": ""
                  },
                  {
                    "label": "Áp suất tại độ sâu $h$ trong lòng chất lỏng khối lượng riêng $",
                    "math": ""
                  },
                  {
                    "label": "Điều kiện lực tối thiểu $F$ để mở nắp bình hình trụ diện tích $S =",
                    "math": ""
                  }
                ],
                "notes": [],
                "variables": [
                  "\\item Áp suất tại độ sâu $h$ trong lòng chất lỏng khối lượng riêng $\\rho$ (với áp suất khí quyển $p_0$): $p = p_0 + \\rho g h$."
                ],
                "conditions": [
                  "\\item Điều kiện lực tối thiểu $F$ để mở nắp bình hình trụ diện tích $S = \\frac{\\pi d^2}{4}$, khối lượng nắp $m$: $F + p_{\\text{trong}} S = m g + p_{\\text{ngoài}} S$."
                ],
                "unit": "",
                "rawChunk": "}\n    \\begin{itemize}\n        \\item Phương trình trạng thái theo khối lượng riêng $\\rho$: $\\frac{p_1}{\\rho_1 T_1} = \\frac{p_2}{\\rho_2 T_2}$ hay $p = \\frac{\\rho R T}{M}$.\n        \\item Áp suất tại độ sâu $h$ trong lòng chất lỏng khối lượng riêng $\\rho$ (với áp suất khí quyển $p_0$): $p = p_0 + \\rho g h$.\n        \\item Điều kiện lực tối thiểu $F$ để mở nắp bình hình trụ diện tích $S = \\frac{\\pi d^2}{4}$, khối lượng nắp $m$: $F + p_{\\text{trong}} S = m g + p_{\\text{ngoài}} S$.\n    \\end{itemize}\n\\end{itemize}\n\n\\vspace{8pt}\n\\textcolor{rulecolor}{\\rule{\\textwidth}{0.6pt}}\n\n\\section*{\\textcolor{primary}{CHƯƠNG III. TỪ TRƯỜNG}}"
              }
            ]
          }
        ],
        "formulaCount": 9
      },
      {
        "chapterId": "grade12-ch3",
        "chapterNum": "CHƯƠNG III",
        "chapterName": "TỪ TRƯỜNG",
        "fullTitle": "CHƯƠNG III. TỪ TRƯỜNG",
        "subsections": [
          {
            "subId": "grade12-ch3-sub1",
            "title": "1. Công thức trọng tâm",
            "type": "Trọng tâm",
            "formulas": [
              {
                "id": "PHY12-022",
                "grade": 12,
                "chapterId": "grade12-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "TỪ TRƯỜNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Độ lớn cảm ứng từ $B$ và Lực từ tác dụng lên đoạn dây dẫn thẳng mang dòng điện (Định luật Ampère)",
                "primaryMath": "B = \\frac{F}{I L \\sin\\alpha} \\quad \\Rightarrow \\quad F = B I L \\sin\\alpha",
                "allMathBlocks": [
                  "B = \\frac{F}{I L \\sin\\alpha} \\quad \\Rightarrow \\quad F = B I L \\sin\\alpha"
                ],
                "subCases": [],
                "notes": [
                  "Trong đó:"
                ],
                "variables": [
                  "\\textit{Trong đó:} $B$ là độ lớn cảm ứng từ (đơn vị Tesla: $1\\text{ T} = 1\\text{ N/(A.m)} = 1\\text{ kg.A}^{-1}\\text{.s}^{-2}$); $I$ là cường độ dòng điện ($\\text{A}$); $L$ là chiều dài đoạn dây dẫn nằm trong từ trường ($\\text{m}$); $\\alpha$ là góc hợp bởi đoạn dây mang dòng điện $\\vec{I}$ và vectơ cảm ứng từ $\\vec{B}$."
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ B = \\frac{F}{I L \\sin\\alpha} \\quad \\Rightarrow \\quad F = B I L \\sin\\alpha \\]\n    \\textit{Trong đó:} $B$ là độ lớn cảm ứng từ (đơn vị Tesla: $1\\text{ T} = 1\\text{ N/(A.m)} = 1\\text{ kg.A}^{-1}\\text{.s}^{-2}$); $I$ là cường độ dòng điện ($\\text{A}$); $L$ là chiều dài đoạn dây dẫn nằm trong từ trường ($\\text{m}$); $\\alpha$ là góc hợp bởi đoạn dây mang dòng điện $\\vec{I}$ và vectơ cảm ứng từ $\\vec{B}$."
              },
              {
                "id": "PHY12-023",
                "grade": 12,
                "chapterId": "grade12-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "TỪ TRƯỜNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Từ thông qua diện tích $S$ đặt trong từ trường đều $\\vec{B}$",
                "primaryMath": "\\Phi = B S \\cos\\alpha \\qquad (\\text{Nếu cuộn dây có } N \\text{ vòng dây: } \\Phi = N B S \\cos\\alpha)",
                "allMathBlocks": [
                  "\\Phi = B S \\cos\\alpha \\qquad (\\text{Nếu cuộn dây có } N \\text{ vòng dây: } \\Phi = N B S \\cos\\alpha)"
                ],
                "subCases": [],
                "notes": [
                  "Trong đó:"
                ],
                "variables": [
                  "\\textit{Trong đó:} $\\alpha$ là góc hợp bởi vectơ pháp tuyến đơn vị $\\vec{n}$ của mặt phẳng vòng dây và vectơ cảm ứng từ $\\vec{B}$; đơn vị từ thông là weber ($\\text{Wb}$): $1\\text{ Wb} = 1\\text{ T.m}^2$."
                ],
                "conditions": [
                  "\\[ \\Phi = B S \\cos\\alpha \\qquad (\\text{Nếu cuộn dây có } N \\text{ vòng dây: } \\Phi = N B S \\cos\\alpha) \\]"
                ],
                "unit": "",
                "rawChunk": "}\n    \\[ \\Phi = B S \\cos\\alpha \\qquad (\\text{Nếu cuộn dây có } N \\text{ vòng dây: } \\Phi = N B S \\cos\\alpha) \\]\n    \\textit{Trong đó:} $\\alpha$ là góc hợp bởi vectơ pháp tuyến đơn vị $\\vec{n}$ của mặt phẳng vòng dây và vectơ cảm ứng từ $\\vec{B}$; đơn vị từ thông là weber ($\\text{Wb}$): $1\\text{ Wb} = 1\\text{ T.m}^2$."
              },
              {
                "id": "PHY12-024",
                "grade": 12,
                "chapterId": "grade12-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "TỪ TRƯỜNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Định luật Faraday và Định luật Lenz về suất điện động cảm ứng",
                "primaryMath": "|e_c| = \\left| \\frac{\\Delta \\Phi}{\\Delta t} \\right| \\;;\\qquad \\text{Kể cả dấu theo định luật Lenz: } e_c = -\\frac{\\Delta \\Phi}{\\Delta t} \\quad \\text{hoặc} \\quad e_c = -N \\frac{\\Delta \\Phi}{\\Delta t}",
                "allMathBlocks": [
                  "|e_c| = \\left| \\frac{\\Delta \\Phi}{\\Delta t} \\right| \\;;\\qquad \\text{Kể cả dấu theo định luật Lenz: } e_c = -\\frac{\\Delta \\Phi}{\\Delta t} \\quad \\text{hoặc} \\quad e_c = -N \\frac{\\Delta \\Phi}{\\Delta t}"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ |e_c| = \\left| \\frac{\\Delta \\Phi}{\\Delta t} \\right| \\;;\\qquad \\text{Kể cả dấu theo định luật Lenz: } e_c = -\\frac{\\Delta \\Phi}{\\Delta t} \\quad \\text{hoặc} \\quad e_c = -N \\frac{\\Delta \\Phi}{\\Delta t} \\]"
              },
              {
                "id": "PHY12-025",
                "grade": 12,
                "chapterId": "grade12-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "TỪ TRƯỜNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Nguyên tắc tạo ra dòng điện xoay chiều (Khung dây $N$ vòng, diện tích $S$ quay đều với tốc độ góc $\\omega$ trong từ trường đều $\\vec{B} \\perp$ trục quay)",
                "primaryMath": "e = E_0 \\cos(\\omega t + \\varphi_e) = N B S \\omega \\cos\\left(\\omega t + \\varphi_0 - \\frac{\\pi}{2}\\right) \\qquad (\\text{với suất điện động cực đại } E_0 = N B S \\omega)",
                "allMathBlocks": [
                  "e = E_0 \\cos(\\omega t + \\varphi_e) = N B S \\omega \\cos\\left(\\omega t + \\varphi_0 - \\frac{\\pi}{2}\\right) \\qquad (\\text{với suất điện động cực đại } E_0 = N B S \\omega)"
                ],
                "subCases": [
                  {
                    "label": "Từ thông qua khung dây tại thời điểm $t$: $",
                    "math": ""
                  },
                  {
                    "label": "Suất điện động cảm ứng xoay chiều trong khung dây:",
                    "math": "e = E_0 \\cos(\\omega t + \\varphi_e) = N B S \\omega \\cos\\left(\\omega t + \\varphi_0 - \\frac{\\pi}{2}\\right) \\qquad (\\text{với suất điện động cực đại } E_0 = N B S \\omega)"
                  }
                ],
                "notes": [],
                "variables": [
                  "\\[ e = E_0 \\cos(\\omega t + \\varphi_e) = N B S \\omega \\cos\\left(\\omega t + \\varphi_0 - \\frac{\\pi}{2}\\right) \\qquad (\\text{với suất điện động cực đại } E_0 = N B S \\omega) \\]"
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\begin{itemize}\n        \\item Từ thông qua khung dây tại thời điểm $t$: $\\Phi = N B S \\cos(\\omega t + \\varphi_0) = \\Phi_0 \\cos(\\omega t + \\varphi_0)$.\n        \\item Suất điện động cảm ứng xoay chiều trong khung dây:\n        \\[ e = E_0 \\cos(\\omega t + \\varphi_e) = N B S \\omega \\cos\\left(\\omega t + \\varphi_0 - \\frac{\\pi}{2}\\right) \\qquad (\\text{với suất điện động cực đại } E_0 = N B S \\omega) \\]"
              },
              {
                "id": "PHY12-026",
                "grade": 12,
                "chapterId": "grade12-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "TỪ TRƯỜNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Đại lượng tức thời và giá trị hiệu dụng của dòng điện xoay chiều",
                "primaryMath": "u = U_0 \\cos(\\omega t + \\varphi_u) \\;;\\qquad i = I_0 \\cos(\\omega t + \\varphi_i) \\;;\\qquad \\text{Độ lệch pha: } \\Delta\\varphi = \\varphi_u - \\varphi_i",
                "allMathBlocks": [
                  "u = U_0 \\cos(\\omega t + \\varphi_u) \\;;\\qquad i = I_0 \\cos(\\omega t + \\varphi_i) \\;;\\qquad \\text{Độ lệch pha: } \\Delta\\varphi = \\varphi_u - \\varphi_i",
                  "I = \\frac{I_0}{\\sqrt{2}} \\;;\\qquad U = \\frac{U_0}{\\sqrt{2}} \\;;\\qquad E = \\frac{E_0}{\\sqrt{2}}"
                ],
                "subCases": [
                  {
                    "label": "Điện áp tức thời và cường độ dòng điện tức thời:",
                    "math": "u = U_0 \\cos(\\omega t + \\varphi_u) \\;;\\qquad i = I_0 \\cos(\\omega t + \\varphi_i) \\;;\\qquad \\text{Độ lệch pha: } \\Delta\\varphi = \\varphi_u - \\varphi_i"
                  },
                  {
                    "label": "Giá trị hiệu dụng của cường độ dòng điện và điện áp xoay chiều:",
                    "math": "I = \\frac{I_0}{\\sqrt{2}} \\;;\\qquad U = \\frac{U_0}{\\sqrt{2}} \\;;\\qquad E = \\frac{E_0}{\\sqrt{2}}"
                  }
                ],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\begin{itemize}\n        \\item Điện áp tức thời và cường độ dòng điện tức thời:\n        \\[ u = U_0 \\cos(\\omega t + \\varphi_u) \\;;\\qquad i = I_0 \\cos(\\omega t + \\varphi_i) \\;;\\qquad \\text{Độ lệch pha: } \\Delta\\varphi = \\varphi_u - \\varphi_i \\]\n        \\item Giá trị hiệu dụng của cường độ dòng điện và điện áp xoay chiều:\n        \\[ I = \\frac{I_0}{\\sqrt{2}} \\;;\\qquad U = \\frac{U_0}{\\sqrt{2}} \\;;\\qquad E = \\frac{E_0}{\\sqrt{2}} \\]"
              },
              {
                "id": "PHY12-027",
                "grade": 12,
                "chapterId": "grade12-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "TỪ TRƯỜNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Công thức Máy biến áp lí tưởng",
                "primaryMath": "\\frac{U_1}{U_2} = \\frac{N_1}{N_2}",
                "allMathBlocks": [
                  "\\frac{U_1}{U_2} = \\frac{N_1}{N_2}"
                ],
                "subCases": [],
                "notes": [
                  "(Trong đó $U_1, U_2$ và $N_1, N_2$ lần lượt là điện áp hiệu dụng và số vòng dây của cuộn sơ cấp và cuộn thứ cấp)."
                ],
                "variables": [
                  "\\textit{(Trong đó $U_1, U_2$ và $N_1, N_2$ lần lượt là điện áp hiệu dụng và số vòng dây của cuộn sơ cấp và cuộn thứ cấp).}"
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ \\frac{U_1}{U_2} = \\frac{N_1}{N_2} \\]\n    \\textit{(Trong đó $U_1, U_2$ và $N_1, N_2$ lần lượt là điện áp hiệu dụng và số vòng dây của cuộn sơ cấp và cuộn thứ cấp).}"
              },
              {
                "id": "PHY12-028",
                "grade": 12,
                "chapterId": "grade12-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "TỪ TRƯỜNG",
                "sectionTitle": "1. Công thức trọng tâm",
                "sectionType": "Trọng tâm",
                "title": "Bước sóng của sóng điện từ trong chân không",
                "primaryMath": "\\lambda = c \\cdot T = \\frac{c}{f} \\qquad (\\text{với } c = 3 \\cdot 10^8\\text{ m/s}; \\text{ tại mỗi điểm } \\vec{E} \\perp \\vec{B}, \\text{ cùng vuông góc với phương truyền sóng và luôn đồng pha})",
                "allMathBlocks": [
                  "\\lambda = c \\cdot T = \\frac{c}{f} \\qquad (\\text{với } c = 3 \\cdot 10^8\\text{ m/s}; \\text{ tại mỗi điểm } \\vec{E} \\perp \\vec{B}, \\text{ cùng vuông góc với phương truyền sóng và luôn đồng pha})"
                ],
                "subCases": [],
                "notes": [],
                "variables": [
                  "\\[ \\lambda = c \\cdot T = \\frac{c}{f} \\qquad (\\text{với } c = 3 \\cdot 10^8\\text{ m/s}; \\text{ tại mỗi điểm } \\vec{E} \\perp \\vec{B}, \\text{ cùng vuông góc với phương truyền sóng và luôn đồng pha}) \\]"
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ \\lambda = c \\cdot T = \\frac{c}{f} \\qquad (\\text{với } c = 3 \\cdot 10^8\\text{ m/s}; \\text{ tại mỗi điểm } \\vec{E} \\perp \\vec{B}, \\text{ cùng vuông góc với phương truyền sóng và luôn đồng pha}) \\]\n\\end{itemize}\n\n\\subsection*{\\textcolor{secondary}{2. Công thức mở rộng \\& Vận dụng}}"
              }
            ]
          },
          {
            "subId": "grade12-ch3-sub2",
            "title": "2. Công thức mở rộng \\& Vận dụng",
            "type": "Mở rộng & Vận dụng",
            "formulas": [
              {
                "id": "PHY12-029",
                "grade": 12,
                "chapterId": "grade12-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "TỪ TRƯỜNG",
                "sectionTitle": "2. Công thức mở rộng \\& Vận dụng",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Suất điện động cảm ứng trong đoạn dây dẫn chiều dài $L$ chuyển động thẳng đều với vận tốc $\\vec{v}$ vuông góc với đường sức từ $\\vec{B}$ (Bài 16)",
                "primaryMath": "|e_c| = \\left| \\frac{\\Delta \\Phi}{\\Delta t} \\right| = \\frac{B \\cdot \\Delta S}{\\Delta t} = B \\cdot L \\cdot v",
                "allMathBlocks": [
                  "|e_c| = \\left| \\frac{\\Delta \\Phi}{\\Delta t} \\right| = \\frac{B \\cdot \\Delta S}{\\Delta t} = B \\cdot L \\cdot v"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ |e_c| = \\left| \\frac{\\Delta \\Phi}{\\Delta t} \\right| = \\frac{B \\cdot \\Delta S}{\\Delta t} = B \\cdot L \\cdot v \\]"
              },
              {
                "id": "PHY12-030",
                "grade": 12,
                "chapterId": "grade12-ch3",
                "chapterNum": "CHƯƠNG III",
                "chapterName": "TỪ TRƯỜNG",
                "sectionTitle": "2. Công thức mở rộng \\& Vận dụng",
                "sectionType": "Mở rộng & Vận dụng",
                "title": "Suất điện động trong máy phát điện xoay chiều ba pha (Bài 17)",
                "primaryMath": "e_1 = E_0 \\cos(\\omega t) \\;;\\qquad e_2 = E_0 \\cos\\left(\\omega t + \\frac{2\\pi}{3}\\right) \\;;\\qquad e_3 = E_0 \\cos\\left(\\omega t - \\frac{2\\pi}{3}\\right)",
                "allMathBlocks": [
                  "e_1 = E_0 \\cos(\\omega t) \\;;\\qquad e_2 = E_0 \\cos\\left(\\omega t + \\frac{2\\pi}{3}\\right) \\;;\\qquad e_3 = E_0 \\cos\\left(\\omega t - \\frac{2\\pi}{3}\\right)"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    Ba cuộn dây của phần ứng đặt lệch nhau $120^\\circ$ trên vòng tròn tạo ra hệ ba suất điện động xoay chiều cùng biên độ $E_0$, cùng tần số góc $\\omega$ nhưng lệch pha nhau $\\frac{2\\pi}{3}$:\n    \\[ e_1 = E_0 \\cos(\\omega t) \\;;\\qquad e_2 = E_0 \\cos\\left(\\omega t + \\frac{2\\pi}{3}\\right) \\;;\\qquad e_3 = E_0 \\cos\\left(\\omega t - \\frac{2\\pi}{3}\\right) \\]\n\\end{itemize}\n\n\\vspace{8pt}\n\\textcolor{rulecolor}{\\rule{\\textwidth}{0.6pt}}\n\n\\section*{\\textcolor{primary}{CHƯƠNG IV. VẬT LÍ HẠT NHÂN (BÀI 21 – BÀI 22)}}"
              }
            ]
          }
        ],
        "formulaCount": 9
      },
      {
        "chapterId": "grade12-ch4",
        "chapterNum": "CHƯƠNG IV",
        "chapterName": "VẬT LÍ HẠT NHÂN (BÀI 21 – BÀI 22)",
        "fullTitle": "CHƯƠNG IV. VẬT LÍ HẠT NHÂN (BÀI 21 – BÀI 22)",
        "subsections": [
          {
            "subId": "grade12-ch4-sub1",
            "title": "1. Cấu trúc hạt nhân",
            "type": "Chuyên đề",
            "formulas": [
              {
                "id": "PHY12-031",
                "grade": 12,
                "chapterId": "grade12-ch4",
                "chapterNum": "CHƯƠNG IV",
                "chapterName": "VẬT LÍ HẠT NHÂN (BÀI 21 – BÀI 22)",
                "sectionTitle": "1. Cấu trúc hạt nhân",
                "sectionType": "Chuyên đề",
                "title": "Kí hiệu hạt nhân và thành phần nucleon",
                "primaryMath": "X",
                "allMathBlocks": [],
                "subCases": [
                  {
                    "label": "Số proton bằng số hiệu nguyên tử: $Z$ (điện tích hạt nhân là $+Ze$, với $e",
                    "math": ""
                  },
                  {
                    "label": "Tổng số nucleon bằng số khối: $A$.",
                    "math": ""
                  },
                  {
                    "label": "Số neutron trong hạt nhân: $N = A - Z$.",
                    "math": ""
                  }
                ],
                "notes": [],
                "variables": [
                  "\\item Số proton bằng số hiệu nguyên tử: $Z$ (điện tích hạt nhân là $+Ze$, với $e \\approx 1,6 \\cdot 10^{-19}\\text{ C}$)."
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "} Hạt nhân nguyên tử nguyên tố $X$ được kí hiệu là ${}_Z^A X$:\n    \\begin{itemize}\n        \\item Số proton bằng số hiệu nguyên tử: $Z$ (điện tích hạt nhân là $+Ze$, với $e \\approx 1,6 \\cdot 10^{-19}\\text{ C}$).\n        \\item Tổng số nucleon bằng số khối: $A$.\n        \\item Số neutron trong hạt nhân: $N = A - Z$."
              },
              {
                "id": "PHY12-032",
                "grade": 12,
                "chapterId": "grade12-ch4",
                "chapterNum": "CHƯƠNG IV",
                "chapterName": "VẬT LÍ HẠT NHÂN (BÀI 21 – BÀI 22)",
                "sectionTitle": "1. Cấu trúc hạt nhân",
                "sectionType": "Chuyên đề",
                "title": "Đơn vị khối lượng nguyên tử ($\\text{amu}$) và khối lượng các nucleon",
                "primaryMath": "1\\text{ amu} = \\frac{1}{12} m({}_6^{12}\\text{C}) \\approx 1,66054 \\cdot 10^{-27}\\text{ kg}",
                "allMathBlocks": [
                  "1\\text{ amu} = \\frac{1}{12} m({}_6^{12}\\text{C}) \\approx 1,66054 \\cdot 10^{-27}\\text{ kg}"
                ],
                "subCases": [
                  {
                    "label": "Khối lượng proton: $m_p",
                    "math": ""
                  },
                  {
                    "label": "Khối lượng neutron: $m_n",
                    "math": ""
                  }
                ],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ 1\\text{ amu} = \\frac{1}{12} m({}_6^{12}\\text{C}) \\approx 1,66054 \\cdot 10^{-27}\\text{ kg} \\]\n    \\begin{itemize}\n        \\item Khối lượng proton: $m_p \\approx 1,67262 \\cdot 10^{-27}\\text{ kg} \\approx 1,00728\\text{ amu}$.\n        \\item Khối lượng neutron: $m_n \\approx 1,67493 \\cdot 10^{-27}\\text{ kg} \\approx 1,00866\\text{ amu}$."
              },
              {
                "id": "PHY12-033",
                "grade": 12,
                "chapterId": "grade12-ch4",
                "chapterNum": "CHƯƠNG IV",
                "chapterName": "VẬT LÍ HẠT NHÂN (BÀI 21 – BÀI 22)",
                "sectionTitle": "1. Cấu trúc hạt nhân",
                "sectionType": "Chuyên đề",
                "title": "Công thức bán kính hạt nhân theo số khối $A$",
                "primaryMath": "R = 1,2 \\cdot 10^{-15} \\cdot A^{\\frac{1}{3}} \\;\\; (\\text{m})",
                "allMathBlocks": [
                  "R = 1,2 \\cdot 10^{-15} \\cdot A^{\\frac{1}{3}} \\;\\; (\\text{m})"
                ],
                "subCases": [],
                "notes": [
                  "(Từ đó suy ra thể tích hạt nhân $V = \\frac{4}{3}\\pi R^3$ tỉ lệ thuận với số khối $A$, nên khối lượng riêng của mọi hạt nhân gần như bằng nhau)."
                ],
                "variables": [
                  "\\textit{(Từ đó suy ra thể tích hạt nhân $V = \\frac{4}{3}\\pi R^3$ tỉ lệ thuận với số khối $A$, nên khối lượng riêng của mọi hạt nhân gần như bằng nhau).}"
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ R = 1,2 \\cdot 10^{-15} \\cdot A^{\\frac{1}{3}} \\;\\; (\\text{m}) \\]\n    \\textit{(Từ đó suy ra thể tích hạt nhân $V = \\frac{4}{3}\\pi R^3$ tỉ lệ thuận với số khối $A$, nên khối lượng riêng của mọi hạt nhân gần như bằng nhau).}\n\\end{itemize}\n\n\\subsection*{\\textcolor{secondary}{2. Phản ứng hạt nhân và Năng lượng liên kết}}"
              }
            ]
          },
          {
            "subId": "grade12-ch4-sub2",
            "title": "2. Phản ứng hạt nhân và Năng lượng liên kết",
            "type": "Chuyên đề",
            "formulas": [
              {
                "id": "PHY12-034",
                "grade": 12,
                "chapterId": "grade12-ch4",
                "chapterNum": "CHƯƠNG IV",
                "chapterName": "VẬT LÍ HẠT NHÂN (BÀI 21 – BÀI 22)",
                "sectionTitle": "2. Phản ứng hạt nhân và Năng lượng liên kết",
                "sectionType": "Chuyên đề",
                "title": "Các định luật bảo toàn trong phản ứng hạt nhân",
                "primaryMath": "{}_{Z_1}^{A_1} X_1 + {}_{Z_2}^{A_2} X_2 \\rightarrow {}_{Z_3}^{A_3} X_3 + {}_{Z_4}^{A_4} X_4",
                "allMathBlocks": [
                  "{}_{Z_1}^{A_1} X_1 + {}_{Z_2}^{A_2} X_2 \\rightarrow {}_{Z_3}^{A_3} X_3 + {}_{Z_4}^{A_4} X_4"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "} Xét phản ứng hạt nhân tổng quát:\n    \\[ {}_{Z_1}^{A_1} X_1 + {}_{Z_2}^{A_2} X_2 \\rightarrow {}_{Z_3}^{A_3} X_3 + {}_{Z_4}^{A_4} X_4 \\]\n    \\begin{itemize}"
              },
              {
                "id": "PHY12-035",
                "grade": 12,
                "chapterId": "grade12-ch4",
                "chapterNum": "CHƯƠNG IV",
                "chapterName": "VẬT LÍ HẠT NHÂN (BÀI 21 – BÀI 22)",
                "sectionTitle": "2. Phản ứng hạt nhân và Năng lượng liên kết",
                "sectionType": "Chuyên đề",
                "title": "Định luật bảo toàn số nucleon (bảo toàn số khối $A$)",
                "primaryMath": "A_1 + A_2 = A_3 + A_4",
                "allMathBlocks": [
                  "A_1 + A_2 = A_3 + A_4"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n        \\[ A_1 + A_2 = A_3 + A_4 \\]"
              },
              {
                "id": "PHY12-036",
                "grade": 12,
                "chapterId": "grade12-ch4",
                "chapterNum": "CHƯƠNG IV",
                "chapterName": "VẬT LÍ HẠT NHÂN (BÀI 21 – BÀI 22)",
                "sectionTitle": "2. Phản ứng hạt nhân và Năng lượng liên kết",
                "sectionType": "Chuyên đề",
                "title": "Định luật bảo toàn điện tích (bảo toàn nguyên tử số $Z$)",
                "primaryMath": "Z_1 + Z_2 = Z_3 + Z_4",
                "allMathBlocks": [
                  "Z_1 + Z_2 = Z_3 + Z_4"
                ],
                "subCases": [],
                "notes": [],
                "variables": [],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n        \\[ Z_1 + Z_2 = Z_3 + Z_4 \\]"
              },
              {
                "id": "PHY12-037",
                "grade": 12,
                "chapterId": "grade12-ch4",
                "chapterNum": "CHƯƠNG IV",
                "chapterName": "VẬT LÍ HẠT NHÂN (BÀI 21 – BÀI 22)",
                "sectionTitle": "2. Phản ứng hạt nhân và Năng lượng liên kết",
                "sectionType": "Chuyên đề",
                "title": "Năng lượng liên kết riêng (Đặc trưng cho mức độ bền vững của hạt nhân)",
                "primaryMath": "E_{lkr} = \\frac{E_{lk}}{A}",
                "allMathBlocks": [
                  "E_{lkr} = \\frac{E_{lk}}{A}"
                ],
                "subCases": [],
                "notes": [
                  "(Trong đó $E_{lk}$ là năng lượng liên kết của hạt nhân — năng lượng tối thiểu dùng để tách toàn bộ $A$ nucleon ra khỏi hạt nhân; hạt nhân có $E_{lkr}$ càng lớn thì càng bền vững, đạt cực đại cỡ $8,8\\text{ MeV/nucleon}$ ở các hạt nhân trung bình gần ${}^{56}\\text{Fe}$)."
                ],
                "variables": [
                  "\\textit{(Trong đó $E_{lk}$ là năng lượng liên kết của hạt nhân — năng lượng tối thiểu dùng để tách toàn bộ $A$ nucleon ra khỏi hạt nhân; hạt nhân có $E_{lkr}$ càng lớn thì càng bền vững, đạt cực đại cỡ $8,8\\text{ MeV/nucleon}$ ở các hạt nhân trung bình gần ${}^{56}\\text{Fe}$).}"
                ],
                "conditions": [],
                "unit": "",
                "rawChunk": "}\n    \\[ E_{lkr} = \\frac{E_{lk}}{A} \\]\n    \\textit{(Trong đó $E_{lk}$ là năng lượng liên kết của hạt nhân — năng lượng tối thiểu dùng để tách toàn bộ $A$ nucleon ra khỏi hạt nhân; hạt nhân có $E_{lkr}$ càng lớn thì càng bền vững, đạt cực đại cỡ $8,8\\text{ MeV/nucleon}$ ở các hạt nhân trung bình gần ${}^{56}\\text{Fe}$).}"
              }
            ]
          }
        ],
        "formulaCount": 7
      }
    ],
    "totalFormulas": 37
  }
};
