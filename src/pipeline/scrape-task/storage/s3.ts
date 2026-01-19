import { PutObjectCommand } from '@aws-sdk/client-s3';
import { gzipSync } from 'zlib';
import { s3Client } from '../config.js';

/**
 * Upload data to S3 as gzipped JSON
 */
export async function uploadToS3(
  bucket: string,
  key: string,
  data: object
): Promise<void> {
  const json = JSON.stringify(data);
  const compressed = gzipSync(Buffer.from(json), { level: 9 });
  
  await s3Client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: compressed,
    ContentType: 'application/json',
    ContentEncoding: 'gzip',
  }));
}
