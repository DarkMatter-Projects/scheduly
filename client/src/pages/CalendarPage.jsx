import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { getCalendarEvents } from '../api/calendarApi';
import { updatePost } from '../api/postsApi';
import { useAuth } from '../context/AuthContext';
import { useClientScope } from '../context/ClientContext';
import toast from 'react-hot-toast';
import { Plus, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import clsx from 'clsx';
import CalendarPreviewPanel from '../components/calendar/CalendarPreviewPanel';
import PostQuickModal from '../components/calendar/PostQuickModal';

const statusColors = {
  draft: { bg: '#f3f4f6', border: '#9ca3af', text: '#374151' },
  pending_approval: { bg: '#fef9c3', border: '#eab308', text: '#854d0e' },
  approved: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
  scheduled: { bg: '#e0e7ff', border: '#6366f1', text: '#3730a3' },
  publishing: { bg: '#f3e8ff', border: '#a855f7', text: '#6b21a8' },
  published: { bg: '#dcfce7', border: '#22c55e', text: '#166534' },
  failed: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b' },
};

export default function CalendarPage() {
  const navigate = useNavigate();
  const calendarRef = useRef(null);
  const { hasRole } = useAuth();
  const { activeClientId, activeClient } = useClientScope();
  const queryClient = useQueryClient();
  const [currentTitle, setCurrentTitle] = useState('');
  const [events, setEvents] = useState([]); // cached for the preview panel
  const [quickPostId, setQuickPostId] = useState(null);

  // Refetch events when the active client changes
  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (api) api.refetchEvents();
  }, [activeClientId]);

  const rescheduleMut = useMutation({
    mutationFn: ({ id, scheduledAt }) => updatePost(id, { scheduledAt }),
    onSuccess: () => {
      toast.success('Post rescheduled');
      // Refetch events
      const api = calendarRef.current?.getApi();
      if (api) api.refetchEvents();
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to reschedule'),
  });

  const handleEventClick = useCallback((info) => {
    // Open the quick-look modal instead of navigating away — keeps the
    // calendar + preview context visible while the user reviews/approves.
    const postId = info.event.extendedProps.postId;
    setQuickPostId(postId);
  }, []);

  const handleEventDrop = useCallback((info) => {
    const postId = info.event.extendedProps.postId;
    const status = info.event.extendedProps.status;

    // Only allow rescheduling draft, approved, or scheduled posts
    if (!['draft', 'approved', 'scheduled'].includes(status)) {
      info.revert();
      toast.error('Cannot reschedule a published or failed post');
      return;
    }

    if (!hasRole('admin', 'manager')) {
      info.revert();
      toast.error('Only managers can reschedule posts');
      return;
    }

    const newDate = info.event.start.toISOString();
    rescheduleMut.mutate({ id: postId, scheduledAt: newDate });
  }, [hasRole, rescheduleMut]);

  const handleDateClick = useCallback((info) => {
    navigate('/posts/new');
  }, [navigate]);

  const handleDatesSet = useCallback((info) => {
    const api = calendarRef.current?.getApi();
    if (api) {
      setCurrentTitle(api.view.title);
    }
  }, []);

  const navigateCalendar = (direction) => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    if (direction === 'prev') api.prev();
    else if (direction === 'next') api.next();
    else api.today();
  };

  const setView = (view) => {
    const api = calendarRef.current?.getApi();
    if (api) api.changeView(view);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Content Calendar</h1>
          {activeClient && (
            <p className="text-sm text-slate-500 mt-1">Showing posts for {activeClient.name}</p>
          )}
        </div>
        <button
          onClick={() => navigate('/posts/new')}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
        >
          <Plus className="w-4 h-4" />
          New Post
        </button>
      </div>

      {/* Two-column layout: calendar on the left, phone preview on the right */}
      <div className="flex items-start gap-6">
      <div className="flex-1 min-w-0 bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigateCalendar('prev')}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => navigateCalendar('today')}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Today
            </button>
            <button
              onClick={() => navigateCalendar('next')}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold text-gray-800 ml-2">{currentTitle}</h2>
          </div>

          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setView('dayGridMonth')}
              className="px-3 py-1.5 text-xs font-medium rounded-md hover:bg-white hover:shadow-sm transition"
            >
              Month
            </button>
            <button
              onClick={() => setView('dayGridWeek')}
              className="px-3 py-1.5 text-xs font-medium rounded-md hover:bg-white hover:shadow-sm transition"
            >
              Week
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-50 bg-gray-50/50">
          {Object.entries(statusColors).map(([status, colors]) => (
            <div key={status} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.border }} />
              <span className="text-xs text-gray-500 capitalize">{status.replace('_', ' ')}</span>
            </div>
          ))}
        </div>

        {/* Calendar */}
        <div className="p-4 calendar-wrapper overflow-x-auto">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={false}
            events={(fetchInfo, successCallback, failureCallback) => {
              getCalendarEvents(fetchInfo.startStr, fetchInfo.endStr, activeClientId || undefined)
                .then(data => {
                  setEvents(data);
                  successCallback(data);
                })
                .catch(failureCallback);
            }}
            eventClick={handleEventClick}
            eventDrop={handleEventDrop}
            dateClick={handleDateClick}
            editable={true}
            droppable={true}
            dayMaxEvents={3}
            datesSet={handleDatesSet}
            height="auto"
            eventContent={(eventInfo) => {
              const { status, mediaCount, postId } = eventInfo.event.extendedProps;
              const colors = statusColors[status] || statusColors.draft;
              return (
                <div
                  className="group w-full px-2 py-1 rounded text-xs cursor-pointer overflow-hidden relative"
                  style={{
                    backgroundColor: colors.bg,
                    borderLeft: `3px solid ${colors.border}`,
                    color: colors.text,
                  }}
                >
                  <div className="font-medium truncate pr-5">
                    {eventInfo.event.title}
                  </div>
                  {mediaCount > 0 && (
                    <div className="text-[10px] opacity-70 mt-0.5">
                      {mediaCount} media
                    </div>
                  )}
                  {/* Hover-reveal Edit button — stops propagation so it opens the
                      quick-look modal without also triggering the calendar's
                      eventClick / drag handlers. */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setQuickPostId(postId); }}
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition bg-white/90 hover:bg-white rounded p-0.5 shadow-sm"
                    title="Edit / review"
                  >
                    <Pencil className="w-2.5 h-2.5 text-slate-700" />
                  </button>
                </div>
              );
            }}
          />
        </div>
      </div>

      <CalendarPreviewPanel events={events} onPostClick={setQuickPostId} />
      </div>

      {quickPostId && (
        <PostQuickModal postId={quickPostId} onClose={() => setQuickPostId(null)} />
      )}
    </div>
  );
}
