import { applyCors, handlePreflight, requireManagedAccess } from "../_lib/managed.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  applyCors(req, res);

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!requireManagedAccess(req, res)) return;

  return res.status(200).json({
    ok: true,
    user: req.hrPomoshnikUser,
    service: "HR Pomoshnik",
  });
}
