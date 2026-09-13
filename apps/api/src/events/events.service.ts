import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { connect, NatsConnection, StringCodec } from 'nats';

@Injectable()
export class EventsService implements OnModuleDestroy {
  private connection?: NatsConnection;
  private readonly codec = StringCodec();

  async publish(subject: string, payload: Record<string, unknown>) {
    if (!process.env.NATS_URL) return;
    try {
      this.connection ??= await connect({ servers: process.env.NATS_URL });
      this.connection.publish(subject, this.codec.encode(JSON.stringify(payload)));
    } catch {
      // Events are best-effort in local development; the database remains authoritative.
    }
  }

  async onModuleDestroy() { await this.connection?.drain(); }
}
