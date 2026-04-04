// Shared types for frontend — mirrors backend entity interfaces without TypeORM deps

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

export interface ITeamMember {
  id: string;
  ownerId: string;
  memberId: string | null;
  email: string;
  role: string;
  status: 'pending' | 'active';
  clerkInvitationId: string | null;
  joinedAt: Date;
  // Resolved from Clerk (populated by GET /api/team)
  name?: string;
  imageUrl?: string;
}
