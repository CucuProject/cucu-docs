# Add New Service Guide

This guide walks you through creating a new microservice for the Cucu platform.

## Overview

By the end of this guide, you will have:

1. A new NestJS microservice with GraphQL federation
2. MongoDB database connection
3. Redis transport for RPC communication
4. Integration with the permission system
5. Docker configuration for deployment

## Step 1: Create Service Directory

```bash
# Create the service directory
mkdir -p apps/my-service/src

# Create basic files
touch apps/my-service/src/main.ts
touch apps/my-service/src/my-service.module.ts
touch apps/my-service/src/my-service.resolver.ts
touch apps/my-service/src/my-service.service.ts
touch apps/my-service/src/my-service.controller.ts
touch apps/my-service/Dockerfile
touch apps/my-service/README.md
```

## Step 2: Create the Main Entry Point

```typescript
// apps/my-service/src/main.ts
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { MyServiceModule } from './my-service.module';
import { MicroservicesOrchestratorService } from '@cucu/microservices-orchestrator';
import { buildRedisTlsOptions } from '@cucu/service-common';

async function bootstrap() {
  const app = await NestFactory.create(MyServiceModule);
  const configService = app.get(ConfigService);
  const orchestrator = app.get(MicroservicesOrchestratorService);

  const serviceName = configService.get('MY_SERVICE_NAME', 'my-service');
  const port = configService.get<number>('MY_SERVICE_PORT', 3020);

  // Wait for dependencies
  try {
    await orchestrator.areDependenciesReady(serviceName.toUpperCase(), {
      maxRetries: 10,
      retryDelay: 3000,
      useTls: !!configService.get('REDIS_TLS_CA_CERT'),
    });
    console.log('Dependencies ready');
  } catch (error) {
    console.error('Dependency check failed:', error);
    process.exit(1);
  }

  // Connect Redis microservice
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.REDIS,
    options: buildRedisTlsOptions(configService, 'MY_SERVICE'),
  });

  // Enable CORS
  app.enableCors();

  // Start
  await app.startAllMicroservices();
  await app.listen(port);

  // Notify ready
  await orchestrator.notifyServiceReady(serviceName);

  console.log(`My Service running on port ${port}`);
}

bootstrap();
```

## Step 3: Create the Module

```typescript
// apps/my-service/src/my-service.module.ts
import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloFederationDriver, ApolloFederationDriverConfig } from '@nestjs/apollo';
import { MongooseModule } from '@nestjs/mongoose';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { APP_GUARD } from '@nestjs/core';
import { join } from 'path';

import { buildRedisTlsOptions, OperationGuard, PermissionsCacheService } from '@cucu/service-common';
import { MicroservicesOrchestratorModule } from '@cucu/microservices-orchestrator';
import { LocalSchemaFieldsService } from '@cucu/field-level-grants';

import { MyServiceResolver } from './my-service.resolver';
import { MyServiceService } from './my-service.service';
import { MyServiceController } from './my-service.controller';
import { MyServiceContext } from './my-service.context';
import { MyEntity, MyEntitySchema } from './schemas/my-entity.schema';

// Redis clients for other services
const RedisClientsModule = ClientsModule.registerAsync([
  {
    name: 'GRANTS_SERVICE',
    imports: [ConfigModule],
    inject: [ConfigService],
    useFactory: (cfg: ConfigService) => ({
      transport: Transport.REDIS,
      options: buildRedisTlsOptions(cfg, 'MY_SERVICE'),
    }),
  },
  {
    name: 'USERS_SERVICE',
    imports: [ConfigModule],
    inject: [ConfigService],
    useFactory: (cfg: ConfigService) => ({
      transport: Transport.REDIS,
      options: buildRedisTlsOptions(cfg, 'MY_SERVICE'),
    }),
  },
]);

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RedisClientsModule,
    MicroservicesOrchestratorModule,

    // GraphQL Federation
    GraphQLModule.forRoot<ApolloFederationDriverConfig>({
      driver: ApolloFederationDriver,
      context: ({ req }) => ({ req }),
      autoSchemaFile: {
        path: join(process.cwd(), 'src/schema.gql'),
        federation: 2,
      },
      fieldResolverEnhancers: ['interceptors', 'filters'],
    }),

    // MongoDB
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        uri: cfg.get<string>('MONGODB_URI'),
      }),
    }),
    MongooseModule.forFeature([
      { name: MyEntity.name, schema: MyEntitySchema },
    ]),
  ],
  controllers: [MyServiceController],
  providers: [
    // Context
    MyServiceContext,
    { provide: 'SUBGRAPH_CONTEXT', useExisting: MyServiceContext },

    // Services
    MyServiceService,
    MyServiceResolver,

    // Permissions
    PermissionsCacheService,
    LocalSchemaFieldsService,

    // Guards
    { provide: APP_GUARD, useClass: OperationGuard },
  ],
})
export class MyServiceModule implements OnModuleInit {
  constructor(
    private readonly introspection: LocalSchemaFieldsService,
  ) {}

  onModuleInit() {
    this.introspection.configure({
      maxDepth: 2,
      debug: false,
      allowedTypes: ['MyEntity'],
    });
    this.introspection.warmUpEntities(['MyEntity']);
  }
}
```

## Step 4: Create the Schema

```typescript
// apps/my-service/src/schemas/my-entity.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ObjectType, Field, ID, Directive } from '@nestjs/graphql';

export type MyEntityDocument = MyEntity & Document;

@ObjectType()
@Directive('@key(fields: "_id")')
@Schema({ timestamps: true })
export class MyEntity {
  @Field(() => ID)
  _id: string;

  @Prop({ required: true })
  @Field()
  name: string;

  @Prop()
  @Field({ nullable: true })
  description?: string;

  @Prop({ default: true })
  @Field()
  active: boolean;

  @Prop()
  @Field({ nullable: true })
  createdAt?: Date;

  @Prop()
  @Field({ nullable: true })
  updatedAt?: Date;
}

export const MyEntitySchema = SchemaFactory.createForClass(MyEntity);
```

## Step 5: Create the Service

```typescript
// apps/my-service/src/my-service.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MyEntity, MyEntityDocument } from './schemas/my-entity.schema';
import { CreateMyEntityInput } from './dto/create-my-entity.input';
import { UpdateMyEntityInput } from './dto/update-my-entity.input';

@Injectable()
export class MyServiceService {
  constructor(
    @InjectModel(MyEntity.name) private model: Model<MyEntityDocument>,
  ) {}

  async create(input: CreateMyEntityInput): Promise<MyEntity> {
    const entity = new this.model(input);
    return entity.save();
  }

  async findAll(): Promise<MyEntity[]> {
    return this.model.find({ active: true }).lean().exec();
  }

  async findById(id: string): Promise<MyEntity> {
    const entity = await this.model.findById(id).lean().exec();
    if (!entity) {
      throw new NotFoundException(`Entity ${id} not found`);
    }
    return entity;
  }

  async update(input: UpdateMyEntityInput): Promise<MyEntity> {
    const entity = await this.model
      .findByIdAndUpdate(input._id, input, { new: true })
      .lean()
      .exec();
    if (!entity) {
      throw new NotFoundException(`Entity ${input._id} not found`);
    }
    return entity;
  }

  async remove(id: string): Promise<MyEntity> {
    const entity = await this.model.findByIdAndDelete(id).lean().exec();
    if (!entity) {
      throw new NotFoundException(`Entity ${id} not found`);
    }
    return entity;
  }
}
```

## Step 6: Create the Resolver

```typescript
// apps/my-service/src/my-service.resolver.ts
import { Resolver, Query, Mutation, Args, ResolveReference } from '@nestjs/graphql';
import { UseGuards, UseInterceptors } from '@nestjs/common';
import { MyEntity } from './schemas/my-entity.schema';
import { MyServiceService } from './my-service.service';
import { CreateMyEntityInput } from './dto/create-my-entity.input';
import { UpdateMyEntityInput } from './dto/update-my-entity.input';
import { createViewFieldsInterceptor, ViewableFields } from '@cucu/service-common';

@Resolver(() => MyEntity)
export class MyServiceResolver {
  constructor(private readonly service: MyServiceService) {}

  @ResolveReference()
  async resolveReference(ref: { __typename: string; _id: string }) {
    return this.service.findById(ref._id);
  }

  @Query(() => [MyEntity], {
    name: 'findAllMyEntities',
    description: 'serviceName=MyEntity',
  })
  async findAll(): Promise<MyEntity[]> {
    return this.service.findAll();
  }

  @Query(() => MyEntity, {
    name: 'findOneMyEntity',
    description: 'serviceName=MyEntity',
  })
  async findOne(
    @Args('id', { type: () => String }) id: string,
  ): Promise<MyEntity> {
    return this.service.findById(id);
  }

  @Mutation(() => MyEntity, {
    name: 'createMyEntity',
    description: 'serviceName=MyEntity',
  })
  async create(
    @Args('input') input: CreateMyEntityInput,
  ): Promise<MyEntity> {
    return this.service.create(input);
  }

  @Mutation(() => MyEntity, {
    name: 'updateMyEntity',
    description: 'serviceName=MyEntity',
  })
  async update(
    @Args('input') input: UpdateMyEntityInput,
  ): Promise<MyEntity> {
    return this.service.update(input);
  }

  @Mutation(() => MyEntity, {
    name: 'removeMyEntity',
    description: 'serviceName=MyEntity',
  })
  async remove(
    @Args('id', { type: () => String }) id: string,
  ): Promise<MyEntity> {
    return this.service.remove(id);
  }
}
```

## Step 7: Create the Controller (RPC)

```typescript
// apps/my-service/src/my-service.controller.ts
import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, EventPattern, Payload } from '@nestjs/microservices';
import { MyServiceService } from './my-service.service';

@Controller()
export class MyServiceController {
  private readonly logger = new Logger(MyServiceController.name);

  constructor(private readonly service: MyServiceService) {}

  @MessagePattern('MY_ENTITY_EXISTS')
  async exists(@Payload() id: string): Promise<boolean> {
    try {
      await this.service.findById(id);
      return true;
    } catch {
      return false;
    }
  }

  @EventPattern('SOME_EXTERNAL_EVENT')
  async handleExternalEvent(@Payload() data: { id: string }) {
    this.logger.log(`Received external event for ${data.id}`);
    // Handle the event
  }
}
```

## Step 8: Create DTOs

```typescript
// apps/my-service/src/dto/create-my-entity.input.ts
import { InputType, Field } from '@nestjs/graphql';
import { IsString, IsOptional, MaxLength } from 'class-validator';

@InputType()
export class CreateMyEntityInput {
  @Field()
  @IsString()
  @MaxLength(100)
  name: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

// apps/my-service/src/dto/update-my-entity.input.ts
import { InputType, Field, ID, PartialType } from '@nestjs/graphql';
import { CreateMyEntityInput } from './create-my-entity.input';

@InputType()
export class UpdateMyEntityInput extends PartialType(CreateMyEntityInput) {
  @Field(() => ID)
  _id: string;
}
```

## Step 9: Create the Context

```typescript
// apps/my-service/src/my-service.context.ts
import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { BaseSubgraphContext } from '@cucu/service-common';

@Injectable({ scope: Scope.REQUEST })
export class MyServiceContext extends BaseSubgraphContext {
  constructor(@Inject(REQUEST) req: Request) {
    super(req);
  }
}
```

## Step 10: Configure Environment

Add to `.env.development`:

```ini
# My Service
MY_SERVICE_NAME=my-service
MY_SERVICE_PORT=3020
MY_SERVICE_DB_HOST=my-service-db
MY_SERVICE_DB_PORT=9020

# MongoDB URI
MONGODB_URI=mongodb://my-service-db:27017/my-service

# Dependencies
MY_SERVICE_DEPENDENCIES=["grants"]

# Redis TLS (if using)
MY_SERVICE_REDIS_TLS_CLIENT_CERT=/certs/my-service.crt
MY_SERVICE_REDIS_TLS_CLIENT_KEY=/certs/my-service.key
```

## Step 11: Create Dockerfile

```dockerfile
# apps/my-service/Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
COPY pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install

COPY . .
RUN pnpm run build my-service

EXPOSE 3020

CMD ["node", "dist/apps/my-service/main.js"]
```

## Step 12: Add to Docker Compose

```yaml
# docker-compose.development.yml
services:
  my-service-db:
    image: mongo:6
    ports:
      - "9020:27017"
    volumes:
      - mongo_my_service:/data/db

  my-service:
    build:
      context: .
      dockerfile: apps/my-service/Dockerfile
    ports:
      - "3020:3020"
    environment:
      - MY_SERVICE_NAME=my-service
      - MY_SERVICE_PORT=3020
      - MONGODB_URI=mongodb://my-service-db:27017/my-service
      - REDIS_SERVICE_HOST=redis
      - MY_SERVICE_DEPENDENCIES=["grants"]
    depends_on:
      - redis
      - my-service-db
      - grants

volumes:
  mongo_my_service:
```

## Step 13: Register with Gateway

Add the service to gateway's subgraph list:

```typescript
// apps/gateway/src/app.module.ts
const subgraphs = [
  // ... existing subgraphs
  {
    name: 'my-service',
    url: `${protocol}://${configService.get('MY_SERVICE_NAME')}:${configService.get('MY_SERVICE_PORT')}/graphql`,
  },
];
```

Add environment variables:

```ini
MY_SERVICE_NAME=my-service
MY_SERVICE_PORT=3020
```

## Step 14: Create Permissions

Use the bootstrap or GraphQL to create permissions:

```graphql
# Create operation permissions
mutation {
  createOperationPermission(input: {
    groupId: "admin-group-id"
    operationName: "findAllMyEntities"
    canExecute: true
  }) { _id }

  createOperationPermission(input: {
    groupId: "admin-group-id"
    operationName: "createMyEntity"
    canExecute: true
  }) { _id }
}

# Create field permissions
mutation {
  createPermission(input: {
    groupId: "admin-group-id"
    entityName: "MyEntity"
    fieldPath: "name"
    canView: true
    canEdit: true
  }) { _id }
}
```

## Step 15: Test

```bash
# Start the service
pnpm run start:dev my-service

# Test GraphQL
curl http://localhost:3020/graphql -X POST \
  -H "Content-Type: application/json" \
  -d '{"query": "{ findAllMyEntities { _id name } }"}'

# Test via Gateway
curl http://localhost:3000/graphql -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"query": "{ findAllMyEntities { _id name } }"}'
```

## Checklist

- [ ] Service directory created
- [ ] Main entry point with orchestrator
- [ ] Module with GraphQL and MongoDB
- [ ] Schema with @key directive
- [ ] Service with CRUD operations
- [ ] Resolver with serviceName descriptions
- [ ] Controller with RPC handlers
- [ ] DTOs with validation
- [ ] Context extending BaseSubgraphContext
- [ ] Environment variables configured
- [ ] Dockerfile created
- [ ] Docker Compose updated
- [ ] Gateway configured
- [ ] Permissions created
- [ ] Tests passing

## Next Steps

- [Add New Field Guide](/guides/add-new-field) - Add fields to your entity
- [Add New Permission Guide](/guides/add-new-permission) - Set up permissions
- [Debugging Guide](/guides/debugging) - Troubleshoot issues
