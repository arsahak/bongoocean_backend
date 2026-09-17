import { createHash, randomUUID } from "crypto";
import { env } from "../config/env";
import { ApiError } from "./ApiError";

export interface CloudinaryUpload {
  url: string;
  publicId: string;
  resourceType: "image" | "video";
}

interface CloudinaryResponse {
  secure_url?: string;
  public_id?: string;
  resource_type?: "image" | "video";
  error?: { message?: string };
}

const signatureFor = (params: Record<string, string>) => {
  const value = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${key}=${item}`)
    .join("&");
  return createHash("sha1")
    .update(`${value}${env.cloudinary.apiSecret}`)
    .digest("hex");
};

const assertConfigured = () => {
  if (
    !env.cloudinary.cloudName ||
    !env.cloudinary.apiKey ||
    !env.cloudinary.apiSecret
  ) {
    throw new ApiError(500, "Cloudinary is not configured for attachments");
  }
};

export const uploadToCloudinary = async (
  file: Express.Multer.File,
  folder = "costing",
): Promise<CloudinaryUpload> => {
  assertConfigured();

  const timestamp = String(Math.floor(Date.now() / 1000));
  const publicId = randomUUID();
  const params = { folder, public_id: publicId, timestamp };
  const form = new FormData();
  form.append("api_key", env.cloudinary.apiKey);
  form.append("timestamp", timestamp);
  form.append("folder", folder);
  form.append("public_id", publicId);
  form.append("signature", signatureFor(params));
  form.append(
    "file",
    new Blob([file.buffer], { type: file.mimetype }),
    file.originalname,
  );

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${env.cloudinary.cloudName}/auto/upload`,
    { method: "POST", body: form },
  );
  const data = (await response.json()) as CloudinaryResponse;

  if (
    !response.ok ||
    !data.secure_url ||
    !data.public_id ||
    !data.resource_type
  ) {
    throw new ApiError(
      502,
      data.error?.message || "Failed to upload attachment",
    );
  }

  return {
    url: data.secure_url,
    publicId: data.public_id,
    resourceType: data.resource_type,
  };
};

export const deleteFromCloudinary = async (
  publicId?: string,
  resourceType: "image" | "video" = "image",
): Promise<void> => {
  if (!publicId) return;
  assertConfigured();

  const timestamp = String(Math.floor(Date.now() / 1000));
  const params = { public_id: publicId, timestamp };
  const form = new FormData();
  form.append("api_key", env.cloudinary.apiKey);
  form.append("timestamp", timestamp);
  form.append("public_id", publicId);
  form.append("signature", signatureFor(params));

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${env.cloudinary.cloudName}/${resourceType}/destroy`,
    { method: "POST", body: form },
  );
  if (!response.ok) {
    console.error("Failed to delete Cloudinary costing attachment", publicId);
  }
};
