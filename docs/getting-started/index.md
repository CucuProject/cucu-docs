# Getting Started

Welcome to the Cucu Platform documentation. This guide will help you understand the system and get a development environment running.

## What is Cucu?

Cucu is a **microservices-based SaaS project management platform** built with:

- **12+ NestJS microservices** with Apollo Federation 2 gateway
- **MongoDB** (one database per service) for data persistence
- **Redis mTLS** for inter-service communication (RPC and events)
- **3-tier permission system** (operation, field+scope, page)
- **Next.js 14+ frontend** with Apollo Client 4

## Prerequisites

Before you begin, ensure you have the following installed:

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 18+ LTS | Runtime environment |
| pnpm | 8+ | Package manager (preferred) |
| Docker | 24+ | Container runtime |
| Docker Compose | 2.20+ | Container orchestration |
| MongoDB Compass | Latest | Database GUI (optional) |

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client (Browser)                          │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Gateway (:3000)                              │
│              Apollo Federation + GlobalAuthGuard                 │
└────────────────────────────┬────────────────────────────────────┘
                             │ Redis mTLS RPC
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Auth (:3001) │    │ Users (:3002)│    │ Grants(:3010)│
│   MongoDB    │    │   MongoDB    │    │   MongoDB    │
└──────────────┘    └──────────────┘    └──────────────┘
```

## Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/CucuProject/cucu-nest.git
   cd cucu-nest
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env.development
   # Edit .env.development with your settings
   ```

4. **Start infrastructure**
   ```bash
   docker-compose -f docker-compose.development.yml up -d
   ```

5. **Run services**
   ```bash
   pnpm run start:dev
   ```

6. **Access the gateway**
   - GraphQL Playground: http://localhost:3000/graphql
   - REST endpoints: http://localhost:3000/auth/login

## Next Steps

- [Setup Guide](/getting-started/setup) - Detailed installation instructions
- [Architecture Overview](/getting-started/architecture) - Full system architecture
- [Gateway Service](/services/gateway) - Entry point documentation
