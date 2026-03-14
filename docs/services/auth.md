# Auth Service

The Auth service manages **sessions, JWT tokens, and authentication** for the Cucu platform.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 3001 |
| **Database** | auth-db (MongoDB, port 9001) |
| **Role** | Session management, JWT issuance, token refresh |
| **Dependencies** | Users |

## Schema

### Session

```typescript
interface Session {
  _id: ID;
  userId: string;           // Reference to User
  deviceName: string;       // e.g., "Chrome on Windows"
  browserName: string;      // e.g., "Chrome"
  ip: string;               // Client IP address
  deviceFingerprint: string; // Client fingerprint
  refreshToken: string;     // Unique refresh token
  lastActivity: Date;       // Updated on each request
  expiresAt: Date;          // Maximum session lifetime
  revokedAt: Date | null;   // Set when session is revoked
  createdAt: Date;
  updatedAt: Date;
}
```

## API Reference

### GraphQL Operations

#### Queries

```graphql
# List all sessions (admin use)
query {
  findAllSessions {
    _id
    userId
    deviceName
    browserName
    ip
    createdAt
    lastActivity
    revokedAt
  }
}

# Find sessions for current user
query {
  findUserSessions {
    _id
    deviceName
    browserName
    ip
    createdAt
    lastActivity
  }
}
```

#### Mutations

```graphql
# Logout current session
mutation Logout($input: LogoutInput!) {
  logout(input: $input)
}

# Variables
{
  "input": { "sessionId": "6460b2f7..." }
}

# Revoke specific session
mutation RevokeSession($input: RevokeSessionInput!) {
  revokeSession(input: $input)
}

# Revoke all sessions for a user
mutation RevokeUserSessions($userId: String) {
  revokeUserSessions(userId: $userId)
}
```

## RPC Patterns

### Message Patterns

| Pattern | Payload | Response |
|---------|---------|----------|
| `LOGIN` | `{ email, password, ip, deviceName, browserName, deviceFingerprint }` | `{ accessToken, refreshToken, userId, sessionId, expiresIn }` |
| `CHECK_SESSION` | `{ sessionId }` | `{ isValid, userId?, groupIds?, reason? }` |
| `REFRESH_SESSION` | `{ refreshToken }` | `{ accessToken, newRefreshToken, userId, sessionId, expiresIn }` |
| `REVOKE_SESSION` | `{ sessionId, requestUserId, force }` | `void` |

### Event Patterns

| Pattern | Payload | Purpose |
|---------|---------|---------|
| `USER_DELETED` | `{ userId }` | Revoke all sessions for deleted user |
| `REVOKE_ALL_SESSIONS` | `{ userId }` | Revoke all sessions for user (e.g., password change) |

## Implementation Details

### Login Process

```typescript
// apps/auth/src/auth.service.ts
async login(data: LoginPayload): Promise<LoginResponse> {
  // 1. Find user by email
  const user = await lastValueFrom(
    this.usersClient.send('FIND_USER_BY_EMAIL', {
      email: data.email,
      forAuth: true,
    })
  );

  if (!user) {
    throw new UnauthorizedException('Invalid credentials');
  }

  // 2. Verify password with bcrypt
  const passwordValid = await bcrypt.compare(data.password, user.password);
  if (!passwordValid) {
    throw new UnauthorizedException('Invalid credentials');
  }

  // 3. Get group IDs (with caching)
  let groupIds = await this.cacheManager.get<string[]>(`groups:${user._id}`);
  if (!groupIds) {
    const result = await lastValueFrom(
      this.usersClient.send('FIND_GROUPIDS_BY_USERID', { userId: user._id })
    );
    groupIds = result.groupIds;
    await this.cacheManager.set(`groups:${user._id}`, groupIds, 3600000);
  }

  // 4. Create session document
  const refreshToken = this.generateRefreshToken();
  const session = await this.sessionModel.create({
    userId: user._id,
    deviceName: data.deviceName,
    browserName: data.browserName,
    ip: data.ip,
    deviceFingerprint: data.deviceFingerprint,
    refreshToken,
    lastActivity: new Date(),
    expiresAt: new Date(Date.now() + parseDuration(this.maxSessionAge)),
  });

  // 5. Sign JWT access token
  const accessToken = this.jwtService.sign({
    sub: user._id,
    sessionId: session._id.toString(),
    groups: groupIds,
  });

  return {
    accessToken,
    refreshToken,
    userId: user._id,
    sessionId: session._id.toString(),
    expiresIn: parseDuration(this.accessTokenExpiresIn) / 1000,
  };
}
```

### Session Validation

```typescript
async checkSessionValidity(sessionId: string): Promise<CheckSessionResponse> {
  const session = await this.sessionModel.findById(sessionId).lean();

  // Session not found
  if (!session) {
    return { isValid: false, reason: 'Session not found' };
  }

  // Session was revoked
  if (session.revokedAt) {
    return { isValid: false, reason: 'Session revoked' };
  }

  const now = new Date();

  // Check maximum session age
  if (session.expiresAt && session.expiresAt < now) {
    return { isValid: false, reason: 'Session expired' };
  }

  // Check idle timeout
  const idleTimeout = parseDuration(this.sessionIdleTimeout);
  const idleDeadline = new Date(session.lastActivity.getTime() + idleTimeout);
  if (idleDeadline < now) {
    // Auto-revoke idle sessions
    await this.sessionModel.updateOne(
      { _id: sessionId },
      { revokedAt: now }
    );
    return { isValid: false, reason: 'Session idle timeout' };
  }

  // Update last activity
  await this.sessionModel.updateOne(
    { _id: sessionId },
    { lastActivity: now }
  );

  // Get fresh group IDs
  const groupIds = await this.getGroupIds(session.userId);

  return {
    isValid: true,
    userId: session.userId,
    groupIds,
  };
}
```

### Token Refresh

```typescript
async refreshSession(refreshToken: string): Promise<RefreshResponse> {
  // 1. Find session by refresh token
  const session = await this.sessionModel.findOne({
    refreshToken,
    revokedAt: null,
  });

  if (!session) {
    throw new UnauthorizedException('Invalid refresh token');
  }

  // 2. Check session is still valid
  if (session.expiresAt && session.expiresAt < new Date()) {
    throw new UnauthorizedException('Session expired');
  }

  // 3. Rotate refresh token
  const newRefreshToken = this.generateRefreshToken();
  session.refreshToken = newRefreshToken;
  session.lastActivity = new Date();
  await session.save();

  // 4. Get fresh group IDs
  const groupIds = await this.getGroupIds(session.userId);

  // 5. Sign new access token
  const accessToken = this.jwtService.sign({
    sub: session.userId,
    sessionId: session._id.toString(),
    groups: groupIds,
  });

  return {
    accessToken,
    newRefreshToken,
    userId: session.userId,
    sessionId: session._id.toString(),
    expiresIn: parseDuration(this.accessTokenExpiresIn) / 1000,
  };
}
```

### Session Revocation

```typescript
async revokeSession(
  sessionId: string,
  requestUserId: string,
  force: boolean
): Promise<void> {
  const session = await this.sessionModel.findById(sessionId);

  if (!session) {
    throw new NotFoundException('Session not found');
  }

  // Non-forced revocation must be own session
  if (!force && session.userId !== requestUserId) {
    throw new ForbiddenException('Cannot revoke another user\'s session');
  }

  session.revokedAt = new Date();
  await session.save();
}

async revokeAllSessionsOfUser(userId: string): Promise<void> {
  await this.sessionModel.updateMany(
    { userId, revokedAt: null },
    { revokedAt: new Date() }
  );
}
```

## Configuration

### Environment Variables

```ini
# Service Config
AUTH_SERVICE_NAME=auth
AUTH_SERVICE_PORT=3001
AUTH_DB_HOST=auth-db
AUTH_DB_PORT=9001

# MongoDB
MONGODB_URI=mongodb://auth-db:27017/auth

# JWT Settings
JWT_SECRET=ProdSecretKey
JWT_EXPIRES_IN=15m
ACCESS_TOKEN_EXPIRES_IN=1h

# Session Settings
REFRESH_EXPIRES_IN=7d
SESSION_IDLE_TIMEOUT=4h
MAX_SESSION_AGE=24h

# Redis Cache
REDIS_SERVICE_HOST=redis
REDIS_SERVICE_TLS_PORT=6380
```

### JWT Configuration

```typescript
// apps/auth/src/auth.module.ts
JwtModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => ({
    secret: configService.get('JWT_SECRET'),
    signOptions: {
      expiresIn: configService.get('JWT_EXPIRES_IN', '15m'),
    },
  }),
})
```

## Security Features

### 1. Password Handling

- Passwords are hashed with bcrypt (salt rounds: 10)
- Raw passwords are never logged or stored
- Password verification uses constant-time comparison

### 2. Session Security

- Sessions stored server-side in MongoDB
- Validated on every request (not just JWT)
- Automatic idle timeout and max age
- Immediate revocation capability

### 3. Token Security

- JWT contains minimal claims (userId, sessionId, groups)
- Short expiry (15 minutes default)
- Refresh tokens are unique per session
- Refresh rotation prevents replay attacks

### 4. Device Tracking

- Session records device info
- Users can see active sessions
- Suspicious sessions can be revoked

## Event Handling

### USER_DELETED Event

```typescript
// apps/auth/src/auth.controller.ts
@EventPattern('USER_DELETED')
async handleUserDeleted(@Payload() data: { userId: string }) {
  this.logger.log(`USER_DELETED received for userId=${data.userId}`);
  await this.authService.revokeAllSessionsOfUser(data.userId);
}
```

### REVOKE_ALL_SESSIONS Event

```typescript
@EventPattern('REVOKE_ALL_SESSIONS')
async handleRevokeAllSessions(@Payload() data: { userId: string }) {
  this.logger.log(`REVOKE_ALL_SESSIONS received for userId=${data.userId}`);
  await this.authService.revokeAllSessionsOfUser(data.userId);
}
```

## File Structure

```
apps/auth/
├── src/
│   ├── main.ts
│   ├── auth.module.ts
│   ├── auth.controller.ts       # RPC handlers
│   ├── auth.resolver.ts         # GraphQL mutations
│   ├── auth.service.ts          # Business logic
│   ├── schemas/
│   │   └── session.schema.ts    # Mongoose schema
│   ├── entities/
│   │   └── session.entity.ts    # GraphQL type
│   └── dto/
│       ├── login.input.ts
│       ├── logout.input.ts
│       └── revoke-session.input.ts
├── Dockerfile
└── README.md
```

## Troubleshooting

### "Session not found"

1. Check sessionId is correct
2. Verify session hasn't been revoked
3. Check MongoDB connectivity

### "Session idle timeout"

1. Session was inactive too long (default 4h)
2. User needs to re-authenticate

### "Invalid refresh token"

1. Token may have been rotated already
2. Session may have been revoked
3. Check cookie is being sent correctly

## Next Steps

- [Users Service](/services/users) - User management
- [Authentication Flow](/architecture/auth-flow) - End-to-end auth
- [Gateway](/services/gateway) - Entry point that calls Auth
