import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('team_members')
@Index(['ownerId'])
@Index(['ownerId', 'email'], { unique: true })
export class TeamMember {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  ownerId!: string;

  @Column({ type: 'text', nullable: true })
  memberId!: string | null;

  @Column({ type: 'text' })
  email!: string;

  @Column({ type: 'text', default: 'member' })
  role!: string;

  @Column({ type: 'text', default: 'pending' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  clerkInvitationId!: string | null;

  @CreateDateColumn()
  joinedAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
