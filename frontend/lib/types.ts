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

export interface IMeeting {
  meetingId: string;
  userId: string;
  title: string;
  startedAt?: Date | null;
  endedAt?: Date | null;
  participants: string[];
  transcriptText?: string | null;
  status: 'live' | 'processing' | 'completed' | 'failed';
  summary?: string | null;
  actionItems: IActionItem[];
  decisions: IDecision[];
  timeline: ITimelineEntry[];
  keyTopics: string[];
  podcastStatus: 'none' | 'generating' | 'ready' | 'failed';
  podcastUrl?: string | null;
  podcastScript?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
