import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { Fault, requireRole } from "./domain.mjs";
export function validateMedia(input) {
  if (
    !["image/jpeg", "image/png", "image/webp", "video/mp4"].includes(input.mime)
  )
    throw new Fault(422, "Use JPEG, PNG, WebP or MP4.");
  if (
    typeof input.name !== "string" ||
    !input.name.trim() ||
    input.name.length > 200 ||
    typeof input.data !== "string"
  )
    throw new Fault(422, "Invalid file.");
  const bytes = Buffer.from(input.data, "base64");
  if (!bytes.length || bytes.length > 20000000)
    throw new Fault(422, "Use a file under 20 MB.");
  const valid =
    input.mime === "image/jpeg"
      ? bytes[0] === 255 && bytes[1] === 216
      : input.mime === "image/png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : input.mime === "image/webp"
          ? bytes.toString("ascii", 0, 4) === "RIFF" &&
            bytes.toString("ascii", 8, 12) === "WEBP"
          : bytes.toString("ascii", 4, 8) === "ftyp";
  if (!valid) throw new Fault(422, "The file contents do not match its type.");
  return bytes;
}
export function createMediaService({ transaction, membership, storage }) {
  const bucket = storage.from("scheduly-media");
  return {
    async upload(user, input) {
      const bytes = validateMedia(input),
        id = randomUUID();
      // Object paths use server identifiers, never a supplied filename or URL.
      const path = `${encodeURIComponent(input.clientId)}/${id}`;
      let uploaded = false;
      try {
        await transaction(async (c) => {
          requireRole(await membership(c, user, input.clientId), [
            "editor",
            "manager",
          ]);
          const { error } = await bucket.upload(path, bytes, {
            contentType: input.mime,
            upsert: false,
          });
          if (error)
            throw new Fault(
              502,
              "Media storage is temporarily unavailable. Please retry.",
            );
          uploaded = true;
          await c.query(
            "INSERT INTO scheduly.media(id,client_id,name,mime,size) VALUES($1,$2,$3,$4,$5)",
            [id, input.clientId, input.name, input.mime, bytes.length],
          );
        });
      } catch (error) {
        if (uploaded) {
          const removed = await bucket.remove([path]);
          if (removed.error)
            console.error(
              "Media cleanup failed; private orphan requires reconciliation.",
            );
        }
        throw error;
      }
      const { data, error } = await bucket.createSignedUrl(path, 300);
      // The committed asset remains reusable even if preview signing is temporarily unavailable.
      return {
        id,
        url: error ? null : data.signedUrl,
        expiresAt: Date.now() + 300000,
      };
    },
    async previews(assets) {
      if (!assets.length) return assets;
      const paths = assets.map(
        (a) => `${encodeURIComponent(a.client_id)}/${a.id}`,
      );
      const { data, error } = await bucket.createSignedUrls(paths, 300);
      if (error)
        return assets.map((asset) => ({
          ...asset,
          url: null,
          previewUnavailable: true,
        }));
      const urls = new Map(data.map((a) => [a.path, a.signedUrl]));
      return assets.map((asset, index) => ({
        ...asset,
        url: urls.get(paths[index]) || null,
        expiresAt: Date.now() + 300000,
      }));
    },
  };
}
