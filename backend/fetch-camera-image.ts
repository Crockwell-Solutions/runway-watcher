import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({});

/**
 * Bedrock Agent action group Lambda.
 *
 * Returns camera image metadata and a presigned URL from S3
 * for the hazard assessment agent.
 */
export const handler = async (event: {
  actionGroup: string;
  function: string;
  parameters: Array<{ name: string; value: string }>;
  messageVersion: string;
}) => {
  const params = Object.fromEntries(
    event.parameters.map((p) => [p.name, p.value]),
  );

  const bucketName = params.bucketName;
  const imageKey = params.imageKey;

  if (!bucketName || !imageKey) {
    return {
      messageVersion: event.messageVersion,
      response: {
        actionGroup: event.actionGroup,
        function: event.function,
        functionResponse: {
          responseBody: {
            TEXT: {
              body: JSON.stringify({ error: 'bucketName and imageKey are required' }),
            },
          },
        },
      },
    };
  }

  const [head, presignedUrl] = await Promise.all([
    s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: imageKey })),
    getSignedUrl(s3, new GetObjectCommand({ Bucket: bucketName, Key: imageKey }), { expiresIn: 900 }),
  ]);

  const ext = imageKey.split('.').pop()?.toLowerCase() ?? 'jpg';
  const cameraId = imageKey.split('/')[0] ?? 'unknown';

  return {
    messageVersion: event.messageVersion,
    response: {
      actionGroup: event.actionGroup,
      function: event.function,
      functionResponse: {
        responseBody: {
          TEXT: {
            body: JSON.stringify({
              imageKey,
              cameraId,
              presignedUrl,
              contentType: head.ContentType ?? (ext === 'png' ? 'image/png' : 'image/jpeg'),
              sizeBytes: head.ContentLength ?? 0,
              lastModified: head.LastModified?.toISOString() ?? 'unknown',
            }),
          },
        },
      },
    },
  };
};
