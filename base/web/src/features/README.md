# Features Directory

This directory contains feature-specific modules that make up the core functionality of the web application. Each
feature is organized as a self-contained module with its own components, API interactions, and business logic.

## Directory Structure

Each feature module should follow this structure:

```text
feature-name/
├── components/       # React components specific to the feature
├── model/            # Business logic, types, and state
│   ├── types/        # TypeScript interfaces and types
│   ├── context/      # React context providers and consumers
│   └── hooks/        # Custom React hooks for state and business logic
├── api/              # API integration
├── utils/            # Helper functions and utilities
└── index.ts          # Public exports for the feature
```
