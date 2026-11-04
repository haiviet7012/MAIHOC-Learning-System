export async function purgeExpiredLearningAdvisorMessages(db) {
  return db.query(
    "DELETE FROM learning_advisor_messages WHERE created_at <= now()-interval '24 hours'",
  );
}
export function createLearningAdvisorRetentionWorker(
  db,
  { intervalMs = 60_000, onError = (error) => console.warn("[Learning advisor retention]", error.message) } = {},
) {
  let timer = null;
  const drain = () => purgeExpiredLearningAdvisorMessages(db).catch(onError);
  return {
    drain,
    start() {
      if (timer) return;
      void drain();
      timer = setInterval(() => void drain(), intervalMs);
      timer.unref?.();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
