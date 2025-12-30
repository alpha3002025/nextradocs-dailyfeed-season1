import type { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs'
import path from 'path'

// Changed to src/pages for flat structure
const PAGES_DIR = path.join(process.cwd(), 'src/pages')

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    if (process.env.NODE_ENV !== 'development') {
        return res.status(403).json({ error: 'Editor is development only' })
    }

    const { slug } = req.query
    if (!slug || Array.isArray(slug)) return res.status(400).json({ error: 'Invalid slug' })

    let dir: string
    let filePath: string
    let imgDir: string

    if (slug === 'home') {
        dir = PAGES_DIR
        filePath = path.join(dir, 'index.mdx')
        imgDir = path.join(dir, 'img')
    } else {
        // If slug ends with .json, treat it as a file path relative to PAGES_DIR
        if (typeof slug === 'string' && slug.endsWith('.json')) {
            filePath = path.join(PAGES_DIR, slug)
            dir = path.dirname(filePath)
            imgDir = path.join(dir, 'img')
        }
        // If slug ends with .md or .mdx, treat it as a direct file path
        else if (typeof slug === 'string' && /\.(md|mdx)$/.test(slug)) {
            filePath = path.join(PAGES_DIR, slug)
            dir = path.dirname(filePath)
            imgDir = path.join(dir, 'img')
        }
        else {
            // Check if it matches a file directly (e.g. textblock/quotation -> textblock/quotation.mdx)
            const potentialMdx = path.join(PAGES_DIR, `${slug}.mdx`)
            const potentialMd = path.join(PAGES_DIR, `${slug}.md`)

            if (fs.existsSync(potentialMdx)) {
                filePath = potentialMdx
                dir = path.dirname(filePath)
            } else if (fs.existsSync(potentialMd)) {
                filePath = potentialMd
                dir = path.dirname(filePath)
            } else {
                // Determine if it is a directory with index
                dir = path.join(PAGES_DIR, slug as string)
                if (fs.existsSync(path.join(dir, 'index.mdx'))) {
                    filePath = path.join(dir, 'index.mdx')
                } else {
                    filePath = path.join(dir, 'index.md')
                }
            }
            imgDir = path.join(dir, 'img')
        }
    }

    if (req.method === 'GET') {
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Post not found' })
        const content = fs.readFileSync(filePath, 'utf8')

        // Also list images
        let images: string[] = []
        if (fs.existsSync(imgDir)) {
            images = fs.readdirSync(imgDir).filter(f => /\.(png|jpg|jpeg|gif)$/.test(f))
        }

        return res.status(200).json({ content, images })
    }

    if (req.method === 'PUT') {
        const { content } = req.body
        if (typeof content !== 'string') return res.status(400).json({ error: 'Content required' })
        // specific check for home to allow index.mdx overwrite even if "dir" check below might be weird
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Post not found' })

        fs.writeFileSync(filePath, content)

        // Cleanup unused images
        try {
            // Determine the specific image subdirectory for this post
            let specificImgDir: string;

            // Check if filePath is index file in a directory or a standalone file
            const fileName = path.basename(filePath);
            if (fileName === 'index.md' || fileName === 'index.mdx') {
                // For index files, the "docName" is the directory name
                const dirName = path.basename(dir);
                specificImgDir = path.join(imgDir, dirName);
            } else {
                // For other files, docName is filename without extension
                const docName = fileName.replace(/\.(md|mdx)$/, '');
                specificImgDir = path.join(imgDir, docName);
            }

            if (fs.existsSync(specificImgDir)) {
                // Find used images in CURRENT file content
                const usedImages = new Set<string>();

                // Matches ![] (./img/docName/filename.png) or purely filename if somehow relative
                // We expect ./img/docName/xxxx.png
                // We want to capture xxxx.png
                // The regex needs to handle the path prefix
                // Regex for standard format: (./img/docName/filename)

                // Construct regex based on docName to be precise? 
                // Alternatively, just capture the filename at the end of ./img/.../ paths
                const regex = /img\/[^)]+\/([^/)]+)\)/g;

                let match;
                while ((match = regex.exec(content)) !== null) {
                    usedImages.add(match[1]); // match[1] is the filename
                }

                const allImages = fs.readdirSync(specificImgDir);
                allImages.forEach(file => {
                    // Filter only image files to be safe
                    if (/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(file)) {
                        if (!usedImages.has(file)) {
                            // Delete unused
                            try {
                                fs.unlinkSync(path.join(specificImgDir, file));
                                console.log(`Deleted unused image: ${file} from ${specificImgDir}`);
                            } catch (err) {
                                console.error(`Failed to delete unused image ${file}`, err);
                            }
                        }
                    }
                });
            }
        } catch (e) {
            console.error('Failed to cleanup images', e);
        }

        return res.status(200).json({ success: true })
    }

    if (req.method === 'DELETE') {
        if (slug === 'home') return res.status(403).json({ error: 'Cannot delete home page' })
        if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true })
        }
        return res.status(200).json({ success: true })
    }

    return res.status(405).end()
}
