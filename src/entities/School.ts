import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { User } from './User';
import { Teacher } from './Teacher';
import { Class } from './Class';
import { GradeGroup } from './GradeGroup';
import { Prize } from './Prize';

export enum Status {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('schools')
export class School {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'text' })
  address: string;

  @Column({ type: 'varchar' })
  phone: string;

  @Column({ type: 'varchar', unique: true })
  @Index()
  email: string;

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

  @OneToMany(() => User, (user) => user.school)
  admins: User[];

  @OneToMany(() => Teacher, (teacher) => teacher.school)
  teachers: Teacher[];

  @OneToMany(() => Class, (classItem) => classItem.school)
  classes: Class[];

  @OneToMany(() => GradeGroup, (gradeGroup) => gradeGroup.school)
  gradeGroups: GradeGroup[];

  @OneToMany(() => Prize, (prize) => prize.school)
  prizes: Prize[];
}
