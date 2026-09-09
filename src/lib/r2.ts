import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import https from 'https';
import { env } from '../config/env';

// Keep-alive agent to prevent ECONNRESET on large image uploads
const keepAliveAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30_000,
  maxSockets: 50,
});

// Initialize S3 Client configured for Cloudflare R2
export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
  // 5 attempts with exponential backoff handles transient R2 502/ECONNRESET errors
  maxAttempts: 5,
  requestHandler: new NodeHttpHandler({
    httpsAgent: keepAliveAgent,
    // 2-minute socket timeout — enough for large studio PNGs
    requestTimeout: 120_000,
    connectionTimeout: 10_000,
  }),
});

export class R2StorageService {
  private bucket: string;

  constructor(bucketName: string = env.R2_BUCKET_NAME) {
    this.bucket = bucketName;
  }

  /**
   * Generates a presigned URL for direct client PUT uploads to Cloudflare R2.
   */
  async createPresignedUploadUrl(
    key: string,
    contentType: string = 'image/jpeg',
    expiresIn: number = 3600
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    return getSignedUrl(r2Client, command, { expiresIn });
  }

  /**
   * Generates a presigned GET URL for secure, temporary client downloads.
   */
  async createPresignedDownloadUrl(
    key: string,
    expiresIn: number = 3600
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(r2Client, command, { expiresIn });
  }

  /**
   * Directly uploads a binary buffer to Cloudflare R2.
   */
  async uploadObject(
    key: string,
    body: Buffer | Uint8Array | string,
    contentType: string = 'image/jpeg',
    metadata?: Record<string, string>
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata,
    });

    await r2Client.send(command);
    return key;
  }

  /**
   * Directly downloads an object from Cloudflare R2 as a Buffer.
   */
  async downloadObject(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await r2Client.send(command);
    if (!response.Body) {
      throw new Error(`R2 download error: Object ${key} has empty body.`);
    }

    const byteArray = await response.Body.transformToByteArray();
    return Buffer.from(byteArray);
  }

  /**
   * Checks if an object exists in Cloudflare R2.
   */
  async objectExists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      await r2Client.send(command);
      return true;
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      // Re-throw if authentication or network problem
      throw err;
    }
  }

  /**
   * Deletes an object from Cloudflare R2.
   */
  async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await r2Client.send(command);
  }

  /**
   * Returns a publicly accessible URL if R2_PUBLIC_URL is configured,
   * otherwise returns a signed download URL.
   */
  async getAccessUrl(key: string, expiresIn: number = 3600): Promise<string> {
    if (env.R2_PUBLIC_URL) {
      const baseUrl = env.R2_PUBLIC_URL.replace(/\/+$/, '');
      return `${baseUrl}/${key}`;
    }
    return this.createPresignedDownloadUrl(key, expiresIn);
  }
}

export const r2 = new R2StorageService();
