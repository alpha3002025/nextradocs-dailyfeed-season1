import React, { useState } from 'react';
import { PlayCircle } from 'lucide-react';

export const getYouTubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
};

// Use span with display:block to avoid "div cannot appear as a descendant of p" hydration errors
// since markdown parsers often wrap standalone links in <p> tags.
export const YouTubeEmbed = ({ url }: { url: string }) => {
    const [showVideo, setShowVideo] = useState(false);
    const videoId = getYouTubeId(url);

    if (!videoId) return <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{url}</a>;

    if (showVideo) {
        return (
            <span className="youtube-embed my-4" style={{ aspectRatio: '16/9', display: 'block' }}>
                <iframe
                    width="100%"
                    height="100%"
                    src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
                    title="YouTube video player"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    style={{ borderRadius: '8px' }}
                ></iframe>
            </span>
        );
    }

    return (
        <span
            className="youtube-thumbnail my-4 group"
            style={{
                position: 'relative',
                cursor: 'pointer',
                aspectRatio: '16/9',
                overflow: 'hidden',
                borderRadius: '8px',
                backgroundColor: '#000',
                display: 'block'
            }}
            onClick={() => setShowVideo(true)}
        >
            <img
                src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
                alt="Video thumbnail"
                style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.9 }}
                onError={(e) => { (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` }}
            />
            <span style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                backgroundColor: 'rgba(0,0,0,0.6)',
                borderRadius: '50%',
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'transform 0.2s, background-color 0.2s'
            }}
            // We can't rely on tailwind group-hover classes easily without configuration in this isolated file unless global css handles it.
            // But we can add style.
            >
                <PlayCircle size={48} color="white" fill="rgba(255,255,255,0.2)" />
            </span>
        </span>
    );
};
