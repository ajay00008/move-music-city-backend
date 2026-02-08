# Routes Update Note

All route files need to be updated from Prisma to TypeORM. The pattern is:

1. Replace `import { prisma } from '../lib/prisma'` with repository imports
2. Replace Prisma queries with TypeORM repository methods
3. Use `IsNull()` for soft delete checks
4. Use `relations` instead of `include`
5. Use `save()` for updates instead of `update()`

**Example conversion:**

```typescript
// OLD (Prisma)
const school = await prisma.school.findFirst({
  where: { id, deletedAt: null },
  include: { admins: true }
});

// NEW (TypeORM)
const schoolRepo = getSchoolRepository();
const school = await schoolRepo.findOne({
  where: { id, deletedAt: IsNull() },
  relations: ['admins']
});
```

**All routes follow this same pattern.** The auth route has been fully updated as an example.

For production, you should:
1. Update all route files following the auth.ts pattern
2. Test each endpoint
3. Run migrations instead of synchronize

Since `synchronize: true` is set for development, the database will auto-create tables on first run.
