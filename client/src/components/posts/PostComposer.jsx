import { useState, useRef, useEffect, useMemo } from 'react';
import EmojiPicker, { EmojiStyle, Theme } from 'emoji-picker-react';
import { Smile, Hash, AtSign, Type } from 'lucide-react';
import clsx from 'clsx';
import { analyzeSentiment, SENTIMENT_STYLES } from '../../utils/sentiment';

const IG_LIMIT = 2200;
const FB_LIMIT = 63206;

export default function PostComposer({ content, onChange, title, onTitleChange }) {
  const [showEmoji, setShowEmoji] = useState(false);
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef(null);
  const emojiButtonRef = useRef(null);
  const emojiPickerRef = useRef(null);

  // Close emoji picker on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(e.target) &&
        !emojiButtonRef.current?.contains(e.target)
      ) {
        setShowEmoji(false);
      }
    }
    if (showEmoji) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showEmoji]);

  const insertAtCursor = (text) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(content + text);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newValue = content.substring(0, start) + text + content.substring(end);
    onChange(newValue);

    // Restore cursor position after React re-renders
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + text.length;
    }, 0);
  };

  const handleEmojiClick = (emojiData) => {
    insertAtCursor(emojiData.emoji);
  };

  const charCount = content.length;
  const igWarning = charCount > IG_LIMIT;
  const fbWarning = charCount > FB_LIMIT;
  const sentiment = useMemo(() => analyzeSentiment(content), [content]);
  const sentimentStyle = SENTIMENT_STYLES[sentiment.label];

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Title (optional) */}
      {onTitleChange !== undefined && (
        <div className="px-4 pt-4">
          <input
            type="text"
            value={title}
            onChange={e => onTitleChange(e.target.value)}
            placeholder="Internal title (optional)"
            className="w-full text-sm font-medium text-slate-800 placeholder:text-slate-400 outline-none border-none bg-transparent"
          />
        </div>
      )}

      {/* Main textarea */}
      <div
        className={clsx(
          'relative transition-colors',
          focused ? 'bg-white' : 'bg-white'
        )}
      >
        <textarea
          ref={textareaRef}
          value={content}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="What do you want to share?"
          rows={8}
          className="w-full px-4 py-3 text-[15px] text-slate-900 placeholder:text-slate-400 outline-none resize-y leading-relaxed border-none"
          style={{ minHeight: '180px' }}
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-1 relative">
          {/* Emoji button */}
          <button
            ref={emojiButtonRef}
            type="button"
            onClick={() => setShowEmoji(prev => !prev)}
            className={clsx(
              'p-2 rounded-lg transition',
              showEmoji ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            )}
            title="Add emoji"
          >
            <Smile className="w-4 h-4" />
          </button>

          {/* Hashtag quick-insert */}
          <button
            type="button"
            onClick={() => insertAtCursor('#')}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
            title="Add hashtag"
          >
            <Hash className="w-4 h-4" />
          </button>

          {/* Mention quick-insert */}
          <button
            type="button"
            onClick={() => insertAtCursor('@')}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
            title="Add mention"
          >
            <AtSign className="w-4 h-4" />
          </button>

          {/* Line break hint */}
          <div className="ml-2 hidden sm:flex items-center gap-1 text-[11px] text-slate-400">
            <Type className="w-3 h-3" />
            <span>Shift+Enter for new line</span>
          </div>

          {/* Emoji picker popover */}
          {showEmoji && (
            <div
              ref={emojiPickerRef}
              className="absolute bottom-full left-0 mb-2 z-50 shadow-2xl rounded-lg overflow-hidden border border-slate-200"
            >
              <EmojiPicker
                onEmojiClick={handleEmojiClick}
                emojiStyle={EmojiStyle.NATIVE}
                theme={Theme.LIGHT}
                width={320}
                height={400}
                searchPlaceholder="Search emoji..."
                previewConfig={{ showPreview: false }}
                skinTonesDisabled={false}
              />
            </div>
          )}
        </div>

        {/* Character counters + sentiment */}
        <div className="flex items-center gap-3 text-[11px]">
          {content.trim().length > 0 && (
            <span
              className={clsx(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-medium',
                sentimentStyle.bg, sentimentStyle.text
              )}
              title={`Tone score: ${sentiment.comparative}`}
            >
              <span className={clsx('w-1.5 h-1.5 rounded-full', sentimentStyle.dot)} />
              {sentimentStyle.label}
            </span>
          )}
          <div className="flex items-center gap-1">
            <span className="font-semibold text-pink-600">IG</span>
            <span className={clsx(igWarning ? 'text-red-500 font-semibold' : 'text-slate-400')}>
              {charCount.toLocaleString()}/{IG_LIMIT.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-semibold text-blue-600">FB</span>
            <span className={clsx(fbWarning ? 'text-red-500 font-semibold' : 'text-slate-400')}>
              {charCount.toLocaleString()}/{FB_LIMIT.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
