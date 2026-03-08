import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';

const s3 = new S3Client({});
const BUCKET_NAME = process.env.BUCKET_NAME!;
const MODE = process.env.MODE ?? 'Deployed';

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
  type: 'normal' | 'hazard';
}

const CAMERA_IMAGE_CONFIG: CameraImageConfig[] = [
  { sourceFile: 'camera-1-normal.jpg', cameraId: 'camera-1', uploadChancePercent: 7, type: 'normal' },
  { sourceFile: 'camera-1-aircraft.jpg', cameraId: 'camera-1', uploadChancePercent: 3, type: 'normal' },
  { sourceFile: 'camera-1-birds.jpg', cameraId: 'camera-1', uploadChancePercent: 1, type: 'hazard' },
  { sourceFile: 'camera-1-vehicle.jpg', cameraId: 'camera-1', uploadChancePercent: 1, type: 'hazard' },
  { sourceFile: 'camera-2-normal.jpg', cameraId: 'camera-2', uploadChancePercent: 10, type: 'normal' },
  { sourceFile: 'camera-2-drone.jpg', cameraId: 'camera-2', uploadChancePercent: 1, type: 'hazard' },
  { sourceFile: 'camera-3-normal.jpg', cameraId: 'camera-3', uploadChancePercent: 10, type: 'normal' },
  { sourceFile: 'camera-3-debris.jpg', cameraId: 'camera-3', uploadChancePercent: 1, type: 'hazard' },
];

export const handler = async (): Promise<void> => {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const timestamp = now.toISOString().replace(/[:.]/g, '-');

  const imagesDir = MODE === 'Local' ? path.join(__dirname, '..', 'resources', 'camera-images') : path.join(__dirname, 'files');

  // Group configs by camera so each camera uploads at most 1 image per run
  const configsByCamera = new Map<string, CameraImageConfig[]>();
  for (const config of CAMERA_IMAGE_CONFIG) {
    const group = configsByCamera.get(config.cameraId) ?? [];
    group.push(config);
    configsByCamera.set(config.cameraId, group);
  }

  const uploads: Promise<void>[] = [];

  for (const [cameraId, configs] of configsByCamera) {
    // Sum all upload chances for this camera to decide whether to upload at all
    const totalChance = configs.reduce((sum, c) => sum + c.uploadChancePercent, 0);
    const roll = Math.random() * 100;

    if (roll > totalChance) {
      console.log(`Skipping ${cameraId} (rolled ${roll.toFixed(1)}, needed <= ${totalChance})`);
      continue;
    }

    // Pick one image weighted by uploadChancePercent
    let pick = Math.random() * totalChance;
    let selected = configs[0];
    for (const config of configs) {
      pick -= config.uploadChancePercent;
      if (pick <= 0) {
        selected = config;
        break;
      }
    }

    const key = `${cameraId}/${yyyy}/${mm}/${dd}/${cameraId}-${timestamp}.jpg`;
    const filePath = path.join(imagesDir, selected.sourceFile);
    const body = fs.readFileSync(filePath);

    console.log(`Uploading ${key} for ${cameraId} (source: ${selected.sourceFile}, type: ${selected.type})`);

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
