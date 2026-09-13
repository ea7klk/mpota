import { Injectable } from '@nestjs/common';
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

@Injectable()
export class StorageService {
  private readonly bucket = process.env.S3_BUCKET ?? 'mpota';
  private readonly client = new S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? 'minio', secretAccessKey: process.env.S3_SECRET_KEY ?? 'minio123' }
  });

  async put(key: string, body: Buffer, contentType: string, bucket = this.bucket) {
    await this.ensureBucket(bucket);
    await this.client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
    return key;
  }

  async get(key: string, bucket = this.bucket) {
    const result = await this.client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!result.Body) throw new Error('Stored object has no content');
    return {
      body: Buffer.from(await result.Body.transformToByteArray()),
      contentType: result.ContentType ?? 'application/octet-stream',
      contentLength: result.ContentLength
    };
  }

  async delete(key: string, bucket = this.bucket) {
    await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  private async ensureBucket(bucket: string) {
    try { await this.client.send(new HeadBucketCommand({ Bucket: bucket })); }
    catch { await this.client.send(new CreateBucketCommand({ Bucket: bucket })); }
  }
}
