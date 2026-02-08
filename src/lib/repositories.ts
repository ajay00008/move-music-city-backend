import { AppDataSource } from '../config/database';
import { Repository } from 'typeorm';
import { User } from '../entities/User';
import { School } from '../entities/School';
import { Teacher } from '../entities/Teacher';
import { Class } from '../entities/Class';
import { ClassTeacher } from '../entities/ClassTeacher';
import { GradeGroup } from '../entities/GradeGroup';
import { Prize } from '../entities/Prize';
import { EarnedPrize } from '../entities/EarnedPrize';

// Repository getters
export const getUserRepository = (): Repository<User> => AppDataSource.getRepository(User);
export const getSchoolRepository = (): Repository<School> => AppDataSource.getRepository(School);
export const getTeacherRepository = (): Repository<Teacher> => AppDataSource.getRepository(Teacher);
export const getClassRepository = (): Repository<Class> => AppDataSource.getRepository(Class);
export const getClassTeacherRepository = (): Repository<ClassTeacher> => AppDataSource.getRepository(ClassTeacher);
export const getGradeGroupRepository = (): Repository<GradeGroup> => AppDataSource.getRepository(GradeGroup);
export const getPrizeRepository = (): Repository<Prize> => AppDataSource.getRepository(Prize);
export const getEarnedPrizeRepository = (): Repository<EarnedPrize> => AppDataSource.getRepository(EarnedPrize);
