import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { Class } from './Class';
import { Teacher } from './Teacher';

@Entity('class_teachers')
@Unique(['classId', 'teacherId'])
export class ClassTeacher {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  classId: string;

  @Column({ type: 'uuid' })
  @Index()
  teacherId: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Class, (classItem) => classItem.teachers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'classId' })
  class: Class;

  @ManyToOne(() => Teacher, (teacher) => teacher.classes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'teacherId' })
  teacher: Teacher;
}
