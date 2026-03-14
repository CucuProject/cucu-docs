# Field-Level Grants Library

The `field-level-grants` library provides utilities for introspecting GraphQL schemas and building field projections for permission filtering.

## Location

```
_shared/field-level-grants/src/
├── introspection-fields.service.ts
├── universal-grants-lookup.service.ts
├── grants-projection.helper.ts
└── index.ts
```

## LocalSchemaFieldsService

Introspects the local GraphQL schema to collect all field paths for an entity.

### Configuration

```typescript
interface LocalIntrospectionConfig {
  maxDepth?: number;          // Default: 2 (e.g., "authData.email")
  debug?: boolean;            // Default: false
  allowedTypes?: string[];    // Types to recurse into
}
```

### Usage

```typescript
@Injectable()
export class LocalSchemaFieldsService {
  constructor(private readonly schemaHost: GraphQLSchemaHost) {}

  configure(cfg: LocalIntrospectionConfig): void {
    this.maxDepth = cfg.maxDepth ?? 2;
    this.debug = cfg.debug ?? false;
    this.allowedTypes = new Set(cfg.allowedTypes ?? []);
  }

  warmUpEntities(names: string[]): void {
    for (const name of names) {
      this.getAllFieldsForEntity(name);
    }
  }

  getAllFieldsForEntity(entityName: string): Set<string> {
    if (this.fieldsCache.has(entityName)) {
      return this.fieldsCache.get(entityName)!;
    }

    const schema = this.schemaHost.schema;
    const type = schema.getType(entityName) as GraphQLObjectType;

    const fields = new Set<string>();
    this.collectFields(type, '', 0, fields);

    this.fieldsCache.set(entityName, fields);
    return fields;
  }

  private collectFields(
    type: GraphQLObjectType,
    prefix: string,
    depth: number,
    result: Set<string>
  ): void {
    if (depth > this.maxDepth) return;

    const fields = type.getFields();
    for (const [name, field] of Object.entries(fields)) {
      const path = prefix ? `${prefix}.${name}` : name;
      result.add(path);

      const innerType = this.unwrapType(field.type);
      if (
        innerType instanceof GraphQLObjectType &&
        this.allowedTypes.has(innerType.name)
      ) {
        this.collectFields(innerType, path, depth + 1, result);
      }
    }
  }
}
```

### Module Setup

```typescript
@Module({
  providers: [LocalSchemaFieldsService],
  exports: [LocalSchemaFieldsService],
})
export class FieldLevelGrantsModule {}

// In service module
export class UsersModule implements OnModuleInit {
  constructor(private readonly introspection: LocalSchemaFieldsService) {}

  onModuleInit() {
    this.introspection.configure({
      maxDepth: 2,
      debug: true,
      allowedTypes: [
        'User',
        'AuthDataSchema',
        'PersonalDataSchema',
        'EmploymentDataSchema',
        'AdditionalFieldsDataSchema',
      ],
    });
    this.introspection.warmUpEntities(['User']);
  }
}
```

## UniversalGrantsLookupService

Provides dual-mode lookup for viewable fields - via RPC or local adapter.

### Modes

#### Mode 1: External (RPC)

```typescript
@Injectable()
export class UniversalGrantsLookupService {
  constructor(
    @Inject('GRANTS_SERVICE') private readonly remoteClient?: ClientProxy,
  ) {}

  async getViewableFieldsForEntity(
    groupIds: string[],
    entityName: string
  ): Promise<Set<string>> {
    const union = new Set<string>();

    for (const groupId of groupIds) {
      const permissions = await lastValueFrom(
        this.remoteClient!.send<Permission[]>('FIND_PERMISSIONS_BY_GROUP', {
          groupId,
          entityName,
        })
      );

      for (const p of permissions) {
        if (p.canView) {
          union.add(p.fieldPath);
        }
      }
    }

    return union;
  }
}
```

#### Mode 2: Local Adapter

For services that need to bypass RPC (e.g., Grants service itself):

```typescript
interface IGrantsLocalAdapter {
  findPermissionsByGroup(groupId: string): Promise<Permission[]>;
}

@Injectable()
export class UniversalGrantsLookupService {
  constructor(
    @Optional()
    @Inject('GRANTS_LOCAL_ADAPTER')
    private readonly localAdapter?: IGrantsLocalAdapter,
  ) {}

  async getViewableFieldsForEntity(
    groupIds: string[],
    entityName: string
  ): Promise<Set<string>> {
    if (this.localAdapter) {
      // Use local adapter
      return this.fetchLocal(groupIds, entityName);
    }
    // Fall back to RPC
    return this.fetchRemote(groupIds, entityName);
  }
}
```

## GrantsProjectionHelper

Builds MongoDB projections from viewable field sets.

### buildMongooseProjection

```typescript
export function buildMongooseProjection(fields: Set<string>): string {
  // Returns space-separated field list for Mongoose select()
  return Array.from(fields).join(' ');
}

// Usage
const projection = buildMongooseProjection(viewableFields);
const user = await this.userModel.find({}).select(projection);
```

### buildProjection (Object Form)

```typescript
export function buildProjection(viewable: Set<string>): Record<string, 1> {
  const proj: Record<string, 1> = {};
  const all = Array.from(viewable);

  for (const path of all) {
    // If a child exists, skip the parent
    // e.g., if "authData.email" exists, skip "authData"
    const hasChildren = all.some(p => p.startsWith(path + '.'));
    if (hasChildren) continue;
    proj[path] = 1;
  }

  return proj;
}

// Usage
const proj = buildProjection(viewableFields);
// { "_id": 1, "authData.name": 1, "authData.email": 1 }

const user = await this.userModel.findOne({ _id }, proj);
```

## Integration Example

Complete example of field-level grants in a service:

```typescript
@Injectable()
export class UsersService {
  private static readonly SYSTEM_FIELDS = [
    '_id', 'deletedAt', 'deletedBy', 'updatedBy', 'createdAt', 'updatedAt'
  ];

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly permCache: PermissionsCacheService,
    @Inject('SUBGRAPH_CONTEXT') private uctx: ISubgraphContext,
  ) {}

  async findById(
    userId: string,
    viewable?: Set<string>
  ): Promise<User | null> {
    const allowed = await this.allowedSet('User', viewable);
    const projection = this.projection(allowed);

    const user = await this.userModel
      .findOne({ _id: userId, deletedAt: null }, projection)
      .lean()
      .exec();

    return this.sanitizeScoped(user, allowed, userId);
  }

  private async allowedSet(
    entity: string,
    external?: Set<string>
  ): Promise<Set<string> | undefined> {
    if (external) return external;

    // Skip for internal calls without user context
    if (this.uctx?.isInternalCall() && !this.uctx?.hasUserContext()) {
      return undefined;
    }

    const groups = this.uctx?.userGroups() ?? [];
    await this.permCache.ensureEntityLoaded(entity, groups);

    const auto = this.permCache.getViewableFieldsForEntity(entity);
    if (auto.size === 0) {
      throw new ForbiddenException(`No view permission on "${entity}"`);
    }
    return auto;
  }

  private projection(set?: Set<string>) {
    if (!set?.size) return undefined;

    const augmented = new Set(set);
    // Always include system fields
    for (const sf of UsersService.SYSTEM_FIELDS) {
      augmented.add(sf);
    }
    return buildProjection(augmented);
  }

  private sanitizeScoped(
    obj: any,
    allowed?: Set<string>,
    recordId?: string
  ): any {
    if (!allowed) return this.sanitize(obj, allowed);

    const currentUid = this.uctx?.currentUserId();

    // Own record: full access
    if (!currentUid || recordId === currentUid) {
      return this.sanitize(obj, allowed);
    }

    // Other user's record: exclude self-only fields
    const { allFields } = this.permCache.getFieldsByScope('User');
    return this.sanitize(obj, allFields);
  }

  private sanitize(obj: any, allowed?: Set<string>): any {
    if (!obj || !allowed) return obj;

    // Recursively filter object to only include allowed paths
    // Convert empty objects/arrays to null for GraphQL
    // ... implementation
  }
}
```

## Field Path Examples

```typescript
// Entity: User
// Fields discovered by introspection:
[
  '_id',
  'authData',
  'authData.name',
  'authData.surname',
  'authData.email',
  'authData.groupIds',
  'personalData',
  'personalData.dateOfBirth',
  'personalData.citizenship',
  'employmentData',
  'employmentData.dateOfEmployment',
  'employmentData.RAL',
  'employmentData.rates',
  'additionalFieldsData',
  'additionalFieldsData.active',
  'additionalFieldsData.seniorityLevelId',
  'additionalFieldsData.supervisorIds',
]

// Projection for VIEWER group (limited access):
{
  '_id': 1,
  'authData.name': 1,
  'authData.surname': 1,
  'additionalFieldsData.active': 1,
}

// Projection for ADMIN group (full access):
{
  '_id': 1,
  'authData.name': 1,
  'authData.surname': 1,
  'authData.email': 1,
  'personalData.dateOfBirth': 1,
  'employmentData.RAL': 1,
  // ... all fields
}
```

## Next Steps

- [Service Common](/shared/service-common) - Guards and interceptors
- [Permission System](/architecture/permissions) - How permissions work
