import fs from 'fs'
import path from 'path'
import type { NextApiRequest, NextApiResponse } from 'next'
import mime from 'gray-matter' // mime types not in gray-matter, use map

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    if (process.env.NODE_ENV !== 'development') {
        return res.status(403).end()
    }

    const { slug, file } = req.query
    if (!slug || !file || Array.isArray(slug) || Array.isArray(file)) return res.status(404).end()

    // Security: prevent traversal
    if (file.includes('..') || slug.includes('..')) return res.status(403).end()

    let filePath: string
    // Changed to src/pages for flat structure
    const PAGES_DIR = path.join(process.cwd(), 'src/pages')

    if (slug === 'home') {
        filePath = path.join(PAGES_DIR, 'img', file as string)
    } else {
        // Resolve directory similar to upload/post logic
        let postDir = path.join(PAGES_DIR, slug as string)

        // If postDir is not a directory, check if it is a file-based slug
        let isFile = false;
        try {
            if (fs.existsSync(postDir) && fs.statSync(postDir).isFile()) {
                isFile = true;
            } else if (!fs.existsSync(postDir)) {
                // Check for potential file extensions to identify if the slug refers to a file
                if (fs.existsSync(postDir + '.md') || fs.existsSync(postDir + '.mdx')) {
                    isFile = true;
                }
            }
        } catch (e) {
            // ignore error
        }

        if (isFile) {
            postDir = path.dirname(postDir);
        }

        filePath = path.join(postDir, 'img', file as string)
    }
    if (!fs.existsSync(filePath)) return res.status(404).end()

    const ext = path.extname(filePath).toLowerCase()
    let contentType = 'image/png'
    if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg'
    if (ext === '.gif') contentType = 'image/gif'
    if (ext === '.svg') contentType = 'image/svg+xml'

    const img = fs.readFileSync(filePath)
    res.setHeader('Content-Type', contentType)
    res.send(img)
}
