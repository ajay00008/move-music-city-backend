import 'reflect-metadata';
import { DataSource } from 'typeorm';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import entities after reflect-metadata
import { User } from '../entities/User';
import { School } from '../entities/School';
import { Teacher } from '../entities/Teacher';
import { Class } from '../entities/Class';
import { ClassTeacher } from '../entities/ClassTeacher';
import { GradeGroup } from '../entities/GradeGroup';
import { Prize } from '../entities/Prize';
import { EarnedPrize } from '../entities/EarnedPrize';

// Parse DATABASE_URL or use individual connection parameters
function getDatabaseConfig() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (databaseUrl) {
    // Try to parse URL first
    try {
      const url = new URL(databaseUrl);
      return {
        type: 'postgres' as const,
        host: url.hostname,
        port: parseInt(url.port) || 5432,
        username: url.username,
        password: url.password,
        database: url.pathname.slice(1), // Remove leading '/'
        synchronize: process.env.NODE_ENV === 'development',
        logging: process.env.NODE_ENV === 'development',
        entities: [User, School, Teacher, Class, ClassTeacher, GradeGroup, Prize, EarnedPrize],
        migrations: ['src/migrations/**/*.ts'],
        subscribers: ['src/subscribers/**/*.ts'],
        extra: {
          ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
        },
      };
    } catch (error) {
      console.warn('Failed to parse DATABASE_URL, using individual parameters');
    }
  }
  
  // Fallback to individual parameters
  return {
    type: 'postgres' as const,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'mydb',
    synchronize: process.env.NODE_ENV === 'development',
    logging: process.env.NODE_ENV === 'development',
    entities: [User, School, Teacher, Class, ClassTeacher, GradeGroup, Prize, EarnedPrize],
    migrations: ['src/migrations/**/*.ts'],
    subscribers: ['src/subscribers/**/*.ts'],
    extra: {
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    },
  };
}

export const AppDataSource = new DataSource(getDatabaseConfig());

export const initializeDatabase = async () => {
  try {
    await AppDataSource.initialize();
    console.log('✅ Database connected successfully');
    
    // Migrate existing grade groups and prizes to have schoolId
    await migrateExistingData();
  } catch (error) {
    console.error('❌ Error connecting to database:', error);
    throw error;
  }
};

async function migrateExistingData() {
  try {
    const { getSchoolRepository, getGradeGroupRepository, getPrizeRepository } = await import('../lib/repositories');
    const schoolRepo = getSchoolRepository();
    const gradeGroupRepo = getGradeGroupRepository();
    const prizeRepo = getPrizeRepository();

    // Get the first school (or create a default one if none exists)
    const schools = await schoolRepo.find({ take: 1 });
    if (schools.length === 0) {
      console.log('⚠️  No schools found. Grade groups and prizes will need schoolId assigned manually.');
      return;
    }

    const defaultSchool = schools[0];

    // Update grade groups without schoolId
    const gradeGroupsWithoutSchool = await gradeGroupRepo
      .createQueryBuilder('gradeGroup')
      .where('gradeGroup.schoolId IS NULL')
      .andWhere('gradeGroup.deletedAt IS NULL')
      .getMany();
    
    if (gradeGroupsWithoutSchool.length > 0) {
      console.log(`📝 Migrating ${gradeGroupsWithoutSchool.length} grade groups to school: ${defaultSchool.name}`);
      for (const gradeGroup of gradeGroupsWithoutSchool) {
        gradeGroup.schoolId = defaultSchool.id;
        await gradeGroupRepo.save(gradeGroup);
      }
    }

    // Update prizes without schoolId
    const prizesWithoutSchool = await prizeRepo
      .createQueryBuilder('prize')
      .where('prize.schoolId IS NULL')
      .andWhere('prize.deletedAt IS NULL')
      .getMany();
    
    if (prizesWithoutSchool.length > 0) {
      console.log(`📝 Migrating ${prizesWithoutSchool.length} prizes to school: ${defaultSchool.name}`);
      for (const prize of prizesWithoutSchool) {
        prize.schoolId = defaultSchool.id;
        await prizeRepo.save(prize);
      }
    }

    if (gradeGroupsWithoutSchool.length > 0 || prizesWithoutSchool.length > 0) {
      console.log('✅ Migration completed');
    }
  } catch (error) {
    console.warn('⚠️  Error during data migration:', error);
    // Don't throw - allow server to start even if migration fails
  }
}
