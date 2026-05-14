const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { v4: uuidv4 } = require("uuid");

const s3 = new S3Client({ region: process.env.AWS_REGION || "eu-west-1" });
const BUCKET = process.env.S3_AVATAR_BUCKET;

/**
 * Generate a presigned PUT URL for direct browser-to-S3 upload.
 * The frontend uses this URL to upload the file directly —
 * the backend never handles the file bytes.
 *
 * This pattern means:
 * - No large file passing through ECS tasks
 * - No extra memory pressure on containers
 * - Standard production pattern (used by Slack, Notion, etc.)
 */
async function getPresignedUploadUrl(username, contentType) {
  if (!BUCKET) throw new Error("S3_AVATAR_BUCKET not configured");

  const ext      = contentType === "image/png" ? "png" : "jpg";
  const key      = `avatars/${username}/${uuidv4()}.${ext}`;
  const command  = new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    ContentType: contentType
  });

  const url = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 min
  const publicUrl = `https://${BUCKET}.s3.amazonaws.com/${key}`;

  return { uploadUrl: url, publicUrl, key };
}

async function deleteAvatar(key) {
  if (!BUCKET || !key) return;
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (err) {
    // Non-fatal — log and continue
  }
}

module.exports = { getPresignedUploadUrl, deleteAvatar };
