# School Hub Backend API

RESTful API backend for School Hub management system using **TypeORM** with **PostgreSQL**.

## Features

- ✅ RESTful API with Express.js
- ✅ PostgreSQL database with TypeORM
- ✅ JWT authentication
- ✅ Role-based access control (Super Admin & School Admin)
- ✅ Input validation with Zod
- ✅ Soft delete for all entities
- ✅ Proper database relations
- ✅ Error handling middleware
- ✅ CORS enabled

## Prerequisites

- Node.js 18+ 
- PostgreSQL database
- npm or yarn

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` and configure:
   - `DATABASE_URL` - PostgreSQL connection string
   - `JWT_SECRET` - Secret key for JWT tokens
   - `PORT` - Server port (default: 3000)
   - `FRONTEND_URL` - Frontend URL for CORS

3. **Set up database:**
   ```bash
   # Database will auto-sync in development mode
   # For production, use migrations:
   npm run migration:generate -- -n InitialMigration
   npm run migration:run
   
   # Seed database (optional)
   npm run seed
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

## Database Schema

The database uses TypeORM entities with the following structure:

- **Users**: Super admins and school admins
- **Schools**: School information
- **Teachers**: Teacher details linked to schools
- **Classes**: Classes linked to schools and teachers
- **ClassTeacher**: Many-to-many relationship between teachers and classes
- **Grade Groups**: Grade groupings for prizes
- **Prizes**: Prize tiers by grade group
- **Earned Prizes**: Prizes earned by classes

All entities support soft delete via `deletedAt` field.

## Default Credentials

After seeding:
- **Super Admin**: `super@admin.com` / `password123`
- **School Admin**: `admin@lincoln.edu` / `password123`

## API Endpoints

Base URL: `http://localhost:3000/api`

See `../swagger-api-spec.md` for complete API documentation.

## Development

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run seed` - Seed database with initial data

## Why PostgreSQL over MongoDB?

PostgreSQL is better for this application because:

1. **Strong Relationships**: Clear one-to-many and many-to-many relationships between entities
2. **ACID Transactions**: Ensures data consistency for complex operations
3. **Complex Queries**: Better support for joins and aggregations
4. **Structured Data**: Well-defined schema fits the school management domain
5. **TypeORM**: Excellent TypeScript support with decorators and type safety
