import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
  ManyToOne,
  ManyToMany,
  JoinColumn,
  JoinTable,
  Index,
} from 'typeorm';
import { Prize } from './Prize';
import { School } from './School';
import { Class } from './Class';

@Entity('grade_groups')
export class GradeGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar' })
  label: string;

  /** Comma-separated grade values (derived from classes or set manually). Used to filter prizes for teachers. */
  @Column({ type: 'varchar', nullable: true })
  grades: string | null;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  schoolId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;

  @ManyToOne(() => School, (school) => school.gradeGroups)
  @JoinColumn({ name: 'schoolId' })
  school: School;

  @OneToMany(() => Prize, (prize) => prize.gradeGroup)
  prizes: Prize[];

  @ManyToMany(() => Class, (c) => c.gradeGroups)
  @JoinTable({
    name: 'grade_group_classes',
    joinColumn: { name: 'gradeGroupId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'classId', referencedColumnName: 'id' },
  })
  classes: Class[];
}
