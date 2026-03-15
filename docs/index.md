---
layout: home

hero:
  name: "Cucu Platform"
  text: "Microservices SaaS Documentation"
  tagline: Technical documentation for the NestJS microservices architecture with Apollo Federation
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/
    - theme: alt
      text: Architecture
      link: /architecture/overview

features:
  - icon: 🏗️
    title: Microservices Architecture
    details: 12+ NestJS microservices with Apollo Federation 2 gateway, MongoDB per service, and Redis mTLS for RPC/events.
  - icon: 🔐
    title: 3-Tier Permission System
    details: Operation-level, field-level with scopes, and page-level permissions with 5-minute caching and instant invalidation.
  - icon: 🔄
    title: Real-time Communication
    details: Redis-based RPC (MessagePattern/EventPattern) with mTLS encryption and HMAC signature verification.
  - icon: 📊
    title: Federation-First Design
    details: Apollo Federation 2 with @key, @extends, ResolveReference, and ResolveField patterns for distributed GraphQL.
---

## Quick Links

| Section | Description |
|---------|-------------|
| [Getting Started](/getting-started/) | Prerequisites, setup, and first steps |
| [Architecture](/architecture/overview) | System design, communication patterns, and security |
| [Services](/services/gateway) | Detailed documentation for each microservice |
| [Guides](/guides/add-new-service) | Step-by-step guides for common tasks |
| [Reference](/reference/ports) | Quick reference for ports, RPC patterns, and environment variables |

## Service Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Gateway (3000)                                 │
│                    Apollo Federation + JWT Auth                          │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
        ┌──────────────────────┼───────────────────────┐
        │                      │                       │
        ▼                      ▼                       ▼
┌───────────────┐    ┌─────────────────┐    ┌──────────────────┐
│  Auth (3001)  │    │  Users (3003)   │    │  Grants (3011)   │
│   Sessions    │    │   User CRUD     │    │   Permissions    │
│   JWT/Refresh │    │   Profiles      │    │   Groups         │
└───────────────┘    └─────────────────┘    └──────────────────┘
        │                      │                       │
        └──────────────────────┼───────────────────────┘
                               │
                        Redis mTLS (6380)
```

## Technology Stack

- **Backend Framework**: NestJS 10+
- **GraphQL**: Apollo Federation 2 with subgraphs
- **Database**: MongoDB (one per service)
- **Message Bus**: Redis with mTLS encryption
- **Authentication**: JWT + refresh tokens + session management
- **Frontend**: Next.js 14+ with Apollo Client 4
