import mongoose from 'mongoose';

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
  startTime: Date;
  endTime?: Date;
  participants: string[];
  transcriptText: string;
  status: 'live' | 'processing' | 'completed' | 'failed';
  summary?: string;
  actionItems: IActionItem[];
  decisions: IDecision[];
  timeline: ITimelineEntry[];
  keyTopics: string[];
  podcastStatus: 'none' | 'generating' | 'ready' | 'failed';
  podcastUrl?: string;
  podcastScript?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MeetingSchema = new mongoose.Schema(
  {
    meetingId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    title: { type: String, default: 'Untitled Meeting' },
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date },
    participants: [{ type: String }],
    transcriptText: { type: String, default: '' },
    status: {
      type: String,
      enum: ['live', 'processing', 'completed', 'failed'],
      default: 'processing',
    },
    summary: { type: String },
    actionItems: [
      {
        text: { type: String, required: true },
        assignee: { type: String },
        done: { type: Boolean, default: false },
      },
    ],
    decisions: [
      {
        text: { type: String, required: true },
        context: { type: String, default: '' },
      },
    ],
    timeline: [
      {
        time: { type: String, required: true },
        topic: { type: String, required: true },
        summary: { type: String, default: '' },
      },
    ],
    keyTopics: [{ type: String }],
    podcastStatus: {
      type: String,
      enum: ['none', 'generating', 'ready', 'failed'],
      default: 'none',
    },
    podcastUrl: { type: String },
    podcastScript: { type: String },
  },
  { timestamps: true },
);

export default mongoose.models.Meeting ||
  mongoose.model<IMeeting>('Meeting', MeetingSchema);
