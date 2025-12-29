import React, { useEffect, useState } from 'react';

interface LinkPreviewData {
    title: string;
    description: string;
    image: string;
    domain: string;
    url: string;
}

export const LinkPreview = ({ url }: { url: string }) => {
    const [data, setData] = useState<LinkPreviewData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        let isMounted = true;
        setLoading(true);
        setError(false);

        fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
            .then(res => {
                if (!res.ok) throw new Error('Failed to fetch');
                return res.json();
            })
            .then(data => {
                if (isMounted) {
                    if (data.error) {
                        setError(true);
                    } else {
                        setData(data);
                    }
                    setLoading(false);
                }
            })
            .catch(() => {
                if (isMounted) {
                    setError(true);
                    setLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [url]);

    if (loading) {
        return (
            <span style={{ display: 'block', padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '8px', marginTop: '0.5rem', color: '#888', fontSize: '0.9rem' }}>
                Loading preview...
            </span>
        );
    }

    if (error || !data) {
        return null; // Do not render anything if failed, just show the original link (handled by parent)
    }

    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
                display: 'block',
                textDecoration: 'none',
                color: 'inherit',
                marginTop: '0.5rem',
                border: '1px solid #e1e4e8',
                borderRadius: '8px',
                overflow: 'hidden',
                transition: 'border-color 0.2s, box-shadow 0.2s',
                backgroundColor: '#fff'
            }}
            onMouseOver={(e) => {
                e.currentTarget.style.borderColor = '#42b883';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)';
            }}
            onMouseOut={(e) => {
                e.currentTarget.style.borderColor = '#e1e4e8';
                e.currentTarget.style.boxShadow = 'none';
            }}
        >
            <span style={{ display: 'flex', height: '120px' }}>
                {data.image && (
                    <span style={{
                        flexShrink: 0,
                        width: '200px',
                        height: '100%',
                        overflow: 'hidden',
                        borderRight: '1px solid #f0f0f0',
                        display: 'block' // Ensure span behaves like block for image container
                    }}>
                        <img
                            src={data.image}
                            alt={data.title}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    </span>
                )}
                <span style={{ flex: 1, padding: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden' }}>
                    <span style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.5rem', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', display: 'block' }}>
                        {data.title}
                    </span>
                    <span style={{ fontSize: '0.85rem', color: '#666', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {data.description}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#999', marginTop: 'auto', display: 'block', paddingTop: '0.5rem' }}>
                        {data.domain}
                    </span>
                </span>
            </span>
        </a>
    );
};
