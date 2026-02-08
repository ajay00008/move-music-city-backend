import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { School } from './School';
import { ClassTeacher } from './ClassTeacher';
import { EarnedPrize } from './EarnedPrize';
import { GradeGroup } from './GradeGroup';

@Entity('classes')
export class Class {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar' })
  grade: string;

  @Column({ type: 'varchar' })
  section: string;

  @Column({ type: 'uuid' })
  @Index()
  schoolId: string;

  @Column({ type: 'int', default: 0 })
  studentCount: number;

  @Column({ type: 'int', default: 0 })
  fitnessMinutes: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;

  @ManyToOne(() => School, (school) => school.classes)
  @JoinColumn({ name: 'schoolId' })
  school: School;

  @OneToMany(() => ClassTeacher, (classTeacher) => classTeacher.class)
  teachers: ClassTeacher[];

  @OneToMany(() => EarnedPrize, (earnedPrize) => earnedPrize.class)
  earnedPrizes: EarnedPrize[];

  @ManyToMany(() => GradeGroup, (gg) => gg.classes)
  gradeGroups: GradeGroup[];
}
