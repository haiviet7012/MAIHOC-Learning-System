import { storage } from "./documents.js";
import { livekitConfigured, livekitServices } from "../study-rooms/school.js";
// Run with the beta worker; a private R2 lifecycle rule remains a useful second guard.
export async function maintainSchoolAssets(
  db,
  { store = storage, services = livekitServices } = {},
) {
  const pending = (
    await db.query(
      "SELECT object_key FROM school_asset_deletions ORDER BY created_at LIMIT 10",
    )
  ).rows;
  for (const asset of pending) {
    await store.delete(asset.object_key);
    await db.query("DELETE FROM school_asset_deletions WHERE object_key=$1", [
      asset.object_key,
    ]);
  }
  const expired = (
    await db.query(
      "SELECT id,object_key FROM school_room_recordings WHERE expires_at<=now() AND status NOT IN ('expired','starting','recording','stopping','processing') LIMIT 10",
    )
  ).rows;
  for (const record of expired) {
    await store.delete(record.object_key);
    await db.query(
      "UPDATE school_room_recordings SET status='expired' WHERE id=$1",
      [record.id],
    );
  }
  if (livekitConfigured()) {
    const live = (
      await db.query(
        "SELECT * FROM school_room_recordings WHERE egress_id IS NOT NULL AND status IN ('starting','recording','stopping','processing') ORDER BY created_at LIMIT 20",
      )
    ).rows;
    for (const record of live) {
      const svc = services();
      const info = (
        await svc.egress.listEgress({ egressId: record.egress_id })
      )[0];
      if (!info) continue;
      if (info.status === 3 || info.status >= 4) {
        await db.query(
          "UPDATE school_room_recordings SET status=$2 WHERE id=$1",
          [record.id, info.status === 3 ? "ready" : "failed"],
        );
        continue;
      }
      if (
        Date.now() - new Date(record.created_at).getTime() > 30 * 60 * 1000 &&
        info.status <= 1
      ) {
        await svc.egress.stopEgress(record.egress_id);
        await db.query(
          "UPDATE school_room_recordings SET status='processing' WHERE id=$1",
          [record.id],
        );
      }
    }
  }
  await db.query(
    "DELETE FROM school_room_ai_requests WHERE created_at<now()-interval '30 days'",
  );
  await db.query(
    "DELETE FROM school_room_messages WHERE created_at<now()-interval '30 days'",
  );
}
