import { PubSub } from '@google-cloud/pubsub';
import { Logger, OnModuleDestroy } from '@nestjs/common';

export class PubSubService implements OnModuleDestroy {
  private readonly logger = new Logger(PubSubService.name);
  private readonly client: PubSub;

  constructor(params?: { gcpProjectId?: string }) {
    const projectId =
      params?.gcpProjectId || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
    this.client = new PubSub({ projectId });
  }

  public async ensureTopicExists(topicName: string): Promise<void> {
    const topic = this.client.topic(topicName);
    const [exists] = await topic.exists();
    if (!exists) {
      await this.client.createTopic(topicName);
      this.logger.log(`Created topic: ${topicName}`);
    }
  }

  public async publishMessage(
    topicName: string,
    payloadObject: unknown,
    attributes?: Record<string, string>
  ): Promise<string> {
    await this.ensureTopicExists(topicName);
    const dataString = JSON.stringify(payloadObject);
    const data = Buffer.from(dataString);
    const msgId = await this.client.topic(topicName).publishMessage({ data, attributes });
    this.logger.debug(`Published message to ${topicName}: ${msgId} ${dataString}`);
    return msgId;
  }

  public async publishMessageWithDefaultWrap(
    topicName: string,
    payloadObject: unknown,
    attributes?: Record<string, string>
  ): Promise<string> {
    const wrappedPayload = {
      version: '1.0',
      body: payloadObject,
      order: Date.now(),
      producer: {
        name: 'OWOX Data Marts',
      },
    };
    return this.publishMessage(topicName, wrappedPayload, attributes);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
  }
}
