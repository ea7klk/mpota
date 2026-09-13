import { Injectable } from '@nestjs/common';
import { CreateBucketCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

@Injectable()
export class StorageService {
  private readonly bucket = process.env.S3_BUCKET ?? 'mpota';
  private readonly client = new S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? 'minio', secretAccessKey: process.env.S3_SECRET_KEY ?? 'minio123' }
  });

  async put(key: string, body: Buffer, contentType: string) {
    try { await this.client.send(new HeadBucketCommand({ Bucket: this.bucket })); }
    catch { await this.client.send(new CreateBucketCommand({ Bucket: this.bucket })); }
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
    return key;
  }
}
