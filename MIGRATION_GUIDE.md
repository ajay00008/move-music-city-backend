# Migration from Prisma to TypeORM

All routes have been updated to use TypeORM instead of Prisma. Here are the key changes:

## Key Differences

### Prisma → TypeORM

1. **Repository Pattern**:
   ```typescript
   // Prisma
   await prisma.user.findUnique({ where: { id } })
   
   // TypeORM
   const userRepo = getUserRepository();
   await userRepo.findOne({ where: { id, deletedAt: IsNull() } })
   ```

2. **Soft Delete**:
   ```typescript
   // Prisma
   where: { deletedAt: null }
   
   // TypeORM
   where: { deletedAt: IsNull() }
   ```

3. **Relations**:
   ```typescript
   // Prisma
   include: { school: true }
   
   // TypeORM
   relations: ['school']
   ```

4. **Updates**:
   ```typescript
   // Prisma
   await prisma.user.update({ where: { id }, data: { name: 'New' } })
   
   // TypeORM
   const user = await userRepo.findOne({ where: { id } });
   user.name = 'New';
   await userRepo.save(user);
   ```

5. **Deletes**:
   ```typescript
   // Prisma
   await prisma.user.delete({ where: { id } })
   
   // TypeORM (soft delete)
   const user = await userRepo.findOne({ where: { id } });
   user.deletedAt = new Date();
   await userRepo.save(user);
   ```

## Updated Files

All route files have been updated:
- ✅ `src/routes/auth.ts`
- ✅ `src/routes/schools.ts`
- ✅ `src/routes/teachers.ts`
- ✅ `src/routes/classes.ts`
- ✅ `src/routes/admins.ts`
- ✅ `src/routes/gradeGroups.ts`
- ✅ `src/routes/prizes.ts`
- ✅ `src/routes/earnedPrizes.ts`
- ✅ `src/routes/dashboard.ts`

## Setup

1. Install dependencies: `npm install`
2. Configure `.env` with `DATABASE_URL`
3. Run seed: `npm run seed`
4. Start server: `npm run dev`

The database will auto-sync in development mode (synchronize: true).
