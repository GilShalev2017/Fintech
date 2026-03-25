import amqplib, { ChannelModel, Channel, ConsumeMessage } from 'amqplib';
import { RabbitQueue } from '../types';

// ─────────────────────────────────────────────
// 🐰 RABBITMQ CONNECTION
// ─────────────────────────────────────────────
// amqplib is the standard Node.js AMQP client.
// We keep a single Connection and one Channel as module-level singletons.
//
// Connection vs Channel:
//   Connection = TCP socket to RabbitMQ (expensive to create)
//   Channel    = lightweight virtual connection multiplexed over the TCP socket
//   → Always reuse both; create new channels only for isolated consumers.

let connection: ChannelModel;  
let channel: Channel | null = null;

export const connectRabbitMQ = async (): Promise<void> => {
  connection = await amqplib.connect(
    process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
  );
  console.log('✅ RabbitMQ connected');

  channel = await connection.createChannel();

  // ── Queue declarations ─────────────────────────────────────────────────
  // assertQueue ensures the queue exists before we try to publish or consume.
  // durable: true → queue survives a RabbitMQ restart (persisted to disk).
  // If the queue already exists with the same options, this is a no-op.
  const queues: RabbitQueue[] = ['email.send', 'pdf.generate', 'notification.push'];
  for (const queue of queues) {
    await channel.assertQueue(queue, { durable: true });
  }
  console.log(`📄 RabbitMQ queues asserted: ${queues.join(', ')}`);

  // ── Connection error handling ──────────────────────────────────────────
  // 'close' fires when the broker closes the connection unexpectedly.
  // In production you'd add reconnect logic here; for dev, log and exit.
  connection.on('close', () => {
    console.error('❌ RabbitMQ connection closed');
  });

  connection.on('error', (err: Error) => {
    console.error('❌ RabbitMQ connection error:', err);
  });
};

// ─────────────────────────────────────────────
// 📤 QUEUE HELPERS
// ─────────────────────────────────────────────

export const rabbitHelper = {

  // ── Publish ────────────────────────────────────────────────────────────
  // sendToQueue delivers a message to a specific named queue.
  // persistent: true → message survives a RabbitMQ restart (written to disk).
  //   Pair with durable:true queue for guaranteed delivery.
  // Buffer.from(JSON.stringify()) — AMQP messages are binary; we serialise to JSON.
  async publish<T>(queue: RabbitQueue, payload: T): Promise<boolean> {
    if (!channel) {
      console.warn('⚠️  RabbitMQ channel not available — message not sent');
      return false;
    }
    try {
      channel.sendToQueue(
        queue,
        Buffer.from(JSON.stringify(payload)),
        { persistent: true },
      );
      return true;
    } catch (err) {
      console.error('❌ RabbitMQ publish error:', err);
      return false;
    }
  },

  // ── Consume ────────────────────────────────────────────────────────────
  // Sets up a worker that processes messages from a queue one at a time.
  //
  // prefetch(1): tells RabbitMQ to send only 1 unacknowledged message at a time.
  //   Without this, RabbitMQ dumps all queued messages to this consumer at once,
  //   overloading it. This is the standard "fair dispatch" pattern.
  //
  // channel.ack(msg): acknowledges successful processing — RabbitMQ removes the msg.
  // channel.nack(msg, false, true): negative-ack → requeues on failure so another
  //   worker can retry. The 3rd arg (requeue:true) prevents infinite loops only
  //   if you add a dead-letter queue in production.
  async consume<T>(
    queue: RabbitQueue,
    handler: (payload: T) => Promise<void>,
  ): Promise<void> {
    if (!channel) throw new Error('RabbitMQ channel not initialised');

    await channel.prefetch(1);

    await channel.consume(queue, async (msg) => {
      if (!msg) return;
      try {
        const payload = JSON.parse(msg.content.toString()) as T;
        await handler(payload);
        channel!.ack(msg);
      } catch (err) {
        console.error(`❌ RabbitMQ handler error on queue [${queue}]:`, err);
        // nack + requeue: message goes back to the queue for retry
        channel!.nack(msg, false, true);
      }
    });
  },
};

export const getRabbitChannel = (): Channel | null => channel;
export default connectRabbitMQ;