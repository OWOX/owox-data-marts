# 🕒 Scheduler Module

## 🎯 Purpose

The Scheduler Module provides functionality for scheduling and executing
time-based triggers in a distributed environment. It allows for the registration
of trigger handlers that can be executed either directly or through Google Cloud
Pub/Sub, depending on the configuration.

This module is designed to be flexible and extensible, allowing for different
trigger types and execution strategies. It provides a facade pattern
implementation for easy integration with other modules.

## ✨ Features

- ⏱️ Time-based trigger scheduling and execution
- 🔄 Support for different trigger types (regular and scheduled)
- 🚀 Support for different runner types (direct execution or Pub/Sub)
- 🔒 Optimistic locking to prevent duplicate processing in distributed
  environments
- ⚠️ Error handling
- ⚙️ Configurable execution strategies
- 🛑 Graceful shutdown support for clean application termination

## 📚 Usage

### 🔔 Trigger Types

The Scheduler Module supports two types of triggers:

#### 🔂 Regular Triggers (TimeBasedTrigger)

Regular triggers are one-time triggers that run once at a specified time. After
successful execution, they are marked as completed and will not run again unless
manually rescheduled.

##### 📝 Creating a Regular Trigger Entity

```typescript
import { Entity } from 'typeorm';
import { TimeBasedTrigger } from './common/scheduler/shared/entities/time-based-trigger.entity';

@Entity('my_triggers')
export class MyTrigger extends TimeBasedTrigger {
  // Add additional properties specific to your trigger
}
```

#### 🔁 Scheduled Triggers (ScheduledTrigger)

Scheduled triggers run repeatedly according to a cron expression. After each
execution (whether successful or not), they automatically schedule their next
run based on the cron expression and timezone.

##### 📝 Creating a Scheduled Trigger Entity

```typescript
import { Entity } from 'typeorm';
import { ScheduledTrigger } from './common/scheduler/shared/entities/scheduled-trigger.entity';

@Entity('my_scheduled_triggers')
export class MyScheduledTrigger extends ScheduledTrigger {
  // Add additional properties specific to your trigger
}
```

### 📦 Module Registration

To use the Scheduler Module, import it into your application module:

```typescript
import { Module } from '@nestjs/common';
import { SchedulerModule } from './common/scheduler/scheduler.module';

@Module({
  imports: [SchedulerModule],
})
export class MyModule {}
```

### 🔌 Self-Registering Trigger Handler

Implement a trigger handler that self-registers with the scheduler facade during
initialization:

```typescript
import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SCHEDULER_FACADE, SchedulerFacade } from './common/scheduler/shared/scheduler.facade';
import { TimeBasedTriggerHandler } from './common/scheduler/shared/time-based-trigger-handler.interface';
import { MyTrigger } from './my-trigger.entity';

@Injectable()
export class MyTriggerHandler implements TimeBasedTriggerHandler<MyTrigger>, OnModuleInit {
  constructor(
    @InjectRepository(MyTrigger)
    private readonly repository: Repository<MyTrigger>,
    @Inject(SCHEDULER_FACADE)
    private readonly schedulerFacade: SchedulerFacade
  ) {}

  getTriggerRepository(): Repository<MyTrigger> {
    return this.repository;
  }

  async handleTrigger(trigger: MyTrigger): Promise<void> {
    // Implement your trigger processing logic here
  }

  processingCronExpression(): string {
    // Define how frequently triggers should be checked for processing
    return '0 */5 * * * *'; // Every 5 minutes
  }

  async onModuleInit() {
    // Self-register with the scheduler facade
    await this.schedulerFacade.registerTimeBasedTriggerHandler(this);
  }
}
```

**Note**: The `registerTimeBasedTriggerHandler` method automatically adapts its behavior based on the `SCHEDULER_EXECUTION_ENABLED` configuration. When set to `false`, it will only log the registration without creating cron jobs. When set to `true`, it will create and start the actual cron jobs for trigger execution.

## ⚙️ Configuration

The Scheduler Module can be configured using environment variables:

| Environment Variable                          | Description                                                                          | Default Value |
| --------------------------------------------- | ------------------------------------------------------------------------------------ | ------------- |
| `SCHEDULER_EXECUTION_ENABLED`                 | Enables/disables trigger execution. When `false`, only registration occurs without creating cron jobs | `true`       |
| `SCHEDULER_TRIGGER_RUNNER_TYPE`               | The type of trigger runner to use (`direct` or `pubsub`)                             | `direct`      |
| `SCHEDULER_PUBSUB_PROJECT_ID`                 | The Google Cloud project ID to use for Pub/Sub (required when using `pubsub` runner) | -             |
| `SCHEDULER_TIMEZONE`                          | The timezone to use for cron expressions                                             | `UTC`         |
| `SCHEDULER_GRACEFUL_SHUTDOWN_TIMEOUT_MINUTES` | The timeout in minutes for graceful shutdown                                         | `15`          |

### 🔄 Execution Modes

The Scheduler Module supports two execution modes controlled by the `SCHEDULER_EXECUTION_ENABLED` environment variable:

#### 🔴 Registration Mode (`SCHEDULER_EXECUTION_ENABLED=false`)

In registration mode, the scheduler facade only logs trigger handler registrations without creating actual cron jobs or executing triggers. This mode is suitable for:

- **API instances**: Where you want to register handlers for completeness but not execute scheduled tasks
- **Development environments**: Where you want to test handler registration without running actual schedules
- **Service separation**: When you want to separate registration logic from execution logic

```bash
SCHEDULER_EXECUTION_ENABLED=false
```

When a trigger handler is registered in this mode:

```text
Handler 'MyTriggerHandler' registered but execution disabled.
```

#### 🟢 Worker Mode (`SCHEDULER_EXECUTION_ENABLED=true`)

In worker mode, the scheduler facade creates actual cron jobs and executes triggers according to their schedules. This mode is suitable for:

- **Worker instances**: Dedicated instances that handle scheduled task execution
- **Production environments**: Where actual trigger processing should occur
- **Single-instance deployments**: Where both API and scheduling functionality are needed

```bash
SCHEDULER_EXECUTION_ENABLED=true
```

When a trigger handler is registered in this mode:

```text
Time-based trigger handler 'MyTriggerHandler' initialized with cron '0 */5 * * * *' in timezone UTC
```

This adaptive behavior allows the same codebase to serve both API instances (registration only) and Worker instances (full execution) without requiring separate implementations.

### 🏃‍♂️ Runner Types

#### ⚡ Direct Runner

```text
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Fetch       │────►│ Process     │────►│ Update      │
│ Triggers    │     │ In Current  │     │ Status      │
└─────────────┘     │ Process     │     └─────────────┘
                    └─────────────┘
```

The direct runner processes triggers immediately in the current process. It's
suitable for scenarios where triggers need to be processed quickly and don't
require distributed processing.

To use the direct runner, set:

```bash
SCHEDULER_TRIGGER_RUNNER_TYPE=direct
```

#### 🌐 Google PubSub Runner

```text
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Fetch       │────►│ Publish to  │────►│ Subscribe & │────►│ Process     │
│ Triggers    │     │ PubSub      │     │ Receive     │     │ & Update    │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

The PubSub runner publishes trigger IDs to a Google Cloud PubSub topic and
processes them asynchronously when received from the subscription. It's suitable
for distributed processing scenarios where triggers need to be processed across
multiple instances or services.

To use the PubSub runner, set:

```bash
SCHEDULER_TRIGGER_RUNNER_TYPE=pubsub
SCHEDULER_PUBSUB_PROJECT_ID=your-google-cloud-project-id
```

**Important Note**: When using the Pub/Sub runner, Google's default credential
logic is used for authentication. Credentials are automatically obtained from
the environment where the application is running, following Google Cloud's
standard credential resolution process. This means that the application will use
the credentials available in the environment (e.g., service account credentials,
application default credentials, etc.). For more information, see
[Google Cloud Authentication documentation](https://cloud.google.com/docs/authentication/application-default-credentials).

## ⚠️ Error Handling

The Scheduler Module includes built-in error handling for trigger processing. If
an error occurs during trigger processing, the trigger is marked with an error
status.

## 🔒 Optimistic Locking

The Scheduler Module uses optimistic locking to prevent duplicate processing of
triggers in distributed environments. This ensures that each trigger is
processed exactly once, even when multiple instances of the application are
running.

## 🛑 Graceful Shutdown

The Scheduler Module includes graceful shutdown support to ensure that
in-progress trigger processing can complete before the application terminates.
This prevents data loss or inconsistency that could occur if processing is
abruptly terminated.

When the application receives a shutdown signal, the graceful shutdown service:

1. Prevents new triggers from being processed
2. Tracks active trigger processing
3. Signals OS processes when available (`SIGTERM`; `SIGKILL` after timeout)
4. Waits for active processing to complete or until the configurable timeout

Internally, the service exposes helpers (`isInShutdownMode`, `registerActiveProcess`/`unregisterActiveProcess`, `updateProcessPid`) and `initiateShutdown(signal)`, which is invoked by the module lifecycle (`onModuleDestroy`).

The timeout for graceful shutdown can be configured using the
`SCHEDULER_GRACEFUL_SHUTDOWN_TIMEOUT_MINUTES` environment variable. If active
processes are still running when the timeout is reached, the application will
log details about these processes, send `SIGKILL` to known PIDs, and then terminate.
