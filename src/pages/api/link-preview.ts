import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const { url } = req.query;

    if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        // Validate URL
        new URL(url);

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; LinkPreviewBot/1.0;)'
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: 'Failed to fetch URL' });
        }

        const html = await response.text();

        // Simple Regex Extraction for Metadata
        const getMetaTag = (html: string, property: string) => {
            const regex = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i');
            const match = html.match(regex);
            return match ? match[1] : null;
        };

        const getTitle = (html: string) => {
            const ogTitle = getMetaTag(html, 'og:title');
            if (ogTitle) return ogTitle;
            const titleRegex = /<title[^>]*>([^<]+)<\/title>/i;
            const match = html.match(titleRegex);
            return match ? match[1] : null;
        };

        const getDescription = (html: string) => {
            const ogDesc = getMetaTag(html, 'og:description');
            if (ogDesc) return ogDesc;
            return getMetaTag(html, 'description');
        };

        const getImage = (html: string) => {
            return getMetaTag(html, 'og:image');
        };

        const title = getTitle(html);
        const description = getDescription(html);
        const image = getImage(html);
        const domain = new URL(url).hostname;

        // If no sufficient info found, we might return null or empty
        if (!title && !description) {
            return res.status(404).json({ error: 'No metadata found' });
        }

        res.status(200).json({
            title: title || domain,
            description: description || '',
            image: image || '',
            domain,
            url
        });

    } catch (error) {
        console.error('Link Preview Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}
