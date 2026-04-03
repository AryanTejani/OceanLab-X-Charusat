'use client';

import { useState } from 'react';
import { FluidTabs } from '@/components/ui/fluid-tabs';
import { IMeeting } from '@/lib/entities/Meeting';
import {
  FileText,
  CheckSquare,
  Lightbulb,
  Clock,
  AlignLeft,
} from 'lucide-react';

type Tab = 'summary' | 'actions' | 'decisions' | 'timeline' | 'transcript';

interface InsightsTabsProps {
  meeting: IMeeting;
}

const InsightsTabs = ({ meeting }: InsightsTabsProps) => {
  const [activeTab, setActiveTab] = useState<Tab>('summary');

  const tabItems = [
    { id: 'summary', label: 'Summary', icon: <FileText size={18} /> },
    {
      id: 'actions',
      label: `Actions${meeting.actionItems?.length ? ` (${meeting.actionItems.length})` : ''}`,
      icon: <CheckSquare size={18} />,
    },
    {
      id: 'decisions',
      label: `Decisions${meeting.decisions?.length ? ` (${meeting.decisions.length})` : ''}`,
      icon: <Lightbulb size={18} />,
    },
    {
      id: 'timeline',
      label: `Timeline${meeting.timeline?.length ? ` (${meeting.timeline.length})` : ''}`,
      icon: <Clock size={18} />,
    },
    { id: 'transcript', label: 'Transcript', icon: <AlignLeft size={18} /> },
  ];

  return (
    <div>
      {/* Watermelon UI FluidTabs */}
      <div className="mb-6 overflow-x-auto">
        <FluidTabs
          tabs={tabItems}
          defaultActive="summary"
          onChange={(id) => setActiveTab(id as Tab)}
        />
      </div>

      {/* Tab Content */}
      <div className="min-h-[200px]">
        {activeTab === 'summary' && (
          <div className="space-y-4">
            {meeting.keyTopics && meeting.keyTopics.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {meeting.keyTopics.map((topic, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 text-xs rounded-full bg-blue-1/20 text-blue-1 border border-blue-1/30"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            )}
            <div className="text-gray-300 leading-relaxed whitespace-pre-wrap">
              {meeting.summary || 'No summary available yet.'}
            </div>
          </div>
        )}

        {activeTab === 'actions' && (
          <div className="space-y-3">
            {meeting.actionItems && meeting.actionItems.length > 0 ? (
              meeting.actionItems.map((item, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-lg bg-dark-3 border border-dark-4"
                >
                  <div className="mt-0.5 size-5 rounded border border-gray-500 flex items-center justify-center flex-shrink-0">
                    {item.done && (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#0E78F9"
                        strokeWidth="3"
                      >
                        <polyline points="20,6 9,17 4,12" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-white text-sm">{item.text}</p>
                    {item.assignee && (
                      <p className="text-xs text-gray-400 mt-1">
                        Assigned to:{' '}
                        <span className="text-blue-1">{item.assignee}</span>
                      </p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-400">No action items detected.</p>
            )}
          </div>
        )}

        {activeTab === 'decisions' && (
          <div className="space-y-3">
            {meeting.decisions && meeting.decisions.length > 0 ? (
              meeting.decisions.map((decision, i) => (
                <div
                  key={i}
                  className="p-3 rounded-lg bg-dark-3 border border-dark-4"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-green-400 mt-0.5">&#10003;</span>
                    <div>
                      <p className="text-white text-sm">{decision.text}</p>
                      {decision.context && (
                        <p className="text-xs text-gray-400 mt-1">
                          {decision.context}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-400">No decisions detected.</p>
            )}
          </div>
        )}

        {activeTab === 'timeline' && (
          <div className="space-y-0">
            {meeting.timeline && meeting.timeline.length > 0 ? (
              meeting.timeline.map((entry, i) => (
                <div key={i} className="flex gap-4 pb-4">
                  <div className="flex flex-col items-center">
                    <div className="size-3 rounded-full bg-blue-1 flex-shrink-0" />
                    {i < meeting.timeline.length - 1 && (
                      <div className="w-0.5 flex-1 bg-dark-4 mt-1" />
                    )}
                  </div>
                  <div className="pb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-gray-400 font-mono">
                        {entry.time}
                      </span>
                      <span className="text-sm font-medium text-white">
                        {entry.topic}
                      </span>
                    </div>
                    {entry.summary && (
                      <p className="text-xs text-gray-400">{entry.summary}</p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-400">No timeline available.</p>
            )}
          </div>
        )}

        {activeTab === 'transcript' && (
          <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap max-h-[500px] overflow-y-auto p-3 rounded-lg bg-dark-3 border border-dark-4">
            {meeting.transcriptText || 'No transcript available.'}
          </div>
        )}
      </div>
    </div>
  );
};

export default InsightsTabs;
