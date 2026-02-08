import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Prize } from './Prize';
import { Class } from './Class';

@Entity('earned_prizes')
export class EarnedPrize {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  prizeId: string;

  @Column({ type: 'uuid' })
  @Index()
  classId: string;

  @Column({ type: 'uuid' })
  @Index()
  schoolId: string;

  @Column({ type: 'boolean', default: false })
  delivered: boolean;

  @CreateDateColumn()
  earnedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;

  @ManyToOne(() => Prize, (prize) => prize.earnedPrizes)
  @JoinColumn({ name: 'prizeId' })
  prize: Prize;

  @ManyToOne(() => Class, (classItem) => classItem.earnedPrizes)
  @JoinColumn({ name: 'classId' })
  class: Class;
}
