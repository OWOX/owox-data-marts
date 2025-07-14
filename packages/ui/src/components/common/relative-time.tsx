import { useMemo } from 'react';

interface RelativeTimeProps {
  date: Date;
  className?: string;
}

export default function RelativeTime({ date, className = '' }: RelativeTimeProps) {
  const relativeText = useMemo(() => {
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const absDiffMs = Math.abs(diffMs);
    const isPast = diffMs < 0;

    // Convert to different time units
    const diffMinutes = Math.floor(absDiffMs / (1000 * 60));
    const diffHours = Math.floor(absDiffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(absDiffMs / (1000 * 60 * 60 * 24));
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    const formatTime = (date: Date) => {
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    };

    const getDayName = (date: Date) => {
      return date.toLocaleDateString('en-US', { weekday: 'long' });
    };

    // Less than 1 minute
    if (diffMinutes < 1) {
      return isPast ? 'just now' : 'in a moment';
    }

    // Minutes (1-59)
    if (diffMinutes < 60) {
      if (isPast) {
        return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
      } else {
        return diffMinutes === 1 ? 'in 1 minute' : `in ${diffMinutes} minutes`;
      }
    }

    // Hours (1-23)
    if (diffHours < 24) {
      if (isPast) {
        return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
      } else {
        return diffHours === 1 ? 'in 1 hour' : `in ${diffHours} hours`;
      }
    }

    // Yesterday/Tomorrow
    if (diffDays === 1) {
      const time = formatTime(date);
      return isPast ? `yesterday at ${time}` : `tomorrow at ${time}`;
    }

    // This week (2-6 days)
    if (diffDays < 7) {
      const dayName = getDayName(date);
      const time = formatTime(date);

      if (isPast) {
        return `last ${dayName} at ${time}`;
      } else {
        return `this ${dayName} at ${time}`;
      }
    }

    // Next/Last week (7-13 days)
    if (diffDays < 14) {
      const dayName = getDayName(date);
      const time = formatTime(date);

      if (isPast) {
        return `last ${dayName} at ${time}`;
      } else {
        return `next ${dayName} at ${time}`;
      }
    }

    // Weeks (2-3 weeks)
    if (diffWeeks < 4) {
      if (isPast) {
        return diffWeeks === 2 ? '2 weeks ago' : '3 weeks ago';
      } else {
        return diffWeeks === 2 ? 'in 2 weeks' : 'in 3 weeks';
      }
    }

    // Months (1-11)
    if (diffMonths < 12) {
      if (isPast) {
        return diffMonths === 1 ? '1 month ago' : `${diffMonths} months ago`;
      } else {
        return diffMonths === 1 ? 'in 1 month' : `in ${diffMonths} months`;
      }
    }

    // Years
    if (isPast) {
      return diffYears === 1 ? '1 year ago' : `${diffYears} years ago`;
    } else {
      return diffYears === 1 ? 'in 1 year' : `in ${diffYears} years`;
    }
  }, [date]);

  return (
    <span className={`text-muted-foreground text-sm ${className}`} title={date.toLocaleString()}>
      {relativeText}
    </span>
  );
}
