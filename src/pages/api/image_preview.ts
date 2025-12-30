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
            const ext = path.extname(postDir);
            const name = path.basename(postDir, ext);
            postDir = path.dirname(postDir);

            // If the requested file already includes the name in its path (e.g. name/file.png), we don't need to add it again.
            // However, the 'file' param passed from editor usually comes from url url.replace('./img/', '')
            // If editor sends 'docName/filename.png', then file variable is 'docName/filename.png'.
            // In that case postDir + 'img' + file is correct.
            // BUT if the user is uploading, we are saving to img/docName.
            // Let's ensure we are looking in the right place.

            // Previously: filePath = path.join(postDir, 'img', file as string)
            // If file string is "docName/image.png", then path.join(..., 'img', "docName/image.png") works.
            // If file string is just "image.png" (old behavior), we might need checks.
            // But since we updated the Editor to insert `![] (./img/docName/file)`, the `file` query param will likely be `docName/file`.

            // Wait, the client side logic:
            // url.replace('./img/', '') -> if url is ./img/foo/bar.png, file becomes "foo/bar.png".
            // So path.join(postDir, 'img', "foo/bar.png") should resolve to .../img/foo/bar.png.
            // This seems correct IF postDir is the parent directory.

            // Let's Verify:
            // Post: /pages/posts/hello.md
            // Slug: posts/hello.md
            // isFile: true
            // postDir becomes: /pages/posts
            // Image saved at: /pages/posts/img/hello/image.png
            // Editor Link: ./img/hello/image.png
            // API Call: file = hello/image.png
            // Final Path: /pages/posts/img/hello/image.png

            // This logic seems sound for the NEW structure.
            // HOWEVER, the error 404 indicates it's not finding it.
            // Maybe the file param string is somehow malformed or isFile detection is slightly off for the directory resolution?

            // Let's stick effectively to the same logic, it matches the upload logic directory determination.
            filePath = path.join(postDir, 'img', file as string)
        } else {
            filePath = path.join(postDir, 'img', file as string)
        }
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
