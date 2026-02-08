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
import { GradeGroup } from './GradeGroup';
import { EarnedPrize } from './EarnedPrize';
import { School } from './School';

@Entity('prizes')
export class Prize {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'int' })
  minutesRequired: number;

  @Column({ type: 'varchar' })
  icon: string;

  @Column({ type: 'uuid' })
  @Index()
  gradeGroupId: string;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  schoolId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;

  @ManyToOne(() => School, (school) => school.prizes)
  @JoinColumn({ name: 'schoolId' })
  school: School;

  @ManyToOne(() => GradeGroup, (gradeGroup) => gradeGroup.prizes)
  @JoinColumn({ name: 'gradeGroupId' })
  gradeGroup: GradeGroup;

  @OneToMany(() => EarnedPrize, (earnedPrize) => earnedPrize.prize)
  earnedPrizes: EarnedPrize[];
}
