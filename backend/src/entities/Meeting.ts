import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export interface IActionItem {
  text: string;
  assignee?: string;
  done: boolean;
}

export interface IDecision {
  text: string;
  context: string;
}

export interface ITimelineEntry {
  time: string;
  topic: string;
  summary: string;
}

export interface IParticipantInsight {
  speakerId: string;
  speakerName: string;
  email?: string;
  summary: string;
  actionItems: string[];
  keyNotes: string[];
  emailSent: boolean;
}

export interface IMeeting {
  meetingId: string;
  userId: string;
  botId?: string | null;
  meetingUrl?: string | null;
  source?: 'upload' | 'recording' | 'bot';
  title: string;
  startedAt?: Date | null;
  endedAt?: Date | null;
  participants: string[];
  transcriptText?: string | null;
  status: 'live' | 'processing' | 'completed' | 'failed' | 'bot_joining';
  summary?: string | null;
  actionItems: IActionItem[];
  decisions: IDecision[];
  timeline: ITimelineEntry[];
  keyTopics: string[];
  participantInsights: IParticipantInsight[];
  podcastStatus: 'none' | 'generating' | 'ready' | 'failed';
  podcastUrl?: string | null;
  podcastScript?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Entity('meetings')
@Index(['userId'])
export class Meeting {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', unique: true })
  @Index()
  meetingId!: string;

  @Column({ type: 'text' })
  userId!: string;

  @Column({ type: 'text', nullable: true })
  botId!: string | null;

  @Column({ type: 'text', nullable: true })
  meetingUrl!: string | null;

  @Column({ type: 'text', default: 'upload' })
  source!: string;

  @Column({ type: 'text', default: 'Untitled Meeting' })
  title!: string;

  @Column({ type: 'text', nullable: true })
  transcriptText!: string | null;

  @Column({ type: 'text', default: 'processing' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  summary!: string | null;

  @Column({ type: 'simple-array', nullable: true })
  keyTopics!: string[];

  @Column({ type: 'simple-array', nullable: true })
  participants!: string[];

  @Column({ type: 'jsonb', default: [] })
  actionItems!: IActionItem[];

  @Column({ type: 'jsonb', default: [] })
  decisions!: IDecision[];

  @Column({ type: 'jsonb', default: [] })
  timeline!: ITimelineEntry[];

  @Column({ type: 'jsonb', default: [] })
  participantInsights!: IParticipantInsight[];

  @Column({ type: 'jsonb', default: [] })
  participantUserIds!: string[];

  @Column({ type: 'text', default: 'none' })
  podcastStatus!: string;

  @Column({ type: 'text', nullable: true })
  podcastUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  podcastScript!: string | null;

  @Column({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP' })
  startedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  endedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
