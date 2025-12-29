import type { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs'
import path from 'path'

const PAGES_DIR = path.join(process.cwd(), 'src/pages')

// Helper function to find the nearest _meta.json file based on the provided path
const findMetaFile = (targetPath: string) => {
    let currentDir = targetPath

    // Check if the currentPath is a file, if so get the directory
    if (fs.existsSync(currentDir) && fs.statSync(currentDir).isFile()) {
        currentDir = path.dirname(currentDir)
    }

    const metaPath = path.join(currentDir, '_meta.json')
    if (fs.existsSync(metaPath)) {
        return metaPath
    }

    return null
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    if (process.env.NODE_ENV !== 'development') {
        return res.status(403).json({ error: 'Editor is development only' })
    }

    if (req.method === 'GET') {
        const { path: queryPath } = req.query

        if (!queryPath || typeof queryPath !== 'string') {
            return res.status(400).json({ error: 'Path is required' })
        }

        const fullPath = path.join(PAGES_DIR, queryPath)

        // Safety check
        if (!fullPath.startsWith(PAGES_DIR)) {
            return res.status(400).json({ error: 'Invalid path' })
        }

        const metaFilePath = findMetaFile(fullPath)

        if (metaFilePath) {
            try {
                const content = fs.readFileSync(metaFilePath, 'utf-8')
                return res.status(200).json(JSON.parse(content))
            } catch (e) {
                return res.status(500).json({ error: 'Failed to read _meta.json' })
            }
        } else {
            return res.status(200).json({}) // Return empty object if no meta file found
        }
    }

    if (req.method === 'POST') {
        const { path: targetPath, key, title } = req.body

        if (targetPath === undefined || !key || !title) {
            return res.status(400).json({ error: 'Missing parameters' })
        }

        const fullPath = path.join(PAGES_DIR, targetPath)
        if (!fullPath.startsWith(PAGES_DIR)) {
            return res.status(400).json({ error: 'Invalid path' })
        }

        // Determine directory for _meta.json
        let metaDir = fullPath
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
            metaDir = path.dirname(fullPath)
        } else if (!fs.existsSync(fullPath)) {
            // If path doesn't exist (e.g. might be a new file or just a slug reference), 
            // assume it's relative to PAGES_DIR and we want the meta in the parent dir of that item?
            // Actually, let's rely on the client sending a valid path corresponding to the file/folder being renamed.
            // If it's a file "foo.md", we want _meta.json in same dir.
            metaDir = path.dirname(fullPath)
        }

        // If targetPath is empty string (root), metaDir is PAGES_DIR
        if (targetPath === '') {
            metaDir = PAGES_DIR
        }


        const metaFilePath = path.join(metaDir, '_meta.json')

        let metaContent: any = {}
        if (fs.existsSync(metaFilePath)) {
            try {
                metaContent = JSON.parse(fs.readFileSync(metaFilePath, 'utf-8'))
            } catch (e) {
                console.error('Error reading existing _meta.json', e)
                // Proceed with empty object if corrupt or empty
            }
        }

        metaContent[key] = title

        try {
            fs.writeFileSync(metaFilePath, JSON.stringify(metaContent, null, 2))
            return res.status(200).json({ success: true, meta: metaContent })
        } catch (e) {
            return res.status(500).json({ error: 'Failed to write _meta.json' })
        }
    }

    if (req.method === 'PUT') {
        const { folderPath, oldKey, newKey } = req.body

        if (folderPath === undefined || !oldKey || !newKey) {
            return res.status(400).json({ error: 'Missing parameters' })
        }

        const fullDir = path.join(PAGES_DIR, folderPath === '/' ? '' : folderPath)
        if (!fullDir.startsWith(PAGES_DIR)) {
            return res.status(400).json({ error: 'Invalid path' })
        }

        const metaFilePath = path.join(fullDir, '_meta.json')

        let metaContent: any = {}
        if (fs.existsSync(metaFilePath)) {
            try {
                metaContent = JSON.parse(fs.readFileSync(metaFilePath, 'utf-8'))
            } catch (e) {
                console.error('Error reading existing _meta.json', e)
                return res.status(500).json({ error: 'Corrupt _meta.json' })
            }
        } else {
            return res.status(404).json({ error: '_meta.json not found' })
        }

        if (metaContent[oldKey]) {
            metaContent[newKey] = metaContent[oldKey]
            delete metaContent[oldKey]

            try {
                fs.writeFileSync(metaFilePath, JSON.stringify(metaContent, null, 2))
                return res.status(200).json({ success: true, meta: metaContent })
            } catch (e) {
                return res.status(500).json({ error: 'Failed to write _meta.json' })
            }
        } else {
            // If old key doesn't exist, maybe just add the new key with default title?
            // Or just ignore. For rename, if it wasn't in meta, maybe we don't need to do anything?
            // But let's return success to not block UI.
            return res.status(200).json({ success: true, message: 'Key not found in meta' })
        }
    }


    if (req.method === 'DELETE') {
        const { folderPath, key } = req.body

        if (folderPath === undefined || !key) {
            return res.status(400).json({ error: 'Missing parameters' })
        }

        const fullDir = path.join(PAGES_DIR, folderPath === '/' ? '' : folderPath)
        if (!fullDir.startsWith(PAGES_DIR)) {
            return res.status(400).json({ error: 'Invalid path' })
        }

        const metaFilePath = path.join(fullDir, '_meta.json')

        if (!fs.existsSync(metaFilePath)) {
            // If no meta file, nothing to delete from
            return res.status(200).json({ success: true })
        }

        let metaContent: any = {}
        try {
            metaContent = JSON.parse(fs.readFileSync(metaFilePath, 'utf-8'))
        } catch (e) {
            return res.status(500).json({ error: 'Corrupt _meta.json' })
        }

        if (metaContent[key]) {
            delete metaContent[key]
            try {
                fs.writeFileSync(metaFilePath, JSON.stringify(metaContent, null, 2))
                return res.status(200).json({ success: true, meta: metaContent })
            } catch (e) {
                return res.status(500).json({ error: 'Failed to write _meta.json' })
            }
        }

        return res.status(200).json({ success: true })
    }


    return res.status(405).end()
}
