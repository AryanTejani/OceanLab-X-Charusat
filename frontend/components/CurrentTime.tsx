'use client';

import { useState, useEffect } from 'react';

const CurrentTime = () => {
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
      setDate(new Intl.DateTimeFormat('en-US', { dateStyle: 'full' }).format(now));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <h1 className="text-4xl font-extrabold lg:text-7xl">{time}</h1>
      <p className="text-lg font-medium text-sky-1 lg:text-2xl">{date}</p>
    </>
  );
};

export default CurrentTime;
