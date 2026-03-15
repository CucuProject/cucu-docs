# Gateway Service

The Gateway is the **single entry point** for the Cucu platform, handling authentication, federation composition, and request routing.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 3000 |
| **Role** | Apollo Federation Gateway, Authentication |
| **Dependencies** | Auth, Users, Grants, all subgraph services |

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Gateway (:3000)                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                       Apollo Federation                                │ │
│  │  IntrospectAndCompose → Supergraph from all subgraphs                │ │
│  │  /graphql endpoint                                                     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                       Authentication                                    │ │
│  │  GlobalAuthGuard → JwtStrategy → CHECK_SESSION                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                       REST Endpoints                                    │ │
│  │  POST /auth/login                                                      │ │
│  │  POST /auth/refresh                                                    │ │
│  │  POST /auth/logout                                                     │ │
│  │  POST /auth/force-revoke                                               │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Configuration

### Environment Variables

```ini
# Service Config
GATEWAY_SERVICE_NAME=gateway
GATEWAY_SERVICE_PORT=3000

# Redis Transport
REDIS_SERVICE_HOST=redis
REDIS_SERVICE_TLS_PORT=6380
GATEWAY_REDIS_TLS_CLIENT_CERT=/certs/gateway.crt
GATEWAY_REDIS_TLS_CLIENT_KEY=/certs/gateway.key
REDIS_TLS_CA_CERT=/certs/ca.crt

# Subgraph URLs
HTTP_PROTOCOL=http
AUTH_SERVICE_NAME=auth
AUTH_SERVICE_PORT=3001
USERS_SERVICE_NAME=users
USERS_SERVICE_PORT=3003
GRANTS_SERVICE_NAME=grants
GRANTS_SERVICE_PORT=3011
# ... all other services

# JWT (must match Auth service)
JWT_SECRET=ProdSecretKey

# HMAC Security
INTERNAL_HEADER_SECRET=cucu-dev-hmac-change-me-in-production

# Refresh Cookie
REFRESH_COOKIE_NAME=__Host-rf
REFRESH_COOKIE_DOMAIN=localhost
REFRESH_COOKIE_SECURE=true
REFRESH_COOKIE_SAMESITE=strict
REFRESH_COOKIE_MAXAGE=7d
```

## Apollo Federation Setup

```typescript
// apps/gateway/src/app.module.ts
@Module({
  imports: [
    GraphQLModule.forRootAsync<ApolloGatewayDriverConfig>({
      driver: ApolloGatewayDriver,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const protocol = configService.get('HTTP_PROTOCOL', 'http');

        const subgraphs = [
          {
            name: 'auth',
            url: `${protocol}://${configService.get('AUTH_SERVICE_NAME')}:${configService.get('AUTH_SERVICE_PORT')}/graphql`,
          },
          {
            name: 'users',
            url: `${protocol}://${configService.get('USERS_SERVICE_NAME')}:${configService.get('USERS_SERVICE_PORT')}/graphql`,
          },
          // ... other subgraphs
        ];

        return {
          gateway: {
            supergraphSdl: new IntrospectAndCompose({ subgraphs }),
            buildService({ url }) {
              return new AuthenticatedDataSource({ url });
            },
          },
        };
      },
    }),
  ],
})
export class AppModule {}
```

## Header Propagation

The gateway adds signed headers to all subgraph requests:

```typescript
// apps/gateway/src/graphql/authenticated-datasource.ts
export class AuthenticatedDataSource extends RemoteGraphQLDataSource {
  willSendRequest({ request, context }: GraphQLDataSourceProcessOptions) {
    const user = context.req?.user;

    if (user) {
      const userGroups = user.groups?.join(',') ?? '';
      const userId = user.sub ?? '';

      // Add user context headers
      request.http.headers.set('x-user-id', userId);
      request.http.headers.set('x-user-groups', userGroups);
      request.http.headers.set('x-internal-federation-call', '1');

      // Sign headers with HMAC
      const payload = `${userGroups}|1|${userId}`;
      const signature = createHmac('sha256', INTERNAL_HEADER_SECRET)
        .update(payload)
        .digest('hex');
      request.http.headers.set('x-gateway-signature', signature);
    }
  }
}
```

## REST API Reference

### POST /auth/login

Authenticates a user and returns tokens.

**Request:**
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "userId": "645a9e3...",
  "sessionId": "6460b2f...",
  "expiresIn": 3600
}
```

**Cookie Set:**
```
Set-Cookie: __Host-rf=<refreshToken>; HttpOnly; Secure; SameSite=Strict
```

### POST /auth/refresh

Refreshes an expired access token.

**Request:**
```bash
curl -X POST http://localhost:3000/auth/refresh \
  -H "Cookie: __Host-rf=<refreshToken>"
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "userId": "645a9e3...",
  "sessionId": "6460b2f...",
  "expiresIn": 3600
}
```

### POST /auth/logout

Revokes the current session.

**Request:**
```bash
curl -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer <accessToken>"
```

**Response:**
```json
{
  "success": true,
  "message": "Session revoked: 6460b2f..."
}
```

### POST /auth/force-revoke

Forcibly revokes another user's session (SUPERADMIN only).

**Request:**
```bash
curl -X POST http://localhost:3000/auth/force-revoke \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{ "targetSessionId": "6460b2f..." }'
```

**Response:**
```json
{
  "success": true,
  "message": "Session forcibly revoked: 6460b2f..."
}
```

## Authentication Flow

### GlobalAuthGuard

```typescript
// apps/gateway/src/auth/global-auth.guard.ts
@Injectable()
export class GlobalAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Check for public routes
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Get request from HTTP or GraphQL context
    const request = this.getRequest(context);
    if (!request) return false;

    // Delegate to JWT strategy
    return super.canActivate(context);
  }

  private getRequest(context: ExecutionContext) {
    if (context.getType() === 'http') {
      return context.switchToHttp().getRequest();
    }
    const gqlCtx = GqlExecutionContext.create(context);
    return gqlCtx.getContext().req;
  }
}
```

### JwtStrategy

```typescript
// apps/gateway/src/auth/jwt.strategy.ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject('AUTH_SERVICE') private authClient: ClientProxy,
    configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    // Validate session with Auth service
    const sessionCheck = await lastValueFrom(
      this.authClient.send<CheckSessionResponse>('CHECK_SESSION', {
        sessionId: payload.sessionId,
      })
    );

    if (!sessionCheck.isValid) {
      throw new UnauthorizedException(sessionCheck.reason);
    }

    return {
      sub: payload.sub,
      sessionId: payload.sessionId,
      groups: sessionCheck.groupIds || payload.groups,
    };
  }
}
```

## GraphQL Endpoint

Access the GraphQL playground at `http://localhost:3000/graphql`.

### Example Query

```graphql
query {
  findAllUsers(pagination: { limit: 10, page: 1 }) {
    items {
      _id
      authData {
        name
        email
      }
      additionalFieldsData {
        active
        seniorityLevel {
          _id
          name
        }
      }
    }
    totalCount
    hasNextPage
  }
}
```

### Example Mutation

```graphql
mutation {
  createUser(createUserInput: {
    authData: {
      name: "John"
      surname: "Doe"
      email: "john.doe@example.com"
      password: "SecurePass123!"
    }
    additionalFieldsData: {
      active: true
    }
  }) {
    _id
    authData {
      name
      email
    }
  }
}
```

## RPC Patterns Used

| Pattern | Service | Purpose |
|---------|---------|---------|
| `LOGIN` | Auth | Process login request |
| `REFRESH_SESSION` | Auth | Refresh access token |
| `CHECK_SESSION` | Auth | Validate session on each request |
| `REVOKE_SESSION` | Auth | Logout / force revoke |

## Security Features

### 1. JWT Validation

- Tokens are validated on every request
- Session is checked server-side via `CHECK_SESSION`
- Invalid/expired sessions are rejected immediately

### 2. HMAC Signature

- All internal headers are signed with HMAC-SHA256
- Subgraphs verify signature before trusting headers
- Timing-safe comparison prevents timing attacks

### 3. Refresh Token Security

- Stored in httpOnly cookie (no JS access)
- Secure flag requires HTTPS
- SameSite=strict prevents CSRF
- Tokens rotated on each refresh

### 4. CORS Configuration

```typescript
// apps/gateway/src/main.ts
app.enableCors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
  credentials: true, // Required for cookies
});
```

## Troubleshooting

### "Subgraph not reachable"

1. Check if the subgraph service is running
2. Verify the service URL in environment variables
3. Check Docker network connectivity

### "Invalid signature"

1. Verify `INTERNAL_HEADER_SECRET` matches across services
2. Check that gateway is setting all required headers

### "Session not valid"

1. Check Auth service logs for details
2. Verify Redis connectivity
3. Check session hasn't expired or been revoked

## File Structure

```
apps/gateway/
├── src/
│   ├── main.ts                    # Entry point
│   ├── app.module.ts              # Module configuration
│   ├── app.controller.ts          # Health check endpoint
│   ├── auth/
│   │   ├── auth.controller.ts     # REST endpoints
│   │   ├── jwt.strategy.ts        # JWT validation
│   │   └── global-auth.guard.ts   # Request authentication
│   └── graphql/
│       └── authenticated-datasource.ts  # Header propagation
├── Dockerfile
└── README.md
```

## Next Steps

- [Auth Service](/services/auth) - Session management
- [Authentication Flow](/architecture/auth-flow) - Complete auth flow
- [Federation](/architecture/federation) - How subgraphs compose
