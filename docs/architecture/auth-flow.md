# Authentication Flow

This document describes the complete authentication flow in Cucu, from login through JWT validation and session management.

## Overview

Cucu uses a **session-based authentication** model with:

- **JWT access tokens** (short-lived, 15 minutes)
- **Refresh tokens** (long-lived, 7 days, stored in httpOnly cookie)
- **Server-side sessions** (MongoDB, validated on every request)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────►│   Gateway   │────►│    Auth     │────►│   Users     │
│             │◄────│             │◄────│   Service   │◄────│   Service   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
     │                    │                   │                   │
     │ 1. POST /login     │                   │                   │
     │───────────────────►│                   │                   │
     │                    │ 2. RPC: LOGIN     │                   │
     │                    │──────────────────►│                   │
     │                    │                   │ 3. FIND_USER_BY_EMAIL
     │                    │                   │──────────────────►│
     │                    │                   │◄──────────────────│
     │                    │                   │ 4. Verify password │
     │                    │                   │ 5. Create session  │
     │                    │                   │ 6. Sign JWT        │
     │                    │◄──────────────────│                   │
     │ 7. { accessToken } │                   │                   │
     │◄───────────────────│                   │                   │
     │ Cookie: refreshToken                   │                   │
```

## Login Flow

### 1. Client Sends Login Request

```bash
POST /auth/login HTTP/1.1
Host: localhost:3000
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

### 2. Gateway Forwards to Auth Service

```typescript
// apps/gateway/src/auth/auth.controller.ts
@Post('login')
async login(
  @Body() body: { email: string; password: string },
  @Req() req: Request,
  @Res({ passthrough: true }) res: Response,
) {
  // Extract device info from request
  const ip = req.ip;
  const ua = req.headers['user-agent'];
  const deviceInfo = parseUserAgent(ua);

  // RPC to Auth service
  const result = await lastValueFrom(
    this.authClient.send<LoginResponse>('LOGIN', {
      email: body.email,
      password: body.password,
      ip,
      deviceName: deviceInfo.device,
      browserName: deviceInfo.browser,
      deviceFingerprint: req.headers['x-device-fingerprint'],
    })
  );

  // Set refresh token cookie
  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    domain: REFRESH_COOKIE_DOMAIN,
    maxAge: parseDuration(REFRESH_COOKIE_MAXAGE),
  });

  return {
    accessToken: result.accessToken,
    userId: result.userId,
    sessionId: result.sessionId,
    expiresIn: result.expiresIn,
  };
}
```

### 3. Auth Service Validates Credentials

```typescript
// apps/auth/src/auth.service.ts
async login(data: LoginPayload): Promise<LoginResponse> {
  // 1. Find user by email (RPC to Users)
  const user = await lastValueFrom(
    this.usersClient.send('FIND_USER_BY_EMAIL', {
      email: data.email,
      forAuth: true,
    })
  );

  if (!user) {
    throw new UnauthorizedException('Invalid credentials');
  }

  // 2. Verify password
  const passwordValid = await bcrypt.compare(data.password, user.password);
  if (!passwordValid) {
    throw new UnauthorizedException('Invalid credentials');
  }

  // 3. Get/cache group IDs
  let groupIds = await this.cacheManager.get<string[]>(`groups:${user._id}`);
  if (!groupIds) {
    const groupData = await lastValueFrom(
      this.usersClient.send('FIND_GROUPIDS_BY_USERID', { userId: user._id })
    );
    groupIds = groupData.groupIds;
    await this.cacheManager.set(`groups:${user._id}`, groupIds, 3600000); // 1h
  }

  // 4. Create session in MongoDB
  const session = await this.sessionModel.create({
    userId: user._id,
    deviceName: data.deviceName,
    browserName: data.browserName,
    ip: data.ip,
    deviceFingerprint: data.deviceFingerprint,
    refreshToken: this.generateRefreshToken(),
    lastActivity: new Date(),
    expiresAt: new Date(Date.now() + parseDuration(MAX_SESSION_AGE)),
  });

  // 5. Sign JWT
  const accessToken = this.jwtService.sign({
    sub: user._id,
    sessionId: session._id.toString(),
    groups: groupIds,
  });

  return {
    accessToken,
    refreshToken: session.refreshToken,
    userId: user._id,
    sessionId: session._id.toString(),
    expiresIn: parseDuration(ACCESS_TOKEN_EXPIRES_IN) / 1000,
  };
}
```

## Request Authentication Flow

Every GraphQL request goes through the GlobalAuthGuard:

```
┌─────────────────────────────────────────────────────────────────┐
│                        GraphQL Request                           │
│              Authorization: Bearer <accessToken>                 │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                       GlobalAuthGuard                            │
│  1. Check if route is public (whitelist)                        │
│  2. Extract JWT from Authorization header                        │
│  3. Pass to JwtStrategy                                          │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                         JwtStrategy                              │
│  1. Decode JWT, verify signature                                │
│  2. Extract: sub (userId), sessionId, groups                    │
│  3. RPC to Auth: CHECK_SESSION                                  │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Auth Service: CHECK_SESSION                   │
│  1. Find session by sessionId                                   │
│  2. Check not revoked (revokedAt === null)                      │
│  3. Check not expired (expiresAt > now)                         │
│  4. Check idle timeout (lastActivity + timeout > now)           │
│  5. Update lastActivity                                          │
│  6. Return { isValid: true, userId, groupIds }                  │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Request Authorized                          │
│  req.user = { sub: userId, sessionId, groups }                  │
│  Headers added to subgraph requests                             │
└─────────────────────────────────────────────────────────────────┘
```

### JwtStrategy Implementation

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
    // Validate session is still active
    const sessionCheck = await lastValueFrom(
      this.authClient.send<CheckSessionResponse>('CHECK_SESSION', {
        sessionId: payload.sessionId,
      })
    );

    if (!sessionCheck.isValid) {
      throw new UnauthorizedException(sessionCheck.reason || 'Session invalid');
    }

    // Return user info for request context
    return {
      sub: payload.sub,
      sessionId: payload.sessionId,
      groups: sessionCheck.groupIds || payload.groups,
    };
  }
}
```

### Session Validation

```typescript
// apps/auth/src/auth.service.ts
async checkSessionValidity(sessionId: string): Promise<CheckSessionResponse> {
  const session = await this.sessionModel.findById(sessionId).lean();

  if (!session) {
    return { isValid: false, reason: 'Session not found' };
  }

  if (session.revokedAt) {
    return { isValid: false, reason: 'Session revoked' };
  }

  const now = new Date();

  // Check max session age
  if (session.expiresAt && session.expiresAt < now) {
    return { isValid: false, reason: 'Session expired' };
  }

  // Check idle timeout
  const idleTimeout = parseDuration(SESSION_IDLE_TIMEOUT);
  const idleDeadline = new Date(session.lastActivity.getTime() + idleTimeout);
  if (idleDeadline < now) {
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

## Token Refresh Flow

```
┌─────────────┐                    ┌─────────────┐
│   Client    │                    │   Gateway   │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │ 1. POST /auth/refresh            │
       │    Cookie: __Host-rf=<token>     │
       │─────────────────────────────────►│
       │                                  │
       │                   2. RPC: REFRESH_SESSION
       │                      { refreshToken }
       │                                  │──────────────────►
       │                                  │                   │
       │                                  │   Auth Service    │
       │                                  │                   │
       │                                  │   3. Find session │
       │                                  │   4. Verify token │
       │                                  │   5. Sign new JWT │
       │                                  │   6. Rotate refresh│
       │                                  │◄──────────────────│
       │                                  │
       │ 7. { accessToken }               │
       │    Cookie: __Host-rf=<newToken>  │
       │◄─────────────────────────────────│
```

### Implementation

```typescript
// apps/gateway/src/auth/auth.controller.ts
@Post('refresh')
async refresh(
  @Req() req: Request,
  @Res({ passthrough: true }) res: Response,
) {
  const refreshToken = req.cookies[REFRESH_COOKIE_NAME];

  if (!refreshToken) {
    throw new UnauthorizedException('No refresh token');
  }

  const result = await lastValueFrom(
    this.authClient.send<RefreshResponse>('REFRESH_SESSION', { refreshToken })
  );

  // Rotate refresh token
  res.cookie(REFRESH_COOKIE_NAME, result.newRefreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    domain: REFRESH_COOKIE_DOMAIN,
    maxAge: parseDuration(REFRESH_COOKIE_MAXAGE),
  });

  return {
    accessToken: result.accessToken,
    userId: result.userId,
    sessionId: result.sessionId,
    expiresIn: result.expiresIn,
  };
}
```

## Logout Flow

### Single Session Logout

```typescript
// apps/gateway/src/auth/auth.controller.ts
@Post('logout')
@UseGuards(AuthGuard('jwt'))
async logout(
  @Req() req: Request,
  @Res({ passthrough: true }) res: Response,
) {
  const { sessionId, sub: userId } = req.user;

  await lastValueFrom(
    this.authClient.send('REVOKE_SESSION', {
      sessionId,
      requestUserId: userId,
      force: false,
    })
  );

  // Clear refresh token cookie
  res.clearCookie(REFRESH_COOKIE_NAME, {
    domain: REFRESH_COOKIE_DOMAIN,
  });

  return { success: true, message: `Session revoked: ${sessionId}` };
}
```

### Force Revoke (Admin Only)

```typescript
@Post('force-revoke')
@UseGuards(AuthGuard('jwt'))
async forceRevoke(
  @Body() body: { targetSessionId: string },
  @Req() req: Request,
) {
  // Verify caller is SUPERADMIN
  if (!req.user.groups?.includes('SUPERADMIN')) {
    throw new ForbiddenException('SUPERADMIN required');
  }

  await lastValueFrom(
    this.authClient.send('REVOKE_SESSION', {
      sessionId: body.targetSessionId,
      requestUserId: req.user.sub,
      force: true,
    })
  );

  return { success: true, message: `Session forcibly revoked` };
}
```

## Session Schema

```typescript
// apps/auth/src/schemas/session.schema.ts
@Schema({ timestamps: true })
export class Session {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop()
  deviceName: string;

  @Prop()
  browserName: string;

  @Prop()
  ip: string;

  @Prop()
  deviceFingerprint: string;

  @Prop({ required: true, unique: true })
  refreshToken: string;

  @Prop({ required: true })
  lastActivity: Date;

  @Prop()
  expiresAt: Date;

  @Prop({ default: null })
  revokedAt: Date | null;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}
```

## Environment Configuration

```ini
# JWT Settings
JWT_SECRET=ProdSecretKey              # Must be same across gateway and auth
JWT_EXPIRES_IN=15m                    # Access token lifetime

# Session Settings
ACCESS_TOKEN_EXPIRES_IN=1h            # Legacy, use JWT_EXPIRES_IN
REFRESH_EXPIRES_IN=7d                 # Refresh token lifetime
SESSION_IDLE_TIMEOUT=4h               # Revoke after inactivity
MAX_SESSION_AGE=24h                   # Maximum session duration

# Refresh Cookie
REFRESH_COOKIE_NAME=__Host-rf         # Cookie name
REFRESH_COOKIE_DOMAIN=localhost       # Cookie domain
REFRESH_COOKIE_SECURE=true            # HTTPS only
REFRESH_COOKIE_SAMESITE=strict        # CSRF protection
REFRESH_COOKIE_MAXAGE=7d              # Cookie lifetime
```

## Security Considerations

### 1. JWT Secret Management

- Use a strong, random secret (32+ bytes)
- Same secret must be used by Gateway and Auth service
- Rotate regularly in production

### 2. Session Validation

- Every request validates session server-side
- Sessions can be revoked instantly
- Idle timeout prevents abandoned sessions

### 3. Refresh Token Security

- Stored in httpOnly cookie (not accessible via JavaScript)
- Secure flag requires HTTPS
- SameSite=strict prevents CSRF
- Tokens are rotated on each refresh

### 4. Device Tracking

- Sessions track device/browser info
- Users can see active sessions
- Suspicious sessions can be revoked

## Next Steps

- [Permission System](/architecture/permissions) - Authorization after authentication
- [Gateway Service](/services/gateway) - Auth controller implementation
- [Auth Service](/services/auth) - Session management details
