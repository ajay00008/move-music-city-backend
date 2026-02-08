# Troubleshooting Database Connection

## Error: "client password must be a string"

This usually means:
1. The password in DATABASE_URL is empty or not properly formatted
2. The password contains special characters that need URL encoding

## Solutions:

### 1. Check your .env file
Make sure your `.env` file has:
```env
DATABASE_URL="postgresql://postgres:your_actual_password@localhost:5432/mydb?schema=public"
```

**Important**: Replace `password` with your actual PostgreSQL password.

### 2. If password has special characters
URL-encode special characters:
- `@` becomes `%40`
- `#` becomes `%23`
- `$` becomes `%24`
- `%` becomes `%25`
- `&` becomes `%26`
- `+` becomes `%2B`
- `=` becomes `%3D`
- `?` becomes `%3F`

Example:
```
Password: my@pass#123
Encoded: my%40pass%23123
DATABASE_URL="postgresql://postgres:my%40pass%23123@localhost:5432/mydb?schema=public"
```

### 3. Test database connection
Try connecting manually:
```bash
psql -U postgres -d mydb
```

If that works, your credentials are correct.

### 4. Alternative: Use connection object instead of URL
If URL encoding is problematic, you can modify `src/config/database.ts` to use a connection object:

```typescript
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'mydb',
  synchronize: process.env.NODE_ENV === 'development',
  // ... rest of config
});
```

Then in `.env`:
```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=mydb
```

### 5. Verify PostgreSQL is running
```bash
# Check if PostgreSQL is running
pg_isready

# Or check service status (macOS)
brew services list | grep postgres
```

### 6. Check database exists
```bash
psql -U postgres -l
# Look for 'mydb' in the list
```

If it doesn't exist:
```bash
psql -U postgres
CREATE DATABASE mydb;
\q
```
