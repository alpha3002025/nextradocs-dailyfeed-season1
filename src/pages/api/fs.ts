import type { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs'
import path from 'path'

const PAGES_DIR = path.join(process.cwd(), 'src/pages')

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    if (process.env.NODE_ENV !== 'development') {
        return res.status(403).json({ error: 'Available only in development' })
    }

    const helpers = {
        getSafePath: (targetPath: string) => {
            const safe = path.join(PAGES_DIR, targetPath)
            if (!safe.startsWith(PAGES_DIR)) {
                throw new Error('Invalid path')
            }
            return safe
        }
    }

    try {
        if (req.method === 'POST') {
            const { type, path: targetPath } = req.body
            if (!targetPath || !type) return res.status(400).json({ error: 'Missing parameters' })

            const p = helpers.getSafePath(targetPath)

            if (fs.existsSync(p)) return res.status(400).json({ error: 'Path already exists' })

            if (type === 'directory') {
                fs.mkdirSync(p, { recursive: true })
            } else {
                // assume file
                const content = `# New File\n\nCreated at ${new Date().toISOString()}`
                fs.writeFileSync(p, content)
            }
            return res.status(200).json({ success: true })
        }

        if (req.method === 'PUT') {
            const { oldPath, newPath } = req.body
            if (!oldPath || !newPath) return res.status(400).json({ error: 'Missing parameters' })

            const src = helpers.getSafePath(oldPath)
            const dest = helpers.getSafePath(newPath)

            if (!fs.existsSync(src)) return res.status(404).json({ error: 'Source not found' })
            if (fs.existsSync(dest)) return res.status(400).json({ error: 'Destination already exists' })

            fs.renameSync(src, dest)
            return res.status(200).json({ success: true })
        }

        if (req.method === 'DELETE') {
            const { path: targetPath } = req.body
            if (!targetPath) return res.status(400).json({ error: 'Missing parameters' })

            const p = helpers.getSafePath(targetPath)
            if (!fs.existsSync(p)) return res.status(404).json({ error: 'Not found' })

            const stats = fs.statSync(p)
            if (stats.isDirectory()) {
                fs.rmSync(p, { recursive: true, force: true })
            } else {
                fs.unlinkSync(p)
            }
            return res.status(200).json({ success: true })
        }

    } catch (e: any) {
        console.error(e)
        return res.status(500).json({ error: e.message || 'Server error' })
    }

    return res.status(405).end()
}
