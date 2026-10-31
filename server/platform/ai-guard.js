import { hasActiveExam } from "./policy.js";
export function aiExamGuard(db) {
  return (req, res, next) => {
    if (
      process.env.MAIHOC_PLATFORM_ENABLED !== "1" ||
      !req.user?.id ||
      req.method !== "POST"
    )
      return next();
    Promise.resolve()
      .then(async () => {
        if (await hasActiveExam(db, req.user.id))
          return res.status(403).json({
            error:
              "Gia sư AI tạm dừng khi bạn đang làm bài kiểm tra. Bạn có thể quay lại sau khi nộp bài.",
          });
        next();
      })
      .catch(() =>
        res.status(503).json({
          error: "Chưa thể xác minh trạng thái kiểm tra. Vui lòng thử lại sau.",
        }),
      );
  };
}
