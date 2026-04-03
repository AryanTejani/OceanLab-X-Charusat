import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('transcripts')
@Index(['meetingId'])
export class Transcript {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  meetingId!: string;

  @Column({ type: 'text' })
  userId!: string;

  @Column({ type: 'text', nullable: true })
  userName!: string | null;

  @Column({ type: 'text', nullable: true })
  text!: string | null;

  @Column({ type: 'real', nullable: true })
  confidence!: number | null;

  @Column({ type: 'real', nullable: true })
  startMs!: number | null;

  @Column({ type: 'real', nullable: true })
  endMs!: number | null;

  @Column({ type: 'boolean', default: false })
  isFinal!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
