# Debugging Guide

This guide covers common issues and debugging techniques for the Cucu platform.

## Common Issues

### Service Won't Start

#### "Connection refused" to MongoDB

**Symptoms:**
```
MongoNetworkError: connect ECONNREFUSED 127.0.0.1:27017
```

**Solutions:**
1. Check Docker container is running:
   ```bash
   docker-compose ps
   docker-compose logs <service>-db
   ```

2. Verify MongoDB URI:
   ```bash
   echo $MONGODB_URI
   # Should be: mongodb://<service>-db:27017/<database>
   ```

3. Restart the database:
   ```bash
   docker-compose restart <service>-db
   ```

#### "Connection refused" to Redis

**Symptoms:**
```
Error: connect ECONNREFUSED redis:6379
```

**Solutions:**
1. Check Redis is running:
   ```bash
   docker-compose logs redis
   redis-cli -h localhost -p 6379 ping
   ```

2. Check TLS certificates (if using mTLS):
   ```bash
   ls -la /path/to/certs/
   # Should have: ca.crt, <service>.crt, <service>.key
   ```

3. Verify Redis environment variables:
   ```bash
   echo $REDIS_SERVICE_HOST
   echo $REDIS_SERVICE_TLS_PORT
   ```

#### Dependency Timeout

**Symptoms:**
```
Error: Dependency timeout waiting for [auth, users]
```

**Solutions:**
1. Check dependency services are running:
   ```bash
   redis-cli keys 'service_ready:*'
   ```

2. Manually mark service as ready (testing only):
   ```bash
   redis-cli set service_ready:grants 1 EX 86400
   ```

3. Check dependency configuration:
   ```bash
   echo $MY_SERVICE_DEPENDENCIES
   # Should be: ["grants"]
   ```

### Authentication Issues

#### "Invalid signature"

**Symptoms:**
```
UnauthorizedException: Invalid signature
```

**Cause:** HMAC signature mismatch between gateway and service.

**Solutions:**
1. Verify `INTERNAL_HEADER_SECRET` is the same across all services:
   ```bash
   # On gateway
   echo $INTERNAL_HEADER_SECRET
   # On each service
   echo $INTERNAL_HEADER_SECRET
   ```

2. Check header propagation:
   ```typescript
   // In resolver, log headers
   console.log('x-gateway-signature:', req.headers['x-gateway-signature']);
   console.log('x-user-groups:', req.headers['x-user-groups']);
   ```

#### "Session not valid"

**Symptoms:**
```
UnauthorizedException: Session not valid
```

**Solutions:**
1. Check session in Auth database:
   ```bash
   # Connect to auth-db
   mongo mongodb://localhost:9001/auth
   db.sessions.findOne({ _id: ObjectId("session-id") })
   ```

2. Check session hasn't expired:
   - `revokedAt` should be null
   - `expiresAt` should be in the future
   - `lastActivity` + idle timeout should be in the future

3. Check Redis connectivity for Auth service:
   ```bash
   docker-compose logs auth
   ```

#### "Invalid refresh token"

**Solutions:**
1. Check cookie is being sent:
   ```bash
   curl -v http://localhost:3000/auth/refresh \
     --cookie "__Host-rf=<token>"
   ```

2. Verify cookie settings:
   ```bash
   echo $REFRESH_COOKIE_NAME
   echo $REFRESH_COOKIE_DOMAIN
   ```

### Permission Issues

#### "Operation not allowed"

**Symptoms:**
```
ForbiddenException: Operation "createUser" not allowed
```

**Solutions:**
1. Check operation permission exists:
   ```graphql
   query {
     findOperationPermissionsByGroup(groupId: "user-group-id") {
       operationName
       canExecute
     }
   }
   ```

2. Check user's groups:
   ```graphql
   query {
     findOneUser(userId: "user-id") {
       authData { groupIds }
     }
   }
   ```

3. Verify operation name matches:
   - GraphQL operation name in resolver
   - `serviceName=Entity` in description

4. Clear permission cache:
   ```typescript
   PermissionsCacheService.invalidateAll();
   ```

#### "No view permission"

**Symptoms:**
```
ForbiddenException: No view permission on "User"
```

**Solutions:**
1. Check field permissions exist:
   ```graphql
   query {
     findPermissionsByGroup(groupId: "user-group-id", entityName: "User") {
       fieldPath
       canView
     }
   }
   ```

2. Create basic permissions:
   ```graphql
   mutation {
     createPermission(input: {
       groupId: "user-group-id"
       entityName: "User"
       fieldPath: "_id"
       canView: true
     }) { _id }
   }
   ```

#### Scope Restriction

**Symptoms:**
```
ForbiddenException: Operation "findOneUser" restricted to own resources
```

**Cause:** User has `scope: 'self'` and is trying to access another user's data.

**Solutions:**
1. Verify this is expected behavior
2. Grant `scope: 'all'` if needed:
   ```graphql
   mutation {
     updateOperationPermission(input: {
       _id: "op-perm-id"
       scope: "all"
     }) { _id }
   }
   ```

### GraphQL Issues

#### "Cannot return null for non-nullable field"

**Cause:** Field is marked as non-nullable but resolver returned null.

**Solutions:**
1. Make field nullable if appropriate:
   ```typescript
   @Field({ nullable: true })
   optionalField?: string;
   ```

2. Fix resolver to always return a value:
   ```typescript
   async resolveField(): Promise<string> {
     return this.value ?? '';  // Default value
   }
   ```

#### Federation Reference Not Resolving

**Symptoms:**
```
{ "user": null }  // When it should have data
```

**Solutions:**
1. Check `@ResolveReference` is implemented:
   ```typescript
   @ResolveReference()
   async resolveReference(ref: { __typename: string; _id: string }) {
     console.log('Resolving reference:', ref);
     return this.service.findById(ref._id);
   }
   ```

2. Check stub entity has correct directives:
   ```typescript
   @ObjectType()
   @Directive('@extends')
   @Directive('@key(fields: "_id")')
   export class User {
     @Field(() => ID)
     @Directive('@external')
     _id: string;
   }
   ```

3. Verify stub is in orphanedTypes:
   ```typescript
   buildSchemaOptions: {
     orphanedTypes: [UserEntity],
   }
   ```

### Performance Issues

#### Slow Queries

1. Check MongoDB indexes:
   ```javascript
   db.users.getIndexes()
   ```

2. Add missing indexes:
   ```javascript
   db.users.createIndex({ "authData.email": 1 })
   ```

3. Use projection to limit fields:
   ```typescript
   this.model.find({}).select('_id name').lean()
   ```

#### Permission Cache Issues

1. Check cache is being used:
   ```typescript
   // Add logging to PermissionsCacheService
   console.log('Cache hit:', MEMO.has(cacheKey));
   ```

2. Verify TTL is reasonable:
   ```typescript
   private static TTL = 5 * 60 * 1000; // 5 minutes
   ```

## Debugging Tools

### Service Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f auth

# With timestamps
docker-compose logs -f -t auth

# Last 100 lines
docker-compose logs --tail=100 auth
```

### Database Inspection

```bash
# Connect to MongoDB
mongo mongodb://localhost:9001/auth

# Useful queries
db.sessions.find({}).limit(10)
db.sessions.find({ revokedAt: null })
db.sessions.findOne({ userId: "..." })
```

### Redis Inspection

```bash
# Connect to Redis
redis-cli -h localhost -p 6379

# List all keys
KEYS *

# Check service ready status
KEYS service_ready:*
GET service_ready:auth

# Check cached data
KEYS groups:*
```

### GraphQL Debugging

```graphql
# Introspect schema
query {
  __schema {
    types { name }
  }
}

# Check subgraph SDL
query {
  _service {
    sdl
  }
}
```

### Network Debugging

```bash
# Test service connectivity
curl http://localhost:3000/
curl http://localhost:3001/graphql

# Test with authorization
curl http://localhost:3000/graphql \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __typename }"}'
```

## Restart Order

When restarting services, follow this order:

1. **Infrastructure**
   ```bash
   docker-compose restart redis
   ```

2. **Core Services** (no dependencies)
   ```bash
   docker-compose restart grants organization
   ```

3. **Primary Services**
   ```bash
   docker-compose restart users
   docker-compose restart auth
   ```

4. **Gateway**
   ```bash
   docker-compose restart gateway
   ```

5. **Other Services**
   ```bash
   docker-compose restart projects milestones ...
   ```

## Cache Invalidation

### Permission Cache

```typescript
// Invalidate specific groups
PermissionsCacheService.invalidateGroups(['group-id']);

// Invalidate all
PermissionsCacheService.invalidateAll();
```

### Via Event

```typescript
// Emit event to invalidate across all services
this.redisClient.emit('PERMISSIONS_CHANGED', {
  groupIds: ['group-id']
});
```

### Auth Cache (Group IDs)

```bash
# Clear cached group IDs in Redis
redis-cli DEL groups:<user-id>
```

## Useful Scripts

### Reset All Service Status

```bash
redis-cli KEYS 'service_ready:*' | xargs redis-cli DEL
```

### Clear All Caches

```bash
redis-cli FLUSHALL
```

### Check Service Health

```bash
for port in 3000 3001 3002 3003 3004 3005 3011; do
  echo -n "Port $port: "
  curl -s "http://localhost:$port/" || echo "FAILED"
done
```

## Environment Checklist

- [ ] All services have same `INTERNAL_HEADER_SECRET`
- [ ] All services have same `JWT_SECRET`
- [ ] Redis host/port correct
- [ ] MongoDB URIs correct
- [ ] Dependencies configured correctly
- [ ] TLS certificates in place (if using mTLS)
- [ ] Docker network allows inter-service communication

## Getting Help

1. Check service logs for error details
2. Enable debug logging:
   ```typescript
   Logger.debug('Details', MyServiceService.name);
   ```
3. Add breakpoints in VS Code with debugger attached
4. Check GitHub issues for known problems
5. Ask in the team chat with:
   - Error message
   - Steps to reproduce
   - Relevant logs
