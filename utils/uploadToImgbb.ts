import { randomUUID } from "crypto";
import { env } from "../config/env";

const IMGBB_UPLOAD_URL = "https://api.imgbb.com/1/upload";

interface ImgbbUploadResponse {
  data?: { url?: string };
  error?: { message?: string };
}

export const uploadToImgbb = async (
  file: Express.Multer.File,
  subfolder = ""
): Promise<string> => {
  const name = [subfolder.replace(/\//g, "-"), randomUUID()]
    .filter(Boolean)
    .join("-");

  const form = new FormData();
  form.append("key", env.imagebb.apiKey);
  form.append("image", file.buffer.toString("base64"));
  form.append("name", name);

  const response = await fetch(IMGBB_UPLOAD_URL, {
    method: "POST",
    body: form,
  });

  const data = (await response.json()) as ImgbbUploadResponse;

  if (!response.ok || !data?.data?.url) {
    throw new Error(data?.error?.message || "Failed to upload image to ImgBB");
  }

  return data.data.url;
};

// ImgBB's public API has no authenticated delete endpoint — only a one-time
// delete_url returned at upload time, which this app doesn't persist. There
// is nothing to call here; old images are simply left on ImgBB.
export const deleteFromImgbb = async (_fileUrl?: string): Promise<void> => {};
