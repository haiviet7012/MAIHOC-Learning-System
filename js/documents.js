import { SAMPLE_DOCS } from "./data.js";

const STORAGE_KEY = "maihoc-uploaded-docs";
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const API_URL = "/api/documents";

/**
 * Đọc danh sách tài liệu đã lưu trong localStorage.
 */
function readUploadedDocuments() {
    try {
        const saved = JSON.parse(
            localStorage.getItem(STORAGE_KEY) || "[]"
        );

        return Array.isArray(saved) ? saved : [];
    } catch (error) {
        console.error("Không thể đọc danh sách tài liệu:", error);
        return [];
    }
}

/**
 * Lưu danh sách tài liệu vào localStorage.
 */
function writeUploadedDocuments(documents) {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(documents)
        );
    } catch (error) {
        console.error("Không thể lưu danh sách tài liệu:", error);
    }
}

/**
 * Lưu hoặc cập nhật một tài liệu.
 */
function saveUploadedDocument(documentData) {
    const documents = readUploadedDocuments();

    const index = documents.findIndex(
        (item) => item.id === documentData.id
    );

    if (index >= 0) {
        documents[index] = {
            ...documents[index],
            ...documentData,
        };
    } else {
        documents.push(documentData);
    }

    writeUploadedDocuments(documents);
}

/**
 * Lấy giá trị chuỗi từ FormData.
 */
function getFormValue(formData, key) {
    const value = formData.get(key);

    return typeof value === "string" ? value : "";
}

/**
 * Chuẩn hóa đường dẫn tài liệu.
 *
 * Ưu tiên URL do server trả về.
 * Nếu tài liệu nằm trên server nhưng thiếu URL,
 * thử tạo đường dẫn từ filename.
 */
function normalizeDocument(documentData) {
    if (!documentData || typeof documentData !== "object") return documentData;

    const document = { ...documentData };
    const filename = document.filename || document.fileName || document.storedFilename || "";
    let fileUrl = "";

    if (document.localOnly !== true && document.id && document.fileExists === true) {
        fileUrl = `/api/documents/${encodeURIComponent(document.id)}/file`;
    } else {
        const candidate = document.fileUrl || document.url || document.downloadUrl || document.fileURL || "";
        if (candidate) {
            try {
                const parsed = new URL(candidate, window.location.origin);
                if (parsed.origin === window.location.origin) {
                    fileUrl = `${parsed.pathname}${parsed.search}${parsed.hash}`;
                }
            } catch {
                fileUrl = "";
            }
        }
    }

    return {
        ...document,
        filename: filename || document.originalName || "",
        ...(fileUrl ? { url: fileUrl, fileUrl, downloadUrl: fileUrl } : {}),
    };
}

/**
 * Lấy danh sách tài liệu.
 *
 * Hàm đồng bộ để không phá vỡ những nơi đang sử dụng
 * getDocuments() hiện tại.
 */
export function getDocuments() {
    const merged = new Map();

    for (const documentData of SAMPLE_DOCS) {
        if (documentData?.id) {
            merged.set(
                documentData.id,
                normalizeDocument(documentData)
            );
        }
    }

    for (const documentData of readUploadedDocuments()) {
        if (documentData?.id) {
            merged.set(
                documentData.id,
                normalizeDocument({
                    ...(merged.get(documentData.id) || {}),
                    ...documentData,
                })
            );
        }
    }

    return [...merged.values()];
}

/**
 * Đồng bộ danh sách từ server.
 *
 * Gọi hàm này khi mở thư viện hoặc trang xem tài liệu.
 */
export async function refreshDocuments() {
    try {
        const response = await fetch(API_URL, {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
            headers: {
                Accept: "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(
                `Không thể tải danh sách tài liệu: HTTP ${response.status}`
            );
        }

        const payload = await response.json();

        const serverDocuments = Array.isArray(payload)
            ? payload
            : Array.isArray(payload.documents)
              ? payload.documents
              : Array.isArray(payload.data)
                ? payload.data
                : [];

        const localDocuments = readUploadedDocuments();
        const merged = new Map();

        /*
         * Giữ lại các bản ghi cục bộ.
         */
        for (const documentData of localDocuments) {
            if (documentData?.id && documentData.localOnly === true) {
                merged.set(documentData.id, documentData);
            }
        }

        /*
         * Dữ liệu mới nhất từ server được ưu tiên.
         */
        for (const documentData of serverDocuments) {
            if (documentData?.id) {
                const previous = merged.get(documentData.id) || {};

                merged.set(
                    documentData.id,
                    normalizeDocument({
                        ...previous,
                        ...documentData,
                        localOnly: false,
                    })
                );
            }
        }

        writeUploadedDocuments([...merged.values()]);

        return getDocuments();
    } catch (error) {
        console.error(
            "Không thể đồng bộ thư viện tài liệu:",
            error
        );

        /*
         * Nếu API gặp lỗi, vẫn trả về dữ liệu hiện có
         * để giao diện không bị mất toàn bộ danh sách.
         */
        return getDocuments();
    }
}

/**
 * Tải tài liệu lên server.
 */
export async function uploadDocument(formData) {
    const file = formData.get("document");

    if (!file || !file.name) {
        throw new Error("Vui lòng chọn tệp tài liệu.");
    }

    if (file.size > MAX_FILE_SIZE) {
        throw new Error(
            "Tệp quá lớn. Giới hạn tải lên là 20 MB."
        );
    }

    const metadata = {
        subject: getFormValue(formData, "subject"),
        grade: getFormValue(formData, "grade"),
        category: getFormValue(formData, "category"),
        title:
            getFormValue(formData, "title") || file.name,
        filename: file.name,
        originalName: file.name,
        description:
            `${file.name} · ${(file.size / 1024).toFixed(0)} KB`,
        sample: false,
        localOnly: false,
    };

    const response = await fetch(API_URL, {
        method: "POST",
        credentials: "same-origin",
        body: formData,
    });

    if (response.status === 404 || response.status === 405) {
        throw new Error("Document upload is not enabled on this server.");
    }

    if (!response.ok) {
        let message = "Không thể tải tệp lên máy chủ.";

        try {
            const payload = await response.json();

            if (payload.error) {
                message = payload.error;
            }
        } catch {
            // Giữ thông báo mặc định nếu server không trả JSON.
        }

        throw new Error(message);
    }

    let payload;

    try {
        payload = await response.json();
    } catch {
        throw new Error(
            "Máy chủ đã nhận yêu cầu nhưng không trả về JSON hợp lệ."
        );
    }

    /*
     * Hỗ trợ các cấu trúc phản hồi phổ biến.
     */
    if (payload.status === "pending") {
        return { ...payload, localOnly: false };
    }

    const serverDocument =
        payload.document ||
        payload.data?.document ||
        payload.data ||
        payload;

    if (
        !serverDocument ||
        typeof serverDocument !== "object"
    ) {
        throw new Error(
            "Máy chủ không trả về thông tin tài liệu hợp lệ."
        );
    }

    /*
     * Ghép metadata với dữ liệu server.
     * Giữ lại URL do server cung cấp.
     */
    const documentData = normalizeDocument({
        ...metadata,
        ...serverDocument,

        id:
            serverDocument.id ||
            serverDocument.documentId ||
            `upload-${Date.now()}`,

        subject:
            serverDocument.subject || metadata.subject,

        grade: String(
            serverDocument.grade || metadata.grade
        ),

        category:
            serverDocument.category || metadata.category,

        title:
            serverDocument.title || metadata.title,

        filename:
            serverDocument.filename ||
            serverDocument.fileName ||
            serverDocument.storedFilename ||
            metadata.filename,

        originalName:
            serverDocument.originalName ||
            metadata.originalName,

        localOnly: false,
    });

    saveUploadedDocument(documentData);

    return {
        ...payload,
        document: documentData,
        localOnly: false,
    };
}
