import { Message, PubSub } from '@google-cloud/pubsub';
import { Injectable } from '@nestjs/common';
import { Trigger } from '../../shared/entities/trigger.entity';
import { TriggerHandler } from '../../shared/trigger-handler.interface';
import { SystemTimeService } from '../system-time.service';
import { AbstractTriggerRunnerService } from './abstract-trigger-runner.service';
import { GracefulShutdownService } from '../graceful-shutdown.service';
import { FindOneOptions } from 'typeorm';

/**
 * Service that runs triggers using Google Cloud Pub/Sub.
 *
 * This implementation publishes trigger IDs to a Google Cloud Pub/Sub topic and processes them
 * asynchronously when received from the subscription. It's suitable for distributed processing
 * scenarios where triggers need to be processed across multiple instances or services.
 *
 * Note: This service uses Google's default credential logic for authentication. When using this
 * runner, credentials are automatically obtained from the environment where the application is
 * running, following Google Cloud's standard credential resolution process.
 *
 * @typeParam T - The type of trigger this service processes, must extend TimeBasedTrigger
 */
@Injectable()
export class PubsubTriggerRunnerService<T extends Trigger> extends AbstractTriggerRunnerService<T> {
  private readonly pubSubClient: PubSub;
  private readonly topicName: string;
  private readonly subscriptionName: string;

  /**
   * Creates a new instance of the PubsubTriggerRunnerService.
   *
   * @param handler The trigger handler that defines how triggers are processed
   * @param systemClock The system time service used to get the current time
   * @param googleCloudProject The Google Cloud project ID to use for Pub/Sub
   * @param shutdownService The graceful shutdown service used to manage shutdown state
   */
  constructor(
    handler: TriggerHandler<T>,
    systemClock: SystemTimeService,
    private readonly googleCloudProject: string,
    shutdownService: GracefulShutdownService
  ) {
    super(handler, systemClock, shutdownService);
    this.topicName = this.generateTopicName();
    this.subscriptionName = this.generateSubscriptionName();
    this.pubSubClient = this.createPubSubClient();
  }

  /**
   * Initializes the PubSub listener.
   * This method should be called after the service is constructed.
   *
   * @returns A promise that resolves when the PubSub listener is set up
   * @throws If the PubSub listener setup fails
   */
  async initialize(): Promise<void> {
    await this.setupPubSubListener();
  }

  /**
   * Generates a unique topic name based on the handler name.
   *
   * @returns The generated topic name
   */
  private generateTopicName(): string {
    return `owox-data-marts-${this.handlerName.toLowerCase()}-triggers`;
  }

  /**
   * Generates a subscription name based on the topic name.
   *
   * @returns The generated subscription name
   */
  private generateSubscriptionName(): string {
    return `${this.topicName}-subscription`;
  }

  /**
   * Creates a new PubSub client using the configured Google Cloud project ID.
   *
   * Note: This uses Google's default credential logic. Credentials are automatically
   * obtained from the environment where the application is running.
   *
   * @returns A configured PubSub client
   */
  private createPubSubClient(): PubSub {
    return new PubSub({ projectId: this.googleCloudProject });
  }

  /**
   * Sets up the PubSub listener for processing triggers.
   *
   * This includes ensuring the topic and subscription exist,
   * and setting up message handlers.
   *
   * @returns A promise that resolves when the listener is set up
   */
  private async setupPubSubListener(): Promise<void> {
    try {
      await this.ensureTopicExists();
      await this.ensureSubscriptionExists();
      this.setupMessageHandlers();

      this.logger.log('PubSub listener setup complete');
    } catch (error) {
      this.logger.error('Error setting up PubSub listener:', error);
      throw error;
    }
  }

  /**
   * Ensures that the PubSub topic exists, creating it if necessary.
   *
   * @returns A promise that resolves when the topic exists
   */
  private async ensureTopicExists(): Promise<void> {
    const [topicExists] = await this.pubSubClient.topic(this.topicName).exists();
    if (!topicExists) {
      await this.pubSubClient.createTopic(this.topicName);
      this.logger.log(`Created topic: ${this.topicName}`);
    }
  }

  /**
   * Ensures that the PubSub subscription exists, creating it if necessary.
   *
   * @returns A promise that resolves when the subscription exists
   */
  private async ensureSubscriptionExists(): Promise<void> {
    const [subscriptionExists] = await this.pubSubClient
      .topic(this.topicName)
      .subscription(this.subscriptionName)
      .exists();

    if (!subscriptionExists) {
      await this.pubSubClient.topic(this.topicName).createSubscription(this.subscriptionName);
      this.logger.log(`Created subscription: ${this.subscriptionName}`);
    }
  }

  /**
   * Sets up message and error handlers for the PubSub subscription.
   */
  private setupMessageHandlers(): void {
    const subscription = this.pubSubClient
      .topic(this.topicName)
      .subscription(this.subscriptionName);

    subscription.on('message', this.handlePubSubMessage.bind(this));
    subscription.on('error', this.handlePubSubError.bind(this));
  }

  /**
   * Handles incoming PubSub messages by finding and processing the corresponding trigger.
   *
   * Messages must be in JSON format containing both trigger ID and version.
   * The method checks if the message version matches the current entity version
   * to prevent processing outdated messages.
   *
   * @param message The PubSub message containing the trigger information (JSON with id and version)
   * @returns A promise that resolves when the message has been processed
   */
  private async handlePubSubMessage(message: Message): Promise<void> {
    try {
      const messageData = message.data.toString();
      const payload = JSON.parse(messageData);
      const triggerId = payload.id;
      const messageVersion = payload.version;

      this.logger.log(`Received message with trigger ID: ${triggerId}, version: ${messageVersion}`);

      const trigger = await this.findTriggerById(triggerId);

      if (!trigger) {
        this.logger.error(`Trigger with ID ${triggerId} not found`);
      } else if (trigger.version !== messageVersion) {
        // Skip processing if the message version doesn't match the current entity version
        this.logger.warn(
          `Skipping outdated message for trigger ${triggerId}: message version ${messageVersion}, current version ${trigger.version}`
        );
      } else {
        await this.processTriggerSafely(trigger);
      }
    } catch (error) {
      this.logger.error('Error processing PubSub message:', error);
    } finally {
      // Always acknowledge to avoid infinite retries
      message.ack();
    }
  }

  /**
   * Finds a trigger by its ID using the handler's repository.
   *
   * @param triggerId The ID of the trigger to find
   * @returns A promise that resolves to the found trigger or null if not found
   */
  private async findTriggerById(triggerId: string): Promise<T | null> {
    const options: FindOneOptions = { where: { id: triggerId } };
    return this.handler.getTriggerRepository().findOne(options);
  }

  /**
   * Handles PubSub subscription errors.
   *
   * @param error The error that occurred
   */
  private handlePubSubError(error: Error): void {
    this.logger.error('PubSub subscription error:', error);
  }

  /**
   * Processes a batch of triggers by publishing their IDs to the PubSub topic.
   *
   * This implementation publishes trigger IDs to a Pub/Sub topic for asynchronous processing.
   * The actual processing happens when the messages are received from the subscription.
   *
   * @param triggers The triggers to process
   * @returns A promise that resolves when all triggers have been published
   */
  protected async processTriggers(triggers: T[]): Promise<void> {
    try {
      const publishPromises = triggers.map(trigger => this.publishTriggerToPubSub(trigger));
      await Promise.all(publishPromises);

      this.logger.debug(`Successfully published ${triggers.length} triggers to PubSub`);
    } catch (error) {
      this.logger.error('Error publishing triggers to PubSub:', error);
      throw error;
    }
  }

  /**
   * Publishes a single trigger to the PubSub topic.
   *
   * The message includes both the trigger ID and version to prevent processing of outdated messages.
   *
   * @param trigger The trigger to publish
   * @returns A promise that resolves to the message ID from PubSub
   */
  private async publishTriggerToPubSub(trigger: T): Promise<string> {
    // Create a payload with both ID and version
    const payload = {
      id: trigger.id,
      version: trigger.version,
    };
    const dataBuffer = Buffer.from(JSON.stringify(payload));

    try {
      const messageId = await this.pubSubClient
        .topic(this.topicName)
        .publishMessage({ data: dataBuffer });

      this.logger.debug(
        `Published message ${messageId} for trigger ${trigger.id} (version ${trigger.version})`
      );
      return messageId;
    } catch (error) {
      this.logger.error(`Error publishing trigger ${trigger.id}:`, error);
      throw error;
    }
  }
}
