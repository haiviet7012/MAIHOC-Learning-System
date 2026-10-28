import { parseQuestionText } from "./question-parser.js";

const workerUrl = "/vendor/pdfjs/pdf.worker.mjs";
let mountSequence = 0;

export async function mountPdfReader(container, url) {
    if (!container || !url || container.dataset.pdfMounted === "true") return;
    container.dataset.pdfMounted = "true";
    const mountId = String(++mountSequence);
    container.dataset.pdfMountId = mountId;
    container.innerHTML = `<div class="pdf-reader-toolbar"><strong>Đang tải PDF…</strong></div><div class="pdf-document-scroll" aria-label="Nội dung tài liệu PDF"><p class="muted">Đang tải tài liệu…</p></div>`;

    try {
        const pdfjs = await import("/vendor/pdfjs/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const loadingTask = pdfjs.getDocument({
            url,
            withCredentials: true,
            enableScripting: false,
            cMapUrl: "/vendor/pdfjs/cmaps/",
            cMapPacked: true,
            standardFontDataUrl: "/vendor/pdfjs/standard_fonts/",
            wasmUrl: "/vendor/pdfjs/wasm/"
        });
        const pdf = await loadingTask.promise;
        if (!container.isConnected || container.dataset.pdfMountId !== mountId) {
            await loadingTask.destroy();
            return;
        }

        const toolbar = container.querySelector(".pdf-reader-toolbar");
        const scroll = container.querySelector(".pdf-document-scroll");
        toolbar.innerHTML = `<strong>PDF</strong><span>${pdf.numPages} trang · cuộn trong tài liệu để đọc</span><a href="${url}" target="_blank" rel="noopener noreferrer">Mở PDF mới</a>`;
        scroll.replaceChildren();

        const entries = [];
        const questionText = [];
        const shouldReadQuestions = container.dataset.questionSource === "true";
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
            const page = await pdf.getPage(pageNumber);
            if (shouldReadQuestions) {
                const textContent = await page.getTextContent();
                questionText.push(textContent.items.map(item => `${item.str}${item.hasEOL ? "\n" : " "}`).join(""));
            }
            const baseViewport = page.getViewport({ scale: 1 });
            const slot = document.createElement("div");
            slot.className = "pdf-page-slot";
            slot.dataset.pageNumber = String(pageNumber);
            slot.setAttribute("aria-label", `Trang ${pageNumber}`);
            scroll.append(slot);
            entries.push({ page, baseViewport, slot, renderTask: null, rendered: false });
        }

        const resizeEntry = entry => {
            const availableWidth = Math.max(180, scroll.clientWidth - 32);
            const scale = availableWidth / entry.baseViewport.width;
            const viewport = entry.page.getViewport({ scale });
            entry.viewport = viewport;
            entry.slot.style.width = `${viewport.width}px`;
            entry.slot.style.height = `${viewport.height}px`;
        };

        const renderEntry = async entry => {
            if (!container.isConnected || entry.renderTask) return;
            resizeEntry(entry);
            const viewport = entry.viewport;
            const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
            const canvas = document.createElement("canvas");
            canvas.width = Math.ceil(viewport.width * pixelRatio);
            canvas.height = Math.ceil(viewport.height * pixelRatio);
            canvas.style.width = `${viewport.width}px`;
            canvas.style.height = `${viewport.height}px`;
            entry.slot.replaceChildren(canvas);
            const task = entry.page.render({
                canvasContext: canvas.getContext("2d", { alpha: false }),
                viewport,
                transform: pixelRatio === 1 ? null : [pixelRatio, 0, 0, pixelRatio, 0, 0],
                background: "#ffffff"
            });
            entry.renderTask = task;
            try {
                await task.promise;
                entry.rendered = true;
            } catch (error) {
                if (error?.name !== "RenderingCancelledException") throw error;
            } finally {
                if (entry.renderTask === task) entry.renderTask = null;
            }
        };

        entries.forEach(resizeEntry);
        scroll.dataset.pdfReady = "true";
        requestAnimationFrame(() => container.dispatchEvent(new Event("pdf-reader-ready", { bubbles: true })));
        const observer = new IntersectionObserver(changes => {
            for (const change of changes) {
                const entry = entries[Number(change.target.dataset.pageNumber) - 1];
                if (change.isIntersecting) {
                    renderEntry(entry).catch(error => showPdfError(container, url, error));
                } else if (entry.rendered && !entry.renderTask && Math.abs(change.boundingClientRect.top) > scroll.clientHeight * 3) {
                    entry.slot.replaceChildren();
                    entry.rendered = false;
                }
            }
        }, { root: scroll, rootMargin: "150% 0px" });
        entries.forEach(entry => observer.observe(entry.slot));

        const resizeObserver = new ResizeObserver(() => {
            for (const entry of entries) {
                resizeEntry(entry);
                if (entry.rendered && !entry.renderTask) {
                    entry.rendered = false;
                    entry.slot.replaceChildren();
                    if (entry.slot.getBoundingClientRect().bottom >= scroll.getBoundingClientRect().top - scroll.clientHeight
                        && entry.slot.getBoundingClientRect().top <= scroll.getBoundingClientRect().bottom + scroll.clientHeight) {
                        renderEntry(entry).catch(error => showPdfError(container, url, error));
                    }
                }
            }
        });
        resizeObserver.observe(scroll);
        container._pdfCleanup = () => {
            observer.disconnect();
            resizeObserver.disconnect();
            for (const entry of entries) entry.renderTask?.cancel();
            loadingTask.destroy();
        };
        const readerRoot = container.closest("#reader-layout");
        readerRoot?.addEventListener("maihoc-reader-leaving", () => container._pdfCleanup?.(), { once: true });
        return { questions: shouldReadQuestions ? parseQuestionText(questionText.join("\n")) : [] };
    } catch (error) {
        showPdfError(container, url, error);
        return { questions: [], error };
    }
}

function showPdfError(container, url, error) {
    if (!container?.isConnected) return;
    console.error("Could not render PDF:", error);
    const link = document.createElement("a");
    link.className = "button primary";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Mở PDF trong tab mới";
    const fallback = document.createElement("div");
    fallback.className = "empty-state";
    fallback.innerHTML = "<h3>Không mở được PDF</h3><p>Trình đọc PDF gặp lỗi. Bạn vẫn có thể mở tệp trong tab mới.</p>";
    fallback.append(link);
    container.replaceChildren(fallback);
}
