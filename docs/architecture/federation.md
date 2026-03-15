# Apollo Federation

Cucu uses Apollo Federation 2 to compose a distributed GraphQL graph from multiple subgraph services.

## Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    Apollo Gateway                             │
│                 IntrospectAndCompose                          │
│                                                               │
│  Supergraph = Auth + Users + Grants + Projects + ...         │
└──────────────────────────────────────────────────────────────┘
       │              │              │              │
       ▼              ▼              ▼              ▼
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ Auth     │  │ Users    │  │ Grants   │  │ Projects │
│ Subgraph │  │ Subgraph │  │ Subgraph │  │ Subgraph │
└──────────┘  └──────────┘  └──────────┘  └──────────┘
```

## Gateway Configuration

The gateway uses `IntrospectAndCompose` to dynamically build the supergraph from running subgraphs:

```typescript
// apps/gateway/src/app.module.ts
GraphQLModule.forRootAsync<ApolloGatewayDriverConfig>({
  driver: ApolloGatewayDriver,
  useFactory: async (configService: ConfigService) => {
    const subgraphs = [
      { name: 'auth', url: `http://auth:3001/graphql` },
      { name: 'users', url: `http://users:3003/graphql` },
      { name: 'grants', url: `http://grants:3011/graphql` },
      // ... other subgraphs
    ];

    return {
      gateway: {
        supergraphSdl: new IntrospectAndCompose({ subgraphs }),
        buildService({ url }) {
          return new RemoteGraphQLDataSource({
            url,
            willSendRequest({ request, context }) {
              // Add signed headers to subgraph requests
              if (context.req?.user) {
                request.http.headers.set('x-user-id', context.req.user.sub);
                request.http.headers.set('x-user-groups',
                  context.req.user.groups.join(','));
                request.http.headers.set('x-gateway-signature',
                  signHeaders(context.req.user));
              }
            },
          });
        },
      },
    };
  },
});
```

## Federation Directives

### @key

Defines the primary key for an entity, enabling cross-service resolution:

```typescript
// apps/users/src/schemas/user.schema.ts
@ObjectType()
@Directive('@key(fields: "_id")')
@Schema({ timestamps: true })
export class User {
  @Field(() => ID)
  _id: string;

  @Field(() => AuthDataSchema, { nullable: true })
  authData?: AuthDataSchema;

  // ... other fields
}
```

### @extends

Indicates that a type is defined in another service but extended here:

```typescript
// apps/milestone-to-user/src/entities/user.entity.ts
@ObjectType()
@Directive('@extends')
@Directive('@key(fields: "_id")')
export class User {
  @Field(() => ID)
  @Directive('@external')
  _id: string;
}
```

### @external

Marks a field as defined in another service (used with @extends):

```typescript
@Field(() => ID)
@Directive('@external')
_id: string;
```

## ResolveReference

Resolves an entity reference from another service:

```typescript
// apps/users/src/users.resolver.ts
@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  @ResolveReference()
  async resolveReference(ref: { __typename: string; _id: string }) {
    // Called when another service references a User by _id
    return this.usersService.findById(ref._id);
  }
}
```

### How It Works

```
┌────────────────────────────────────────────────────────────────┐
│ Query: { milestoneToUser(id: "...") { user { name email } } }  │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ MilestoneToUser Service returns:                               │
│ {                                                               │
│   _id: "m2u-123",                                              │
│   userId: "user-456",                                          │
│   user: { __typename: "User", _id: "user-456" }  ◄── stub      │
│ }                                                               │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ Gateway detects unresolved reference                           │
│ Calls Users service: resolveReference({ _id: "user-456" })     │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ Users Service returns full User entity:                        │
│ { _id: "user-456", authData: { name: "John", email: "..." } }  │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ Gateway merges and returns final response                      │
└────────────────────────────────────────────────────────────────┘
```

## ResolveField

Resolves a specific field, often by calling another service via RPC:

```typescript
// apps/users/src/users.resolver.ts
@ResolveField(() => [MilestoneToUser], { nullable: true })
@CheckFieldView('User', 'milestones')
async milestones(@Parent() user: User): Promise<MilestoneToUser[]> {
  // Call MilestoneToUser service via RPC
  const rows = await lastValueFrom(
    this.milestoneToUserClient.send<{ _id: string }[]>(
      'FIND_MILESTONE_TO_USER_BY_USER_ID',
      user._id
    )
  );

  // Return stubs for federation resolution
  return rows.map(r => ({
    __typename: 'MilestoneToUser',
    _id: r._id
  }));
}
```

## Entity Ownership

Each service owns certain entities:

| Service | Owned Entities |
|---------|---------------|
| **Users** | User, AuthDataSchema, PersonalDataSchema, EmploymentDataSchema |
| **Auth** | Session |
| **Grants** | Group, Permission, OperationPermission, PagePermission |
| **Projects** | Project |
| **Milestones** | Milestone |
| **MilestoneToUser** | MilestoneToUser (UserAssignment) |
| **MilestoneToProject** | MilestoneToProject (ProjectAssignment) |
| **GroupAssignments** | GroupAssignment |
| **Organization** | SeniorityLevel, JobRole, RoleCategory, Company |

## Service Description Convention

Operations include `serviceName` in their description for introspection:

```typescript
@Query(() => User, {
  name: 'findOneUser',
  description: 'serviceName=User'
})
async findOneUser(/* ... */): Promise<User>
```

This enables the Grants service to discover operations by entity:

```typescript
// Query operations for "User" entity
const operations = await this.grantsClient.send(
  'listQueryFromGateway',
  { serviceName: 'User' }
);
// Returns: ['findAllUsers', 'findOneUser', 'findDeletedUsers', ...]
```

## Subgraph Module Configuration

Each subgraph configures GraphQL with federation enabled:

```typescript
// apps/users/src/users.module.ts
GraphQLModule.forRoot<ApolloFederationDriverConfig>({
  driver: ApolloFederationDriver,
  context: ({ req }) => ({ req }),
  autoSchemaFile: {
    path: 'schema.gql',
    federation: 2,  // Enable Federation 2
  },
  buildSchemaOptions: {
    // Orphaned types that need explicit inclusion
    orphanedTypes: [JobRoleEntity, SeniorityLevelEntity, CompanyEntity],
  },
  fieldResolverEnhancers: ['interceptors', 'filters'],
})
```

## Cross-Service Entity Resolution

When a service needs to reference an entity from another service:

### 1. Create Entity Stub

```typescript
// apps/users/src/entities/job-role.entity.ts
@ObjectType()
@Directive('@extends')
@Directive('@key(fields: "_id")')
export class JobRole {
  @Field(() => ID)
  @Directive('@external')
  _id: string;
}
```

### 2. Add to Orphaned Types

```typescript
buildSchemaOptions: {
  orphanedTypes: [JobRoleEntity, SeniorityLevelEntity, CompanyEntity],
}
```

### 3. Resolve via RPC + Stub Return

```typescript
@ResolveField(() => [JobRole], { nullable: true })
async jobRoles(@Parent() parent: AdditionalFieldsDataSchema): Promise<JobRole[]> {
  if (!parent.jobRoleIds?.length) return [];

  const results = await lastValueFrom(
    this.organizationClient.send('FIND_JOB_ROLES_BY_IDS', parent.jobRoleIds)
  );

  // Return stubs for federation
  return results.map(r => ({
    __typename: 'JobRole',
    _id: r._id.toString()
  }));
}
```

## Header Propagation

The gateway adds signed headers to all subgraph requests:

```typescript
// apps/gateway/src/app.module.ts - buildService
willSendRequest({ request, context }) {
  const user = context.req?.user;
  if (user) {
    const userGroups = user.groups?.join(',') ?? '';
    const userId = user.sub ?? '';

    request.http.headers.set('x-user-id', userId);
    request.http.headers.set('x-user-groups', userGroups);
    request.http.headers.set('x-internal-federation-call', '1');

    // HMAC signature for verification
    const payload = `${userGroups}|1|${userId}`;
    const signature = createHmac('sha256', INTERNAL_HEADER_SECRET)
      .update(payload)
      .digest('hex');
    request.http.headers.set('x-gateway-signature', signature);
  }
}
```

## Best Practices

### 1. Always Return Stubs for Federation

```typescript
// GOOD: Return stub for federation resolution
return { __typename: 'User', _id: userId };

// BAD: Return full object (bypasses federation)
return await this.usersService.findById(userId);
```

### 2. Use @key for All Entities

Every shared entity must have a federation key:

```typescript
@Directive('@key(fields: "_id")')
export class User { /* ... */ }
```

### 3. Keep Stubs Minimal

Stub entities should only include the `@key` field:

```typescript
// apps/milestone-to-user/src/entities/user.entity.ts
@ObjectType()
@Directive('@extends')
@Directive('@key(fields: "_id")')
export class User {
  @Field(() => ID)
  @Directive('@external')
  _id: string;  // Only the key field
}
```

### 4. Include Orphaned Types

Any stub type must be in `orphanedTypes`:

```typescript
buildSchemaOptions: {
  orphanedTypes: [UserEntity, MilestoneEntity, GroupEntity],
}
```

## Debugging Federation

### Check Subgraph Schema

```bash
curl http://localhost:3003/graphql -X POST \
  -H "Content-Type: application/json" \
  -d '{"query": "{ _service { sdl } }"}'
```

### Introspect Gateway

```graphql
query {
  __schema {
    types {
      name
      fields {
        name
        type { name }
      }
    }
  }
}
```

## Next Steps

- [Service Communication](/architecture/communication) - RPC patterns used in field resolvers
- [Permission System](/architecture/permissions) - Field-level permission checks
