import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('transcripts')
@Index(['meetingId'])
@Index(['meetingId', 'start'])
export class Transcript {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  @Index()
  meetingId!: string;

  @Column({ type: 'text', nullable: true })
  speakerName!: string | null;

  @Column({ type: 'text', nullable: true })
  speakerId!: string | null;

  @Column({ type: 'text', nullable: true })
  speakerLabel!: string | null; // AssemblyAI label ("A","B"...) — kept for audit

  @Column({ type: 'text' })
  text!: string;

  @Column({ type: 'int', nullable: true })
  start!: number | null; // ms from AssemblyAI session start — used as match key for speaker updates

  @Column({ type: 'int', nullable: true })
  end!: number | null;

  @Column({ type: 'float', nullable: true })
  confidence!: number | null;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  timestamp!: Date;

  @CreateDateColumn()
  createdAt!: Date;
}
