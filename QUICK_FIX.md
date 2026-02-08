# Quick Fix for Database Connection

## The Problem
The error "client password must be a string" means the password isn't being read correctly from your `.env` file.

## Solution 1: Check Your .env File

1. Make sure you have a `.env` file (not just `env.example`)
2. Copy `env.example` to `.env`:
   ```bash
   cp env.example .env
   ```

3. Edit `.env` and replace `password` with your actual PostgreSQL password:
   ```env
   DATABASE_URL="postgresql://postgres:YOUR_REAL_PASSWORD@localhost:5432/mydb?schema=public"
   ```

## Solution 2: Use Individual Parameters (Easier)

Instead of DATABASE_URL, you can use individual parameters in your `.env`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_actual_password_here
DB_NAME=mydb
```

This avoids URL encoding issues with special characters in passwords.

## Solution 3: Test Your Connection

Test if you can connect manually:
```bash
psql -U postgres -d mydb
```

If this works, your credentials are correct.

## Solution 4: Create Database if Missing

If the database doesn't exist:
```bash
psql -U postgres
CREATE DATABASE mydb;
\q
```

## After Fixing

Run the seed command again:
```bash
npm run seed
```

You should see:
```
✅ Database connected successfully
🌱 Seeding database...
✅ Seeding completed!
```
