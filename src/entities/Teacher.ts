import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { School } from './School';
import { ClassTeacher } from './ClassTeacher';

export enum Status {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('teachers')
export class Teacher {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar' })
  @Index()
  email: string;

  @Column({ type: 'varchar', nullable: true })
  password: string | null;

  @Column({ type: 'varchar', default: '' })
  phone: string;

  /** Unique 4-digit code for app signups; school uses this to find and assign the teacher. Null for admin-created teachers. */
  @Column({ type: 'varchar', length: 4, nullable: true, unique: true })
  @Index({ unique: true })
  signupCode: string | null;

  @Column({ type: 'varchar', default: '' })
  grade: string;

  @Column({ type: 'int', default: 0 })
  studentCount: number;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  schoolId: string | null;

  @Column({
    type: 'enum',
    enum: Status,
    default: Status.ACTIVE,
  })
  status: Status;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;

  @ManyToOne(() => School, (school) => school.teachers)
  @JoinColumn({ name: 'schoolId' })
  school: School;

  @OneToMany(() => ClassTeacher, (classTeacher) => classTeacher.teacher)
  classes: ClassTeacher[];
}
