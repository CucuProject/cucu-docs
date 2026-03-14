# Add New Field Guide

This guide walks you through adding a new field to an existing entity, end-to-end.

## Overview

Adding a field requires changes across multiple layers:

1. **Schema** - MongoDB schema definition
2. **Entity** - GraphQL type definition
3. **DTOs** - Input/output types
4. **Service** - Business logic (if needed)
5. **Permissions** - Field-level access control
6. **Frontend** - Display and edit the field

## Example: Adding `phoneNumber` to User

Let's add a phone number field to the User entity.

## Step 1: Update the Schema

```typescript
// apps/users/src/schemas/user.schema.ts

// Add to PersonalDataSchema
@Schema()
export class PersonalDataSchema {
  // ... existing fields

  @Prop({ required: false })
  @Field({ nullable: true })
  phoneNumber?: string;
}
```

## Step 2: Update the Entity

If the entity and schema are separate:

```typescript
// apps/users/src/entities/user.entity.ts

@ObjectType()
export class PersonalData {
  // ... existing fields

  @Field({ nullable: true })
  phoneNumber?: string;
}
```

## Step 3: Update Input DTOs

### Create Input

```typescript
// apps/users/src/dto/create-user.input.ts

@InputType()
export class CreatePersonalDataInput {
  // ... existing fields

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Phone number must be in E.164 format',
  })
  phoneNumber?: string;
}
```

### Update Input

```typescript
// apps/users/src/dto/update-user.input.ts

@InputType()
export class UpdatePersonalDataInput {
  // ... existing fields

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Phone number must be in E.164 format',
  })
  phoneNumber?: string;
}
```

## Step 4: Update Service (if needed)

If the field requires special handling:

```typescript
// apps/users/src/users.service.ts

async create(input: CreateUserInput): Promise<User> {
  // Validate phone number format
  if (input.personalData?.phoneNumber) {
    this.validatePhoneNumber(input.personalData.phoneNumber);
  }

  // ... rest of creation logic
}

private validatePhoneNumber(phone: string): void {
  // Custom validation if needed
  if (!phone.startsWith('+')) {
    throw new BadRequestException('Phone number must include country code');
  }
}
```

## Step 5: Update Field Introspection

If using local introspection, update allowed types:

```typescript
// apps/users/src/users.module.ts

onModuleInit() {
  this.introspection.configure({
    maxDepth: 2,
    allowedTypes: [
      'User',
      'AuthDataSchema',
      'PersonalDataSchema',  // phoneNumber is here
      'EmploymentDataSchema',
      'AdditionalFieldsDataSchema',
    ],
  });
}
```

## Step 6: Create Field Permission

```graphql
# For ADMIN group - full access
mutation {
  createPermission(input: {
    groupId: "admin-group-id"
    entityName: "User"
    fieldPath: "personalData.phoneNumber"
    canView: true
    canEdit: true
  }) { _id }
}

# For VIEWER group - view only
mutation {
  createPermission(input: {
    groupId: "viewer-group-id"
    entityName: "User"
    fieldPath: "personalData.phoneNumber"
    canView: true
    canEdit: false
  }) { _id }
}

# For EMPLOYEE group - self only
mutation {
  createPermission(input: {
    groupId: "employee-group-id"
    entityName: "User"
    fieldPath: "personalData.phoneNumber"
    canView: true
    canEdit: true
    scope: "self"
  }) { _id }
}
```

## Step 7: Test the Field

### Create User with Phone

```graphql
mutation {
  createUser(createUserInput: {
    authData: {
      name: "John"
      surname: "Doe"
      email: "john@example.com"
      password: "SecurePass123!"
    }
    personalData: {
      dateOfBirth: "1990-01-15"
      placeOfBirth: "Rome"
      citizenship: "Italian"
      phoneNumber: "+39123456789"  # New field
    }
    additionalFieldsData: {
      active: true
    }
  }) {
    _id
    personalData {
      phoneNumber
    }
  }
}
```

### Update Phone Number

```graphql
mutation {
  updateUser(updateUserInput: {
    _id: "user-id"
    personalData: {
      phoneNumber: "+39987654321"
    }
  }) {
    _id
    personalData {
      phoneNumber
    }
  }
}
```

### Query Phone Number

```graphql
query {
  findOneUser(userId: "user-id") {
    personalData {
      phoneNumber
    }
  }
}
```

## Step 8: Add Field Resolver (if needed)

If the field requires complex resolution:

```typescript
// apps/users/src/resolvers/personal-data.resolver.ts

@Resolver(() => PersonalDataSchema)
export class PersonalDataResolver {
  @CheckFieldView('User', 'personalData.phoneNumber')
  @UseInterceptors(FieldViewInterceptor)
  @ResolveField(() => String, { nullable: true })
  async phoneNumber(@Parent() parent: PersonalDataSchema): Promise<string | null> {
    // Custom logic, e.g., format phone number
    if (!parent.phoneNumber) return null;
    return this.formatPhoneNumber(parent.phoneNumber);
  }

  private formatPhoneNumber(phone: string): string {
    // Return formatted phone number
    return phone;
  }
}
```

## Step 9: Update Frontend

### Add to Query

```typescript
// frontend/graphql/queries/user.ts
export const GET_USER = gql`
  query GetUser($userId: String!) {
    findOneUser(userId: $userId) {
      _id
      personalData {
        dateOfBirth
        citizenship
        phoneNumber  # Add new field
      }
    }
  }
`;
```

### Add Form Field

```tsx
// frontend/components/UserForm.tsx
<FormField
  name="personalData.phoneNumber"
  label="Phone Number"
  placeholder="+39 123 456 789"
  validate={validatePhoneNumber}
/>
```

### Display Field

```tsx
// frontend/components/UserProfile.tsx
<ProfileField label="Phone" value={user.personalData?.phoneNumber} />
```

## Field Types Reference

### Scalar Fields

```typescript
@Prop()
@Field()
stringField: string;

@Prop()
@Field(() => Int)
intField: number;

@Prop()
@Field(() => Float)
floatField: number;

@Prop()
@Field()
booleanField: boolean;

@Prop()
@Field()
dateField: Date;
```

### Nullable Fields

```typescript
@Prop({ required: false })
@Field({ nullable: true })
optionalField?: string;
```

### Array Fields

```typescript
@Prop({ type: [String] })
@Field(() => [String])
tags: string[];
```

### Nested Objects

```typescript
@Prop({ type: AddressSchema })
@Field(() => Address, { nullable: true })
address?: Address;
```

### Reference Fields

```typescript
@Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Company' })
@Field(() => ID, { nullable: true })
companyId?: string;
```

## Validation Examples

```typescript
// String validation
@IsString()
@MinLength(2)
@MaxLength(100)
name: string;

// Email
@IsEmail()
email: string;

// Phone (E.164)
@Matches(/^\+?[1-9]\d{1,14}$/)
phoneNumber: string;

// Number range
@IsNumber()
@Min(0)
@Max(10000000)
salary: number;

// Date
@IsDateString()
dateOfBirth: string;

// Array
@IsArray()
@ArrayMaxSize(10)
@IsString({ each: true })
tags: string[];

// Optional
@IsOptional()
@IsString()
nickname?: string;
```

## Checklist

- [ ] Schema updated with `@Prop`
- [ ] Entity updated with `@Field`
- [ ] Create DTO updated
- [ ] Update DTO updated
- [ ] Validation rules added
- [ ] Service logic updated (if needed)
- [ ] Field resolver created (if needed)
- [ ] Permissions created for all groups
- [ ] GraphQL queries tested
- [ ] Frontend updated
- [ ] Documentation updated

## Common Issues

### Field Not Appearing in GraphQL

1. Check `@Field()` decorator is present
2. Check field is in `allowedTypes` for introspection
3. Restart the service

### Field Not Persisting

1. Check `@Prop()` decorator is present
2. Check DTO includes the field
3. Check validation is passing

### Permission Denied

1. Check permission exists for the field
2. Check user is in a group with permission
3. Check scope is correct (self vs all)

## Next Steps

- [Add New Permission Guide](/guides/add-new-permission) - Set up permissions
- [Add New Service Guide](/guides/add-new-service) - Create a new service
