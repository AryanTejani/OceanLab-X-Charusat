import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('meeting_invitations')
@Index(['inviteeId', 'status'])
@Index(['meetingId', 'inviteeId'], { unique: true })
export class MeetingInvitation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  meetingId!: string;

  @Column({ type: 'text' })
  inviterId!: string;

  @Column({ type: 'text' })
  inviteeId!: string;

  @Column({ type: 'text' })
  meetingTitle!: string;

  @Column({ type: 'text', default: 'pending' })
  status!: string; // 'pending' | 'dismissed'

  @CreateDateColumn()
  createdAt!: Date;
}
