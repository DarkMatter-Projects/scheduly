import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listMedia, uploadMedia, deleteMedia } from '../api/mediaApi';
import UploadProgressCard from '../components/common/UploadProgressCard';
import { useAuth } from '../context/AuthContext';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import { Upload, Trash2, X, Image, Film, Search, Filter } from 'lucide-react';
import Thumbnail from '../components/common/Thumbnail';
import clsx from 'clsx';
import { format } from 'date-fns';

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function MediaPreviewModal({ media, onClose, onDelete }) {
  const isVideo = media.mimeType.startsWith('video/');

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-sm font-medium text-gray-900 truncate">{media.originalName}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="bg-gray-100 flex items-center justify-center" style={{ maxHeight: '60vh' }}>
          {isVideo ? (
            <video src={media.url} controls className="max-h-[60vh] w-auto" />
          ) : (
            <img src={media.url} alt={media.originalName} className="max-h-[60vh] w-auto object-contain" />
          )}
        </div>

        <div className="p-4 space-y-2 text-sm text-gray-600">
          <div className="grid grid-cols-2 gap-2">
            <div><span className="font-medium text-gray-700">Type:</span> {media.mimeType}</div>
            <div><span className="font-medium text-gray-700">Size:</span> {formatFileSize(media.fileSize)}</div>
            {media.width && <div><span className="font-medium text-gray-700">Dimensions:</span> {media.width} x {media.height}</div>}
            <div><span className="font-medium text-gray-700">Uploaded by:</span> {media.uploaderName}</div>
            <div><span className="font-medium text-gray-700">Date:</span> {format(new Date(media.createdAt), 'MMM d, yyyy')}</div>
          </div>

          {onDelete && (
            <div className="pt-2 border-t border-gray-100">
              <button
                onClick={() => onDelete(media.id)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MediaLibraryPage({ onSelect, selectable = false }) {
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [previewMedia, setPreviewMedia] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['media', page, typeFilter],
    queryFn: () => listMedia({ page, limit: 24, type: typeFilter || undefined }),
  });

  const [uploadProgress, setUploadProgress] = useState({ state: 'idle' });

  const uploadMutation = useMutation({
    mutationFn: (files) => uploadMedia(files, {
      onProgress: ({ loaded, total, percent }) =>
        setUploadProgress({ state: 'uploading', percent, loaded, total, fileCount: files.length }),
    }),
    onSuccess: (uploaded) => {
      queryClient.invalidateQueries({ queryKey: ['media'] });
      setUploadProgress({ state: 'success', fileCount: uploaded?.length || 1 });
      setTimeout(() => setUploadProgress({ state: 'idle' }), 2500);
      toast.success('Files uploaded successfully');
    },
    onError: (err) => {
      setUploadProgress({
        state: 'error',
        errorMessage: err.response?.data?.error || err.message || 'Upload failed',
      });
      setTimeout(() => setUploadProgress({ state: 'idle' }), 5000);
      toast.error(err.response?.data?.error || 'Upload failed');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMedia,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media'] });
      setPreviewMedia(null);
      toast.success('Media deleted');
    },
    onError: () => toast.error('Failed to delete'),
  });

  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      setUploadProgress({ state: 'uploading', percent: 0, loaded: 0, total: 0, fileCount: acceptedFiles.length });
      uploadMutation.mutate(acceptedFiles);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': [], 'image/png': [], 'image/gif': [], 'image/webp': [],
      'video/mp4': [], 'video/quicktime': [],
    },
    maxSize: 100 * 1024 * 1024,
  });

  const canUpload = hasRole('admin', 'manager', 'editor');
  const canDelete = hasRole('admin', 'manager');
  const mediaItems = data?.data || [];
  const pagination = data?.pagination;

  const toggleSelect = (id) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Media Library</h1>
        <div className="flex items-center gap-3">
          <select
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">All types</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
          </select>
          {selectable && selectedIds.size > 0 && (
            <button
              onClick={() => onSelect([...selectedIds])}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Attach {selectedIds.size} file{selectedIds.size > 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>

      {/* Upload zone */}
      {canUpload && (
        <div
          {...getRootProps()}
          className={clsx(
            'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition mb-6',
            isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50',
            uploadMutation.isPending && 'opacity-50 pointer-events-none'
          )}
        >
          <input {...getInputProps()} />
          <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          {uploadMutation.isPending ? (
            <p className="text-sm text-blue-600 font-medium">Uploading...</p>
          ) : isDragActive ? (
            <p className="text-sm text-blue-600 font-medium">Drop files here</p>
          ) : (
            <>
              <p className="text-sm text-gray-600 font-medium">Drag & drop files here, or click to browse</p>
              <p className="text-xs text-gray-400 mt-1">JPEG, PNG, GIF, WebP, MP4 — max 100MB</p>
            </>
          )}
        </div>
      )}

      {/* Media grid */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading media...</div>
      ) : mediaItems.length === 0 ? (
        <div className="text-center py-12">
          <Image className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">No media files yet. Upload your first file above!</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {mediaItems.map(item => {
              const isVideo = item.mimeType.startsWith('video/');
              const selected = selectedIds.has(item.id);

              return (
                <div
                  key={item.id}
                  onClick={() => selectable ? toggleSelect(item.id) : setPreviewMedia(item)}
                  className={clsx(
                    'group relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition',
                    selected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-transparent hover:border-gray-300'
                  )}
                >
                  {isVideo ? (
                    // Fall back to the video file itself when no thumbnail
                    // was generated server-side — Thumbnail renders <video
                    // preload="metadata"> so the browser shows the first
                    // frame as a poster.
                    <Thumbnail
                      src={item.thumbnailUrl || item.url}
                      mimeType={item.thumbnailUrl ? undefined : item.mimeType}
                      alt={item.originalName}
                      className="w-full h-full"
                      iconSize="w-8 h-8"
                      placeholder={<Film className="w-8 h-8 text-gray-400" />}
                    />
                  ) : (
                    <Thumbnail
                      src={item.thumbnailUrl || item.url}
                      alt={item.originalName}
                      className="w-full h-full object-cover"
                      iconSize="w-8 h-8"
                      placeholder={<Image className="w-8 h-8 text-slate-300" />}
                    />
                  )}

                  {/* Overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition" />

                  {/* Selection indicator */}
                  {selectable && (
                    <div className={clsx(
                      'absolute top-2 left-2 w-5 h-5 rounded-full border-2 flex items-center justify-center',
                      selected ? 'bg-blue-600 border-blue-600' : 'border-white bg-black/20'
                    )}>
                      {selected && <span className="text-white text-xs">&#10003;</span>}
                    </div>
                  )}

                  {/* File type badge */}
                  {isVideo && (
                    <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                      Video
                    </div>
                  )}

                  {/* File name */}
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition">
                    <p className="text-xs text-white truncate">{item.originalName}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {pagination.pages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                disabled={page >= pagination.pages}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Preview Modal */}
      {previewMedia && (
        <MediaPreviewModal
          media={previewMedia}
          onClose={() => setPreviewMedia(null)}
          onDelete={canDelete ? (id) => deleteMutation.mutate(id) : undefined}
        />
      )}

      <UploadProgressCard
        state={uploadProgress.state}
        percent={uploadProgress.percent}
        loaded={uploadProgress.loaded}
        total={uploadProgress.total}
        fileCount={uploadProgress.fileCount}
        errorMessage={uploadProgress.errorMessage}
      />
    </div>
  );
}
