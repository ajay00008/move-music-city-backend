import 'reflect-metadata';
import { AppDataSource } from './config/database';
import { hashPassword } from './lib/utils';

// Import entities after reflect-metadata
import { User, UserRole, Status as UserStatus } from './entities/User';
import { School, Status as SchoolStatus } from './entities/School';
import { Teacher, Status as TeacherStatus } from './entities/Teacher';
import { Class } from './entities/Class';
import { ClassTeacher } from './entities/ClassTeacher';
import { GradeGroup } from './entities/GradeGroup';
import { Prize } from './entities/Prize';
import { IsNull } from 'typeorm';

async function seed() {
  try {
    await AppDataSource.initialize();
    console.log('🌱 Seeding database...');

    const userRepo = AppDataSource.getRepository(User);
    const schoolRepo = AppDataSource.getRepository(School);
    const teacherRepo = AppDataSource.getRepository(Teacher);
    const classRepo = AppDataSource.getRepository(Class);
    const classTeacherRepo = AppDataSource.getRepository(ClassTeacher);
    const gradeGroupRepo = AppDataSource.getRepository(GradeGroup);
    const prizeRepo = AppDataSource.getRepository(Prize);

    const hashedPassword = await hashPassword('password123');
    const teacherPassword = await hashPassword('password123');

    // Schools first (needed for grade groups/prizes schoolId)
    let school1 = await schoolRepo.findOne({ where: { email: 'info@lincoln.edu', deletedAt: IsNull() } });
    if (!school1) {
      school1 = schoolRepo.create({
        name: 'Lincoln High School',
        address: '123 Lincoln Ave, New York, NY 10001',
        phone: '(555) 123-4567',
        email: 'info@lincoln.edu',
        status: SchoolStatus.ACTIVE,
      });
      await schoolRepo.save(school1);
    }

    // Grade groups: get or create (assign to school1 so teachers can load prizes)
    let gradeGroup1 = await gradeGroupRepo.findOne({ where: { name: 'K-2', deletedAt: IsNull() } });
    if (!gradeGroup1) {
      gradeGroup1 = gradeGroupRepo.create({
        name: 'K-2',
        label: 'Kindergarten - 2nd Grade',
        schoolId: school1.id,
      });
      await gradeGroupRepo.save(gradeGroup1);
    } else if (!gradeGroup1.schoolId) {
      gradeGroup1.schoolId = school1.id;
      await gradeGroupRepo.save(gradeGroup1);
    }

    let gradeGroup2 = await gradeGroupRepo.findOne({ where: { name: '3-5', deletedAt: IsNull() } });
    if (!gradeGroup2) {
      gradeGroup2 = gradeGroupRepo.create({
        name: '3-5',
        label: '3rd Grade - 5th Grade',
        schoolId: school1.id,
      });
      await gradeGroupRepo.save(gradeGroup2);
    } else if (!gradeGroup2.schoolId) {
      gradeGroup2.schoolId = school1.id;
      await gradeGroupRepo.save(gradeGroup2);
    }

    // Super admin: get or create
    let superAdmin = await userRepo.findOne({ where: { email: 'super@admin.com', deletedAt: IsNull() } });
    if (!superAdmin) {
      superAdmin = userRepo.create({
        email: 'super@admin.com',
        name: 'Super Admin',
        password: hashedPassword,
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
      });
      await userRepo.save(superAdmin);
    }

    let school2 = await schoolRepo.findOne({ where: { email: 'info@westside.edu', deletedAt: IsNull() } });
    if (!school2) {
      school2 = schoolRepo.create({
        name: 'Westside Academy',
        address: '456 West Blvd, Los Angeles, CA 90001',
        phone: '(555) 234-5678',
        email: 'info@westside.edu',
        status: SchoolStatus.ACTIVE,
      });
      await schoolRepo.save(school2);
    }

    // School admin: get or create
    let admin1 = await userRepo.findOne({ where: { email: 'admin@lincoln.edu', deletedAt: IsNull() } });
    if (!admin1) {
      admin1 = userRepo.create({
        email: 'admin@lincoln.edu',
        name: 'John Smith',
        password: hashedPassword,
        role: UserRole.SCHOOL_ADMIN,
        schoolId: school1.id,
        status: UserStatus.ACTIVE,
      });
      await userRepo.save(admin1);
    }

    // Teachers: get or create; set password if missing (for mobile app login)
    let teacher1 = await teacherRepo.findOne({
      where: { email: 'emily.davis@lincoln.edu', deletedAt: IsNull() },
    });
    if (!teacher1) {
      teacher1 = teacherRepo.create({
        name: 'Emily Davis',
        email: 'emily.davis@lincoln.edu',
        phone: '(555) 111-2222',
        grade: '5th Grade',
        studentCount: 24,
        schoolId: school1.id,
        status: TeacherStatus.ACTIVE,
        password: teacherPassword,
      });
      await teacherRepo.save(teacher1);
    } else if (!teacher1.password) {
      teacher1.password = teacherPassword;
      await teacherRepo.save(teacher1);
    }

    let teacher2 = await teacherRepo.findOne({
      where: { email: 'robert.wilson@lincoln.edu', deletedAt: IsNull() },
    });
    if (!teacher2) {
      teacher2 = teacherRepo.create({
        name: 'Robert Wilson',
        email: 'robert.wilson@lincoln.edu',
        phone: '(555) 222-3333',
        grade: '4th Grade',
        studentCount: 22,
        schoolId: school1.id,
        status: TeacherStatus.ACTIVE,
        password: teacherPassword,
      });
      await teacherRepo.save(teacher2);
    } else if (!teacher2.password) {
      teacher2.password = teacherPassword;
      await teacherRepo.save(teacher2);
    }

    // Classes: get or create by name + schoolId
    let class1 = await classRepo.findOne({
      where: { name: 'Mathematics 101', schoolId: school1.id, deletedAt: IsNull() },
    });
    if (!class1) {
      class1 = classRepo.create({
        name: 'Mathematics 101',
        grade: '10th',
        section: 'A',
        schoolId: school1.id,
        studentCount: 28,
        fitnessMinutes: 450,
      });
      await classRepo.save(class1);
    }

    let class2 = await classRepo.findOne({
      where: { name: 'Physics Advanced', schoolId: school1.id, deletedAt: IsNull() },
    });
    if (!class2) {
      class2 = classRepo.create({
        name: 'Physics Advanced',
        grade: '11th',
        section: 'B',
        schoolId: school1.id,
        studentCount: 24,
        fitnessMinutes: 320,
      });
      await classRepo.save(class2);
    }

    // Link teachers to classes (ignore if already linked)
    const ct1Exists = await classTeacherRepo.findOne({
      where: { classId: class1.id, teacherId: teacher1.id },
    });
    if (!ct1Exists) {
      await classTeacherRepo.save(
        classTeacherRepo.create({ classId: class1.id, teacherId: teacher1.id })
      );
    }

    const ct2Exists = await classTeacherRepo.findOne({
      where: { classId: class2.id, teacherId: teacher1.id },
    });
    if (!ct2Exists) {
      await classTeacherRepo.save(
        classTeacherRepo.create({ classId: class2.id, teacherId: teacher1.id })
      );
    }

    // Prizes: create only if none exist; assign schoolId so teachers can load them
    const existingPrizesCount = await prizeRepo.count({ where: { deletedAt: IsNull() } });
    if (existingPrizesCount === 0) {
      const prizes = [
        {
          name: 'Extra Recess',
          description: '15 minutes of extra recess time',
          minutesRequired: 100,
          icon: '🎮',
          gradeGroupId: gradeGroup1.id,
          schoolId: school1.id,
        },
        {
          name: 'Pencil',
          description: 'Special fitness-themed pencil',
          minutesRequired: 200,
          icon: '✏️',
          gradeGroupId: gradeGroup1.id,
          schoolId: school1.id,
        },
        {
          name: 'Extra Recess',
          description: '15 minutes of extra recess time',
          minutesRequired: 100,
          icon: '🎮',
          gradeGroupId: gradeGroup2.id,
          schoolId: school1.id,
        },
        {
          name: 'Bracelet',
          description: 'Fitness achievement bracelet',
          minutesRequired: 200,
          icon: '🎁',
          gradeGroupId: gradeGroup2.id,
          schoolId: school1.id,
        },
      ];
      for (const prizeData of prizes) {
        const prize = prizeRepo.create(prizeData);
        await prizeRepo.save(prize);
      }
    } else {
      // Ensure existing prizes have schoolId for teacher API
      const prizesWithoutSchool = await prizeRepo.find({
        where: { schoolId: IsNull(), deletedAt: IsNull() },
      });
      for (const p of prizesWithoutSchool) {
        p.schoolId = school1.id;
        await prizeRepo.save(p);
      }
    }

    console.log('✅ Seeding completed!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    await AppDataSource.destroy();
  }
}

seed();
