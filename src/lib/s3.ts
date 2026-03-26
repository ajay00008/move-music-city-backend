import { randomUUID } from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export async function createTeacherProfileImageUploadUrl(params: {
  teacherId: string;
  contentType: string;
  extension?: string;
}) {
  const region = requiredEnv('AWS_REGION');
  const bucket = requiredEnv('S3_BUCKET_NAME');
  const prefix = process.env.S3_PROFILE_IMAGES_PREFIX || 'teacher-profiles';
  const cleanExt = (params.extension || 'jpg').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'jpg';
  const key = `${prefix.replace(/\/$/, '')}/${params.teacherId}/${randomUUID()}.${cleanExt}`;

  const client = new S3Client({
    region,
    credentials: {
      accessKeyId: requiredEnv('AWS_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnv('AWS_SECRET_ACCESS_KEY'),
    },
  });

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: params.contentType,
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });
  const fileUrl = process.env.S3_PUBLIC_BASE_URL
    ? `${process.env.S3_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`
    : `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

  return { uploadUrl, fileUrl, key };
}
