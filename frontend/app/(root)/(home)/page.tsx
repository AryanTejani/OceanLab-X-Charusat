import MeetingTypeList from '@/components/MeetingTypeList';
import CurrentTime from '@/components/CurrentTime';
import UpcomingMeetingBadge from '@/components/UpcomingMeetingBadge';

const Home = () => {
  return (
    <section className="flex size-full flex-col gap-5 text-white">
      <div className="h-[303px] w-full rounded-[20px] bg-hero bg-cover">
        <div className="flex h-full flex-col justify-between max-md:px-5 max-md:py-8 lg:p-11">
          <UpcomingMeetingBadge />
          <div className="flex flex-col gap-2">
            <CurrentTime />
          </div>
        </div>
      </div>

      <MeetingTypeList />
    </section>
  );
};

export default Home;
