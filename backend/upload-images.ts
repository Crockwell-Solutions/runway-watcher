import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';

const s3 = new S3Client({});
const BUCKET_NAME = process.env.BUCKET_NAME!;

/**
 * Configuration for each camera image source.
 * - sourceFile: filename in the bundled camera-images directory
 * - cameraId: which camera this image belongs to
 * - uploadChancePercent: probability (0-100) of uploading on each run
 */
interface CameraImageConfig {
  sourceFile: string;
  cameraId: string;
  uploadChancePercent: number;
}

const CAMERA_IMAGE_CONFIG: CameraImageConfig[] = [
  { sourceFile: 'camera-1-normal.jpg', cameraId: 'camera-1', uploadChancePercent: 10 },
  { sourceFile: 'camera-2-normal.jpg', cameraId: 'camera-2', uploadChancePercent: 10 },
  { sourceFile: 'camera-3-normal.jpg', cameraId: 'camera-3', uploadChancePercent: 10 },
];

export const handler = async (): Promise<void> => {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const timestamp = now.toISOString().replace(/[:.]/g, '-');

  const imagesDir = path.join(__dirname, 'files');

  const uploads: Promise<void>[] = [];

  for (const config of CAMERA_IMAGE_CONFIG) {
    const roll = Math.random() * 100;
    if (roll > config.uploadChancePercent) {
      console.log(`Skipping ${config.cameraId} (rolled ${roll.toFixed(1)}, needed <= ${config.uploadChancePercent})`);
      continue;
    }

    const key = `${config.cameraId}/${yyyy}/${mm}/${dd}/${config.cameraId}-${timestamp}.jpg`;
    const filePath = path.join(imagesDir, config.sourceFile);
    const body = fs.readFileSync(filePath);

    console.log(`Uploading ${key} for ${config.cameraId}`);

    uploads.push(
      s3.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: body,
        ContentType: 'image/jpeg',
      })).then(() => {
        console.log(`Successfully uploaded ${key}`);
      }),
    );
  }

  await Promise.all(uploads);
  console.log(`Upload run complete. ${uploads.length} image(s) uploaded.`);
};
