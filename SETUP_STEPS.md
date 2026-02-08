# Quick Setup Steps

## Step 1: Create Database (if not exists)

Create the database manually using one of these methods:

**Option A: Using psql command line:**
```bash
psql -U postgres
CREATE DATABASE mydb;
\q
```

**Option B: Using pgAdmin or any PostgreSQL GUI tool**

**Option C: The database will be auto-created if your PostgreSQL user has permissions**

## Step 2: Verify .env file

Make sure your `.env` file has:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/mydb?schema=public"
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
PORT=3000
FRONTEND_URL=http://localhost:5173
```

## Step 3: Seed the Database

This will create all tables and add sample data:
```bash
npm run seed
```

Expected output:
```
🌱 Seeding database...
✅ Database connected successfully
✅ Seeding completed!
```

## Step 4: Start the Server

```bash
npm run dev
```

Expected output:
```
✅ Database connected successfully
🚀 Server running on http://localhost:3000
📚 API available at http://localhost:3000/api
```

## Step 5: Test the API

Open your browser or use curl:
```bash
curl http://localhost:3000/health
```

Should return:
```json
{"status":"ok","timestamp":"..."}
```

## Troubleshooting

### Database Connection Error
- Verify PostgreSQL is running: `pg_isready` or check your PostgreSQL service
- Check DATABASE_URL in .env matches your PostgreSQL credentials
- Ensure database `mydb` exists

### Port Already in Use
- Change PORT in .env to a different number (e.g., 3001)

### TypeORM Errors
- Make sure all npm packages are installed: `npm install`
- Check that TypeORM entities are properly imported

## Next: Update Routes

⚠️ **Important**: Most route files still use Prisma syntax. They need to be updated to TypeORM. The `auth.ts` route is already updated as an example.

You can:
1. Test the auth endpoints first (login, etc.)
2. Update other routes following the auth.ts pattern
3. Or I can help update all routes
