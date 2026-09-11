import crypto from "node:crypto";
import { del, get, list, put } from "@vercel/blob";

const PRIVATE_ACCESS = "private";

export function storageUserKey(user) {
  return crypto.createHash("sha256").update(String(user || "anonymous"), "utf8").digest("hex").slice(0, 24);
}

export async function probePrivateStore() {
  try {
    await list({ prefix: "hrp-health/", limit: 1 });
    return true;
  } catch (_error) {
    return false;
  }
}

export async function readJson(pathname, fallback = null) {
  try {
    const result = await get(pathname, { access: PRIVATE_ACCESS, useCache: false });
    if (!result || result.statusCode === 404) return fallback;
    const text = await new Response(result.stream).text();
    return text ? JSON.parse(text) : fallback;
  } catch (error) {
    if (String(error?.message || "").toLowerCase().includes("not found")) return fallback;
    throw error;
  }
}

export async function writeJson(pathname, value) {
  const text = JSON.stringify(value);
  return put(pathname, text, {
    access: PRIVATE_ACCESS,
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json; charset=utf-8",
  });
}

export async function deleteBlob(pathname) {
  return del(pathname);
}

export async function listAll(prefix, pageSize = 1000) {
  const blobs = [];
  let cursor;
  let hasMore = true;
  while (hasMore) {
    const page = await list({ prefix, limit: pageSize, cursor });
    blobs.push(...(page.blobs || []));
    hasMore = Boolean(page.hasMore);
    cursor = page.cursor;
    if (!cursor) break;
  }
  return blobs;
}

export function storageErrorMessage(error) {
  const message = String(error?.message || error || "").trim();
  if (!message) return "Серверное хранилище недоступно";
  return message.slice(0, 300);
}
