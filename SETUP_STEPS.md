# Quick Setup Steps (New Database / Fresh Start)

**You do need to create the database yourself.** The app does not create the PostgreSQL database—only the tables inside it (when `synchronize` runs in development).

---

## Step 1: Create the database

Create an **empty** database. TypeORM will not create it for you.

**Option A – psql:**
```bash
psql -U postgres -c "CREATE DATABASE mydb;"
```

**Option B – pgAdmin or any PostgreSQL GUI:** create a new database (e.g. `mydb`).

---

## Step 2: Configure .env

Copy `env.example` to `.env` and set at least:

```env
NODE_ENV=development
DATABASE_URL="postgresql://postgres:password@localhost:5432/mydb?schema=public"
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
PORT=3000
FRONTEND_URL=http://localhost:5173
```

Use the same database name you created in Step 1.

---

## Step 3: Install dependencies (if not done)

```bash
npm install
```

---

## Step 4: Create tables and seed data

With `NODE_ENV=development`, TypeORM will create/update tables when the DataSource initializes. Easiest: run the seed (it initializes the DB and then inserts data):

```bash
npm run seed
```

This will:

- Connect to the DB
- **Create all tables** (synchronize in development)
- Insert sample schools, admins, teachers, classes, grade groups, prizes

Expected output:

```
🌱 Seeding database...
✅ Database connected successfully
✅ Seeding completed!
```

---

## Step 5: Start the server

```bash
npm run dev
```

Expected output:

```
✅ Database connected successfully
🚀 Server running on http://localhost:3000
```

---

## Alternative: create tables by starting the server first

If you prefer not to run the seed:

1. Create the DB and set `.env` (Steps 1–2).
2. Run **only** the server: `npm run dev`.  
   On first run, with `NODE_ENV=development`, tables are created automatically.
3. Optionally run `npm run seed` later to add sample data.

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
