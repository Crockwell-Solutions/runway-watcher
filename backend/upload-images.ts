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
  type: 'normal' | 'hazard';
}

const CAMERA_IMAGE_CONFIG: CameraImageConfig[] = [
  { sourceFile: 'camera-1-normal.jpeg', cameraId: 'camera-1', uploadChancePercent: 7, type: 'normal' },
  { sourceFile: 'camera-1-aircraft.jpeg', cameraId: 'camera-1', uploadChancePercent: 3, type: 'normal' },
  { sourceFile: 'camera-1-birds.jpeg', cameraId: 'camera-1', uploadChancePercent: 1, type: 'hazard' },
  { sourceFile: 'camera-1-vehicle.jpeg', cameraId: 'camera-1', uploadChancePercent: 1, type: 'hazard' },
  { sourceFile: 'camera-2-normal.jpeg', cameraId: 'camera-2', uploadChancePercent: 10, type: 'normal' },
  { sourceFile: 'camera-2-drone-large.jpeg', cameraId: 'camera-2', uploadChancePercent: 2, type: 'hazard' },
  { sourceFile: 'camera-3-normal.jpeg', cameraId: 'camera-3', uploadChancePercent: 10, type: 'normal' },
  { sourceFile: 'camera-3-debris-large.jpeg', cameraId: 'camera-3', uploadChancePercent: 2, type: 'hazard' },
];

interface UploadEvent {
  type?: 'hazard' | 'initiate';
  body?: string;
  httpMethod?: string;
}

interface ApiResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

export const handler = async (event?: UploadEvent): Promise<void | ApiResponse> => {
  const isApiRequest = !!event?.httpMethod;

  // If called via API Gateway, parse the type from the POST body
  let effectiveType = event?.type;
  if (isApiRequest && event?.body) {
    try {
      const parsed = JSON.parse(event.body);
      effectiveType = parsed.type;
    } catch {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON body' }) };
    }
  }
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const timestamp = now.toISOString().replace(/[:.]/g, '-');

  const imagesDir = path.join(__dirname, 'files');

  // If triggered with {"type": "hazard"}, upload exactly one random hazard image
  if (effectiveType === 'hazard') {
    const hazardConfigs = CAMERA_IMAGE_CONFIG.filter(c => c.type === 'hazard');
    const selected = hazardConfigs[Math.floor(Math.random() * hazardConfigs.length)];

    const key = `${selected.cameraId}/${yyyy}/${mm}/${dd}/${selected.cameraId}-${timestamp}.jpeg`;
    const filePath = path.join(imagesDir, selected.sourceFile);
    const body = fs.readFileSync(filePath);

    console.log(`Hazard trigger: uploading ${key} (source: ${selected.sourceFile})`);
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: 'image/jpeg',
    }));
    console.log(`Successfully uploaded hazard image ${key}`);
    if (isApiRequest) return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Hazard simulation triggered' }) };
    return;
  }

  // If triggered with {"type": "initiate"}, upload the first normal image for every camera
  if (effectiveType === 'initiate') {
    const seen = new Set<string>();
    const initiateUploads: Promise<void>[] = [];

    for (const config of CAMERA_IMAGE_CONFIG) {
      if (config.type !== 'normal' || seen.has(config.cameraId)) continue;
      seen.add(config.cameraId);

      const key = `${config.cameraId}/${yyyy}/${mm}/${dd}/${config.cameraId}-${timestamp}.jpeg`;
      const filePath = path.join(imagesDir, config.sourceFile);
      const body = fs.readFileSync(filePath);

      console.log(`Initiate: uploading ${key} (source: ${config.sourceFile})`);
      initiateUploads.push(
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

    await Promise.all(initiateUploads);
    console.log(`Initiate complete. ${initiateUploads.length} image(s) uploaded.`);
    if (isApiRequest) return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'Feed initiation triggered' }) };
    return;
  }

  // Normal scheduled run: group by camera, upload at most 1 image per camera
  const configsByCamera = new Map<string, CameraImageConfig[]>();
  for (const config of CAMERA_IMAGE_CONFIG) {
    const group = configsByCamera.get(config.cameraId) ?? [];
    group.push(config);
    configsByCamera.set(config.cameraId, group);
  }

  const uploads: Promise<void>[] = [];

  for (const [cameraId, configs] of configsByCamera) {
    const totalChance = configs.reduce((sum, c) => sum + c.uploadChancePercent, 0);
    const roll = Math.random() * 100;

    if (roll > totalChance) {
      console.log(`Skipping ${cameraId} (rolled ${roll.toFixed(1)}, needed <= ${totalChance})`);
      continue;
    }

    let pick = Math.random() * totalChance;
    let selected = configs[0];
    for (const config of configs) {
      pick -= config.uploadChancePercent;
      if (pick <= 0) {
        selected = config;
        break;
      }
    }

    const key = `${cameraId}/${yyyy}/${mm}/${dd}/${cameraId}-${timestamp}.jpeg`;
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
