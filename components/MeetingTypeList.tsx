/* eslint-disable camelcase */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle } from 'lucide-react';

import HomeCard from './HomeCard';
import MeetingModal from './MeetingModal';
import AudioUpload from './AudioUpload';
import { Call, useStreamVideoClient } from '@stream-io/video-react-sdk';
import { useUser } from '@clerk/nextjs';
import Loader from './Loader';
import ReactDatePicker from 'react-datepicker';

const initialValues = {
  dateTime: new Date(),
  description: '',
  link: '',
};

const MeetingTypeList = () => {
  const router = useRouter();
  const [meetingState, setMeetingState] = useState<
    | 'isScheduleMeeting'
    | 'isJoiningMeeting'
    | 'isInstantMeeting'
    | 'isUploadingAudio'
    | undefined
  >(undefined);
  const [values, setValues] = useState(initialValues);
  const [callDetail, setCallDetail] = useState<Call>();
  const client = useStreamVideoClient();
  const { user } = useUser();
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({
    message: '',
    visible: false,
  });

  const showToast = (message: string) => {
    setToast({ message, visible: true });
    setTimeout(() => setToast({ message: '', visible: false }), 2500);
  };

  const createMeeting = async () => {
    if (!client || !user) return;
    try {
      if (!values.dateTime) {
        showToast('Please select a date and time');
        return;
      }
      const id = crypto.randomUUID();
      const call = client.call('default', id);
      if (!call) throw new Error('Failed to create meeting');
      const startsAt =
        values.dateTime.toISOString() || new Date(Date.now()).toISOString();
      const description = values.description || 'Instant Meeting';
      await call.getOrCreate({
        data: {
          starts_at: startsAt,
          custom: {
            description,
          },
        },
      });
      setCallDetail(call);
      if (!values.description) {
        router.push(`/meeting/${call.id}`);
      }
      showToast('Meeting Created');
    } catch (error) {
      console.error(error);
      showToast('Failed to create Meeting');
    }
  };

  if (!client || !user) return <Loader />;

  const meetingLink = `${process.env.NEXT_PUBLIC_BASE_URL}/meeting/${callDetail?.id}`;

  return (
    <>
      <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <HomeCard
          img="/icons/add-meeting.svg"
          title="New Meeting"
          description="Start an instant meeting"
          handleClick={() => setMeetingState('isInstantMeeting')}
        />
        <HomeCard
          img="/icons/join-meeting.svg"
          title="Join Meeting"
          description="via invitation link"
          className="bg-blue-1"
          handleClick={() => setMeetingState('isJoiningMeeting')}
        />
        <HomeCard
          img="/icons/schedule.svg"
          title="Schedule Meeting"
          description="Plan your meeting"
          className="bg-purple-1"
          handleClick={() => setMeetingState('isScheduleMeeting')}
        />
        <HomeCard
          img="/icons/recordings.svg"
          title="Upload Recording"
          description="Analyze any meeting audio"
          className="bg-yellow-1"
          handleClick={() => setMeetingState('isUploadingAudio')}
        />

        {!callDetail ? (
          <MeetingModal
            isOpen={meetingState === 'isScheduleMeeting'}
            onClose={() => setMeetingState(undefined)}
            title="Create Meeting"
            handleClick={createMeeting}
          >
            <div className="flex flex-col gap-2.5">
              <label className="text-base font-normal leading-[22.4px] text-sky-2">
                Add a description
              </label>
              <textarea
                className="w-full rounded-lg border-none bg-dark-3 p-3 text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-1 resize-none min-h-[80px] transition-shadow"
                placeholder="Meeting description..."
                onChange={(e) =>
                  setValues({ ...values, description: e.target.value })
                }
              />
            </div>
            <div className="flex w-full flex-col gap-2.5">
              <label className="text-base font-normal leading-[22.4px] text-sky-2">
                Select Date and Time
              </label>
              <ReactDatePicker
                selected={values.dateTime}
                onChange={(date) => setValues({ ...values, dateTime: date! })}
                showTimeSelect
                timeFormat="HH:mm"
                timeIntervals={15}
                timeCaption="time"
                dateFormat="MMMM d, yyyy h:mm aa"
                className="w-full rounded-lg bg-dark-3 p-3 text-white focus:outline-none focus:ring-1 focus:ring-blue-1"
              />
            </div>
          </MeetingModal>
        ) : (
          <MeetingModal
            isOpen={meetingState === 'isScheduleMeeting'}
            onClose={() => setMeetingState(undefined)}
            title="Meeting Created"
            handleClick={() => {
              navigator.clipboard.writeText(meetingLink);
              showToast('Link Copied');
            }}
            image={'/icons/checked.svg'}
            buttonIcon="/icons/copy.svg"
            className="text-center"
            buttonText="Copy Meeting Link"
          />
        )}

        <MeetingModal
          isOpen={meetingState === 'isJoiningMeeting'}
          onClose={() => setMeetingState(undefined)}
          title="Type the link here"
          className="text-center"
          buttonText="Join Meeting"
          handleClick={() => router.push(values.link)}
        >
          <input
            type="url"
            placeholder="Meeting link"
            onChange={(e) => setValues({ ...values, link: e.target.value })}
            className="w-full rounded-lg border-none bg-dark-3 p-3 text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-1 transition-shadow"
          />
        </MeetingModal>

        <MeetingModal
          isOpen={meetingState === 'isInstantMeeting'}
          onClose={() => setMeetingState(undefined)}
          title="Start an Instant Meeting"
          className="text-center"
          buttonText="Start Meeting"
          handleClick={createMeeting}
        />

        <MeetingModal
          isOpen={meetingState === 'isUploadingAudio'}
          onClose={() => setMeetingState(undefined)}
          title="Upload Meeting Recording"
          className="text-center"
        >
          <AudioUpload onClose={() => setMeetingState(undefined)} />
        </MeetingModal>
      </section>

      {/* Watermelon UI-style inline toast */}
      <AnimatePresence>
        {toast.visible && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 rounded-full border border-white/10 bg-dark-1 px-5 py-3 text-white shadow-2xl"
          >
            <CheckCircle size={18} className="text-green-400 shrink-0" />
            <span className="text-sm font-medium">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default MeetingTypeList;
