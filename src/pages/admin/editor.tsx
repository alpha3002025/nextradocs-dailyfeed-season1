import React, { useState, useEffect, useCallback, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Head from 'next/head'
import { useRouter } from 'next/router'
import styles from '../../styles/Editor.module.css'
import {
    Bold, Italic, Heading1, Heading2, List, ListOrdered,
    Quote, Link as LinkIcon, Image as ImageIcon, Code,
    FileText, Menu, ChevronLeft, Save, Plus, Copy, X, ArrowLeft
} from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism'
import LiveEditor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-markdown';
import 'prismjs/themes/prism.css'; // Import base Prism styles
import rehypeRaw from 'rehype-raw'; // Support HTML in markdown
import 'prismjs/themes/prism.css'; // Import base Prism styles
import { YouTubeEmbed, getYouTubeId } from '@/components/YouTubeEmbed';
import { LinkPreview } from '@/components/LinkPreview';

// Toast Component
function Toast({ message }: { message: string }) {
    if (!message) return null;
    return <div className={styles.toast}>{message}</div>;
}

// CodeBlock Helper Component
function CodeBlock({ language, value }: { language: string, value: string }) {
    const [copied, setCopied] = useState(false);
    const [selectedLine, setSelectedLine] = useState<number | null>(null);

    const handleCopy = () => {
        navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            window.dispatchEvent(new CustomEvent('show-toast', { detail: 'Copied to clipboard' }));
        });
    }

    return (
        <div className={styles.codeBlockWrapper}>
            {!copied ? (
                <div className={styles.codeBlockHeader}>{language}</div>
            ) : null}
            <button className={styles.copyBtn} onClick={handleCopy} title="Copy code">
                {copied ? <div style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>✓</div> : <Copy size={16} />}
            </button>
            <SyntaxHighlighter
                style={vscDarkPlus}
                language={language}
                PreTag="div"
                wrapLines={true}
                showLineNumbers={true}
                lineNumberStyle={{ minWidth: '2.5em', paddingRight: '1em', color: '#6e7681', textAlign: 'right' }}
                lineProps={(lineNumber: number) => {
                    const isSelected = selectedLine === lineNumber;
                    return {
                        style: { display: 'block', cursor: 'pointer' },
                        className: isSelected ? `${styles.codeLine} ${styles.codeLineClicked}` : styles.codeLine,
                        onClick: () => setSelectedLine(isSelected ? null : lineNumber)
                    } as React.HTMLAttributes<HTMLElement>;
                }}
            >
                {value}
            </SyntaxHighlighter>
        </div>
    )
}

// YouTube helper components moved to @/components/YouTubeEmbed


// function to generate slug from text
const generateSlug = (text: string) => {
    return text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
};

// Tree Node Type (Updated)
type FileNode = {
    name: string
    type: 'file' | 'directory'
    slug?: string
    path: string
    children?: FileNode[]
}

// Recursive Tree Item Component
const FileTreeItem = ({
    node,
    level,
    onLoadPost,
    currentPost,
    onContextMenu
}: {
    node: FileNode,
    level: number,
    onLoadPost: (slug: string) => void,
    currentPost: string | null,
    onContextMenu: (e: React.MouseEvent, node: FileNode) => void
}) => {
    // Default to closed (false), unless current post is inside (can be improved later)
    const [isOpen, setIsOpen] = useState(false);

    const handleClick = () => {
        if (node.type === 'directory') {
            setIsOpen(!isOpen);
        } else if (node.slug) {
            onLoadPost(node.slug);
        }
    }

    const isActive = node.slug === currentPost;

    return (
        <div>
            <div
                className={styles.postItem}
                style={{
                    paddingLeft: `${1 + level * 0.8}rem`,
                    backgroundColor: isActive ? 'rgba(66, 184, 131, 0.1)' : 'transparent',
                    color: isActive ? '#42b883' : 'inherit'
                }}
                onClick={handleClick}
                onContextMenu={(e) => onContextMenu(e, node)}
            >
                {node.type === 'directory' ? (
                    <>
                        <span style={{ marginRight: 4, transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform 0.2s' }}>▶</span>
                        <FileText size={16} style={{ opacity: 0.7 }} />
                    </>
                ) : (
                    <FileText size={16} />
                )}
                <span style={{ marginLeft: 8 }}>{node.name}</span>
            </div>
            {node.type === 'directory' && isOpen && node.children && (
                <div>
                    {node.children.map((child, i) => (
                        <FileTreeItem
                            key={i}
                            node={child}
                            level={level + 1}
                            onLoadPost={onLoadPost}
                            currentPost={currentPost}
                            onContextMenu={onContextMenu}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

export default function Editor() {
    const router = useRouter()
    const { open } = router.query

    const [posts, setPosts] = useState<FileNode[]>([])
    const [currentPost, setCurrentPost] = useState<string | null>(null)
    const [content, setContent] = useState('')
    const [status, setStatus] = useState('')
    const [isSidebarOpen, setSidebarOpen] = useState(true)
    const [toastMsg, setToastMsg] = useState('')
    const [toc, setToc] = useState<{ id: string, text: string, level: number }[]>([]);
    const [viewMode, setViewMode] = useState<'source' | 'preview' | 'both' | 'live'>('both')
    const [tocWidth, setTocWidth] = useState(250);
    const [isResizing, setIsResizing] = useState(false);

    const [sidebarWidth, setSidebarWidth] = useState(260);
    const [isSidebarResizing, setIsSidebarResizing] = useState(false);

    const [editorRatio, setEditorRatio] = useState(0.5);
    const [isPaneResizing, setIsPaneResizing] = useState(false);

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, node: FileNode } | null>(null);

    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // Close context menu on click elsewhere
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    useEffect(() => {
        const handleToast = (e: any) => {
            setToastMsg(e.detail);
            setTimeout(() => setToastMsg(''), 2000);
        };
        window.addEventListener('show-toast', handleToast);
        return () => window.removeEventListener('show-toast', handleToast);
    }, []);

    useEffect(() => {
        fetchPosts()
    }, [])

    useEffect(() => {
        if (open && typeof open === 'string') {
            if (!currentPost) {
                loadPost(open)
            }
        }
    }, [open])

    // Extract headers when content changes
    useEffect(() => {
        const lines = content.split('\n');
        const headers: { id: string, text: string, level: number }[] = [];
        let inCodeBlock = false;

        lines.forEach(line => {
            if (line.trim().startsWith('```')) {
                inCodeBlock = !inCodeBlock;
            }
            if (inCodeBlock) return;

            const match = line.match(/^(#{1,6})\s+(.+)$/);
            if (match) {
                const level = match[1].length;
                const text = match[2];
                const id = generateSlug(text);
                headers.push({ id, text, level });
            }
        });
        setToc(headers);
    }, [content]);

    // Resizing Logic (TOC)
    const startResizing = useCallback((mouseDownEvent: React.MouseEvent) => {
        mouseDownEvent.preventDefault();
        setIsResizing(true);
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = useCallback(
        (mouseMoveEvent: MouseEvent) => {
            if (isResizing) {
                // Calculate new width based on mouse position from the right edge of the viewport
                const newWidth = document.body.clientWidth - mouseMoveEvent.clientX;
                if (newWidth > 150 && newWidth < 600) { // Min and Max constraints
                    setTocWidth(newWidth);
                }
            }
        },
        [isResizing]
    );

    // Resizing Logic (Sidebar)
    const startSidebarResizing = useCallback((mouseDownEvent: React.MouseEvent) => {
        mouseDownEvent.preventDefault();
        setIsSidebarResizing(true);
    }, []);

    const stopSidebarResizing = useCallback(() => {
        setIsSidebarResizing(false);
    }, []);

    const resizeSidebar = useCallback(
        (mouseMoveEvent: MouseEvent) => {
            if (isSidebarResizing) {
                // Calculate new width based on mouse position
                const newWidth = mouseMoveEvent.clientX;
                if (newWidth > 150 && newWidth < 600) {
                    setSidebarWidth(newWidth);
                }
            }
        },
        [isSidebarResizing]
    );

    // Resizing Logic (Editor/Preview Pane Split)
    const startPaneResizing = useCallback((mouseDownEvent: React.MouseEvent) => {
        mouseDownEvent.preventDefault();
        setIsPaneResizing(true);
    }, []);

    const stopPaneResizing = useCallback(() => {
        setIsPaneResizing(false);
    }, []);

    const resizePane = useCallback(
        (mouseMoveEvent: MouseEvent) => {
            if (isPaneResizing) {
                const workspace = document.getElementById('workspace-container');
                if (workspace) {
                    const rect = workspace.getBoundingClientRect();
                    // Calculate ratio based on mouse position relative to workspace width
                    // mouseX - workspaceLeft = width of left pane
                    const relativeX = mouseMoveEvent.clientX - rect.left;
                    const newRatio = relativeX / rect.width;

                    if (newRatio > 0.2 && newRatio < 0.8) {
                        setEditorRatio(newRatio);
                    }
                }
            }
        },
        [isPaneResizing]
    );

    useEffect(() => {
        window.addEventListener("mousemove", resize);
        window.addEventListener("mouseup", stopResizing);
        window.addEventListener("mousemove", resizeSidebar);
        window.addEventListener("mouseup", stopSidebarResizing);
        window.addEventListener("mousemove", resizePane);
        window.addEventListener("mouseup", stopPaneResizing);
        return () => {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
            window.removeEventListener("mousemove", resizeSidebar);
            window.removeEventListener("mouseup", stopSidebarResizing);
            window.removeEventListener("mousemove", resizePane);
            window.removeEventListener("mouseup", stopPaneResizing);
        };
    }, [resize, stopResizing, resizeSidebar, stopSidebarResizing, resizePane, stopPaneResizing]);

    const fetchPosts = async () => {
        try {
            const res = await fetch('/api/posts')
            if (res.status === 403) {
                setStatus('Read Only Mode (Production)')
                return
            }
            const data = await res.json()
            setPosts(data)
        } catch (e) {
            console.error(e)
        }
    }

    const loadPost = async (slug: string) => {
        setCurrentPost(slug)
        const res = await fetch(`/api/post?slug=${slug}&t=${Date.now()}`)
        if (res.ok) {
            const data = await res.json()
            setContent(data.content)
            router.push(`/admin/editor?open=${slug}`, undefined, { shallow: true })
        }
    }

    const savePost = useCallback(async () => {
        if (!currentPost) return
        setStatus('Saving...')
        const res = await fetch(`/api/post?slug=${currentPost}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        })
        if (res.ok) {
            setStatus('Saved')
            setTimeout(() => setStatus(''), 2000)
            window.dispatchEvent(new CustomEvent('show-toast', { detail: 'Saved successfully' }))
        } else {
            setStatus('Error saving')
        }
    }, [currentPost, content])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault()
                savePost()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [savePost])

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files[0] || !currentPost) return
        const file = e.target.files[0]
        const formData = new FormData()
        formData.append('file', file)

        setStatus('Uploading...')
        const res = await fetch(`/api/upload?slug=${currentPost}`, {
            method: 'POST',
            body: formData
        })

        if (res.ok) {
            const { filename } = await res.json()
            insertText(`![](./img/${filename})`)
            setStatus('Image uploaded')
        } else {
            setStatus('Upload failed')
        }
        e.target.value = ''
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
    }

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault()
        if (!currentPost || !e.dataTransfer.files || !e.dataTransfer.files[0]) return

        // Verify if it is an image
        const file = e.dataTransfer.files[0]
        if (!file.type.startsWith('image/')) return

        const formData = new FormData()
        formData.append('file', file)

        setStatus('Uploading...')
        const res = await fetch(`/api/upload?slug=${currentPost}`, {
            method: 'POST',
            body: formData
        })

        if (res.ok) {
            const { filename } = await res.json()
            insertText(`![](./img/${filename})`)
            setStatus('Image uploaded')
            window.dispatchEvent(new CustomEvent('show-toast', { detail: 'Image uploaded successfully' }))
        } else {
            setStatus('Upload failed')
            window.dispatchEvent(new CustomEvent('show-toast', { detail: 'Upload failed' }))
        }
    }

    const handlePaste = async (e: React.ClipboardEvent) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (!file || !currentPost) return;

                const formData = new FormData();
                formData.append('file', file);

                setStatus('Uploading...');
                const res = await fetch(`/api/upload?slug=${currentPost}`, {
                    method: 'POST',
                    body: formData
                });

                if (res.ok) {
                    const { filename } = await res.json();
                    insertText(`![](./img/${filename})`);
                    setStatus('Image uploaded');
                    window.dispatchEvent(new CustomEvent('show-toast', { detail: 'Image uploaded successfully' }));
                } else {
                    setStatus('Upload failed');
                    window.dispatchEvent(new CustomEvent('show-toast', { detail: 'Upload failed' }));
                }
            }
        }
    };

    const insertText = (textToInsert: string) => {
        const textarea = textareaRef.current
        if (!textarea) {
            setContent(prev => prev + textToInsert)
            return
        }

        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const text = content
        const before = text.substring(0, start)
        const after = text.substring(end, text.length)

        const newText = before + textToInsert + after
        setContent(newText)

        setTimeout(() => {
            textarea.focus()
            textarea.setSelectionRange(start + textToInsert.length, start + textToInsert.length)
        }, 0)
    }

    const formatText = (type: string) => {
        const textarea = textareaRef.current
        if (!textarea) return

        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const text = content
        const selectedText = text.substring(start, end)

        let newText = ''

        switch (type) {
            case 'bold':
                newText = text.substring(0, start) + `**${selectedText}**` + text.substring(end)
                break
            case 'italic':
                newText = text.substring(0, start) + `*${selectedText}*` + text.substring(end)
                break
            case 'h1':
                newText = text.substring(0, start) + `# ${selectedText}` + text.substring(end)
                break
            case 'h2':
                newText = text.substring(0, start) + `## ${selectedText}` + text.substring(end)
                break
            case 'quote':
                newText = text.substring(0, start) + `> ${selectedText}` + text.substring(end)
                break
            case 'code':
                newText = text.substring(0, start) + `\`\`\`\n${selectedText}\n\`\`\`` + text.substring(end)
                break
            case 'link':
                const linkText = selectedText || 'link'
                newText = text.substring(0, start) + `[${linkText}](url)` + text.substring(end)
                break
            case 'list':
                newText = text.substring(0, start) + `- ${selectedText}` + text.substring(end)
                break
        }

        if (newText) {
            setContent(newText)
            setTimeout(() => {
                textarea.focus()
            }, 0)
        }
    }

    const scrollToHeader = (id: string) => {
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
        }
    };

    // Context Menu Handlers
    const handleContextMenu = (e: React.MouseEvent, node: FileNode) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent triggering parent context menus
        setContextMenu({ x: e.clientX, y: e.clientY, node });
    };

    const handleMetaAction = async () => {
        if (!contextMenu) return;
        const { node } = contextMenu;
        setContextMenu(null); // Close menu

        const newTitle = prompt('Enter new title for sidebar (updates _meta.json):');
        if (!newTitle) return;

        let key = node.name.replace(/\.(md|mdx)$/, '');

        // Determine the PARENT directory which contains the _meta.json responsible for this node
        const parts = node.path.split('/');
        parts.pop(); // Remove the node itself
        const parentPath = parts.join('/');

        try {
            const res = await fetch('/api/meta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: parentPath, key, title: newTitle })
            });
            if (!res.ok) throw new Error('Failed to update title');

            window.dispatchEvent(new CustomEvent('show-toast', { detail: 'Title updated in _meta.json' }))

            // Refresh the relevant _meta.json if it is currently open
            const metaFile = parentPath ? `${parentPath}/_meta.json` : '_meta.json';

            if (currentPost === metaFile) {
                loadPost(metaFile);
            }
        } catch (e: any) {
            alert(e.message);
        }
    }

    const handleFSAction = async (action: 'new_file' | 'new_folder' | 'rename' | 'delete') => {
        if (!contextMenu) return;
        const { node } = contextMenu;
        setContextMenu(null); // Close menu

        // Determine parent path
        // If node is a directory, actions like New File are inside it.
        // If node is a file, actions like New File are in its parent directory.
        // Wait, normally right clicking a file -> New File creates sibling.
        // Right clicking a dir -> New File creates child.

        // Helper to get directory logic
        const getParentDir = (n: FileNode) => {
            if (n.type === 'directory') return n.path;
            const parts = n.path.split('/');
            parts.pop();
            return parts.join('/');
        }

        // Target base for creation
        const creationBase = node.type === 'directory' ? node.path : getParentDir(node);

        try {
            if (action === 'new_file') {
                let name = prompt('Enter new file name (e.g. hello.md):');
                if (!name) return;

                // Implicitly add .md if extension missing
                if (!/\.(md|mdx)$/.test(name)) {
                    name += '.md';
                }

                const path = creationBase ? `${creationBase}/${name}` : name;

                const res = await fetch('/api/fs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'file', path })
                });
                if (!res.ok) throw new Error('Failed to create file');

                // Update _meta.json
                try {
                    const key = name.replace(/\.(md|mdx)$/, '');
                    await fetch('/api/meta', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ path: creationBase || '', key, title: key })
                    });

                    window.dispatchEvent(new CustomEvent('show-toast', { detail: 'Added to _meta.json' }))

                    // Refresh parent/_meta.json if open
                    const metaPath = creationBase ? `${creationBase}/_meta.json` : '_meta.json';
                    if (currentPost === metaPath || currentPost === `/${metaPath}`) {
                        setTimeout(() => loadPost(metaPath), 100);
                    }
                } catch (e) {
                    console.error('Failed to update meta', e);
                }

                fetchPosts();

                // Automatically open the new file
                setTimeout(() => {
                    loadPost(path);
                }, 200);
            } else if (action === 'new_folder') {
                const name = prompt('Enter new folder name:');
                if (!name) return;
                const path = creationBase ? `${creationBase}/${name}` : name;

                const res = await fetch('/api/fs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'directory', path })
                });
                if (!res.ok) throw new Error('Failed to create folder');

                // Update _meta.json for folder
                try {
                    const key = name;
                    await fetch('/api/meta', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ path: creationBase || '', key, title: key })
                    });

                    // Also create a _meta.json inside the new folder?
                    // Usually not strictly required unless we put stuff in it immediately, but let's leave it empty for now, or the user can add it.
                    // Actually Nextra tends to like having _meta.json.
                    // Let's rely on manual creation or subsequent actions for inner _meta.json. 

                    window.dispatchEvent(new CustomEvent('show-toast', { detail: 'Added to _meta.json' }))

                    // Refresh parent/_meta.json if open
                    const metaPath = creationBase ? `${creationBase}/_meta.json` : '_meta.json';
                    if (currentPost === metaPath || currentPost === `/${metaPath}`) {
                        setTimeout(() => loadPost(metaPath), 100);
                    }
                } catch (e) {
                    console.error('Failed to update meta', e);
                }

                fetchPosts();
            } else if (action === 'rename') {
                const newName = prompt('Enter new name:', node.name);
                if (!newName || newName === node.name) return;

                // For renaming, we need the parent of the current node (whether file or directory)
                const parts = node.path.split('/');
                parts.pop();
                const parent = parts.join('/');

                const newPath = parent ? `${parent}/${newName}` : newName;

                const res = await fetch('/api/fs', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ oldPath: node.path, newPath })
                });
                if (!res.ok) throw new Error('Failed to rename');

                // Update _meta.json if possible
                try {
                    const getMetaKey = (name: string) => name.replace(/\.(md|mdx)$/, '');
                    const oldKey = getMetaKey(node.name);
                    const newKey = getMetaKey(newName);

                    await fetch('/api/meta', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            folderPath: parent,
                            oldKey,
                            newKey
                        })
                    });
                } catch (e) {
                    console.error('Failed to update meta', e);
                }

                await fetchPosts();

                // If we have reduced parent/_meta.json open, reload it to show changes
                const metaPath = parent ? `${parent}/_meta.json` : '_meta.json';
                if (currentPost === metaPath || currentPost === `/${metaPath}`) {
                    setTimeout(() => loadPost(metaPath), 100);
                }

                // If we renamed the current file being edited, update currentPost
                if (currentPost === node.path) {
                    // Update slug/path to new one
                    setTimeout(() => loadPost(newPath), 100);
                }
            } else if (action === 'delete') {
                if (!confirm(`Are you sure you want to delete ${node.name}?`)) return;

                const res = await fetch('/api/fs', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: node.path })
                });
                if (!res.ok) throw new Error('Failed to delete');
                // Calculate parent and meta path for redirection
                const parts = node.path.split('/');
                parts.pop();
                const parent = parts.join('/');
                const metaPath = parent ? `${parent}/_meta.json` : '_meta.json';

                // Update _meta.json by removing key
                try {
                    const key = node.name.replace(/\.(md|mdx)$/, '');

                    await fetch('/api/meta', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ folderPath: parent, key })
                    });

                    // Refresh parent/_meta.json if open
                    if (currentPost === metaPath || currentPost === `/${metaPath}`) {
                        setTimeout(() => loadPost(metaPath), 100);
                    }
                } catch (e) {
                    console.error('Failed to update meta on delete', e);
                }

                // If the deleted file was the one currently open, redirect to _meta.json
                if (currentPost === node.slug) {
                    setTimeout(() => {
                        loadPost(metaPath);
                        fetchPosts();
                    }, 100);
                } else {
                    // If we deleted something else, just refresh tree
                    fetchPosts();
                }
            }
        } catch (e: any) {
            alert(e.message);
        }
    }

    return (
        <div className={styles.container}>
            <Head>
                <title>Editor - Green Nextra</title>
            </Head>

            <Toast message={toastMsg} />

            {/* Sidebar (File Explorer) */}
            <div
                className={styles.sidebar}
                style={{
                    width: sidebarWidth,
                    marginLeft: isSidebarOpen ? 0 : -sidebarWidth,
                    position: 'relative',
                    transition: isSidebarResizing ? 'none' : 'margin-left 0.3s ease'
                }}
            >
                <div
                    className={styles.resizer}
                    style={{ left: 'auto', right: 0 }}
                    onMouseDown={startSidebarResizing}
                />
                <div className={styles.sidebarHeader}>
                    <FileText size={20} />
                    <span>Explorer</span>
                </div>
                {/* Removed top form as context menu is preferred, or we could add a root 'add' button later */}
                <div className={styles.postList}>
                    {posts.map((node, i) => (
                        <FileTreeItem
                            key={i}
                            node={node}
                            level={0}
                            onLoadPost={loadPost}
                            currentPost={currentPost}
                            onContextMenu={handleContextMenu}
                        />
                    ))}
                    {posts.length === 0 && (
                        <div style={{ padding: '1rem', color: '#888', fontSize: '0.8rem', textAlign: 'center' }}>
                            No files found. <br /> Right click to create new.
                        </div>
                    )}
                    {/* Invisible div to allow right clicking empty area to create at root? */}
                    <div
                        style={{ flex: 1, minHeight: '50px' }}
                        onContextMenu={(e) => {
                            // Virtual root node
                            handleContextMenu(e, { name: 'Root', type: 'directory', path: '' } as FileNode)
                        }}
                    />
                </div>
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <div
                    className={styles.contextMenu}
                    style={{
                        top: contextMenu.y,
                        left: contextMenu.x,
                    }}
                >
                    <div className={styles.contextMenuHeader}>
                        {contextMenu.node.name || 'Root'}
                    </div>
                    <div
                        className={styles.contextMenuItem}
                        onClick={() => handleFSAction('new_file')}
                    >
                        <FileText size={14} /> New File
                    </div>
                    <div
                        className={styles.contextMenuItem}
                        onClick={() => handleFSAction('new_folder')}
                    >
                        <Plus size={14} /> New Folder
                    </div>
                    {contextMenu.node.path !== '' && ( // Don't show rename/delete for Root
                        <>
                            <div className={styles.contextMenuDivider} />
                            <div
                                className={styles.contextMenuItem}
                                onClick={() => handleFSAction('rename')}
                            >
                                <FileText size={14} /> Rename File/Folder
                            </div>
                            <div
                                className={styles.contextMenuItem}
                                onClick={() => handleMetaAction()}
                            >
                                <FileText size={14} /> Rename Title (_meta)
                            </div>
                            <div
                                className={styles.contextMenuItem}
                                onClick={() => handleFSAction('delete')}
                                style={{ color: '#e53e3e' }}
                            >
                                <X size={14} /> Delete
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Main Content */}
            <div className={styles.main}>
                {/* Top Bar */}
                <div className={styles.topBar}>
                    <div className={styles.topBarLeft}>
                        <button className={styles.toggleBtn} onClick={() => setSidebarOpen(!isSidebarOpen)}>
                            {isSidebarOpen ? <ChevronLeft size={20} /> : <Menu size={20} />}
                        </button>
                        <span className={styles.currentTitle}>{currentPost || 'Welcome to Editor'}</span>
                        <span className={styles.status}>{status}</span>
                    </div>
                    <div className={styles.topBarRight}>
                        {currentPost && (
                            <>
                                <select
                                    className={styles.viewModeSelect}
                                    value={viewMode}
                                    onChange={(e) => setViewMode(e.target.value as 'source' | 'preview' | 'both' | 'live')}
                                >
                                    <option value="both">Both Mode</option>
                                    <option value="live">Live Mode</option>
                                    <option value="preview">Preview Mode</option>
                                    <option value="source">Source Mode</option>
                                </select>
                                <button className={styles.saveBtn} onClick={savePost}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Save size={16} /> Save
                                    </span>
                                </button>
                                <button className={styles.cancelBtn} onClick={async () => {
                                    if (!currentPost) return;

                                    // Check if file still exists via API
                                    try {
                                        const res = await fetch(`/api/post?slug=${currentPost}`);
                                        if (res.status === 404) {
                                            router.push('/');
                                            return;
                                        }
                                    } catch (e) {
                                        // On error, default to root or attempt nav? 
                                        // Let's safe-guard to root if we can't verify.
                                        router.push('/');
                                        return;
                                    }

                                    if (currentPost.endsWith('.json')) {
                                        // For json config files, check if parent folder has an index page
                                        const parent = currentPost.split('/').slice(0, -1).join('/');
                                        const targetPath = parent ? parent : 'home';

                                        try {
                                            // Check if the parent path maps to a valid page (index)
                                            const res = await fetch(`/api/post?slug=${targetPath}`);
                                            if (res.ok) {
                                                router.push(parent ? `/${parent}` : '/');
                                            } else {
                                                // If parent folder has no index, go to root
                                                router.push('/');
                                            }
                                        } catch {
                                            router.push('/');
                                        }
                                    } else {
                                        // Strip extension for viewer URL
                                        const viewerPath = currentPost.replace(/\.(md|mdx)$/, '');
                                        router.push(viewerPath === 'home' || viewerPath === 'index' ? '/' : `/${viewerPath}`);
                                    }
                                }}>
                                    <ArrowLeft size={16} /> Back
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Toolbar */}
                {currentPost && (
                    <div className={styles.toolbar}>
                        <button className={styles.toolBtn} onClick={() => formatText('bold')} title="Bold">
                            <Bold size={18} />
                        </button>
                        <button className={styles.toolBtn} onClick={() => formatText('italic')} title="Italic">
                            <Italic size={18} />
                        </button>
                        <button className={styles.toolBtn} onClick={() => formatText('h1')} title="Heading 1">
                            <Heading1 size={18} />
                        </button>
                        <button className={styles.toolBtn} onClick={() => formatText('h2')} title="Heading 2">
                            <Heading2 size={18} />
                        </button>
                        <div className={styles.toolSeparator} />
                        <button className={styles.toolBtn} onClick={() => formatText('list')} title="List">
                            <List size={18} />
                        </button>
                        <button className={styles.toolBtn} onClick={() => formatText('quote')} title="Quote">
                            <Quote size={18} />
                        </button>
                        <button className={styles.toolBtn} onClick={() => formatText('code')} title="Code Block">
                            <Code size={18} />
                        </button>
                        <div className={styles.toolSeparator} />
                        <button className={styles.toolBtn} onClick={() => formatText('link')} title="Link">
                            <LinkIcon size={18} />
                        </button>
                        <label className={styles.toolBtn} title="Upload Image">
                            <ImageIcon size={18} />
                            <input type="file" className="hidden" onChange={handleImageUpload} accept="image/*" style={{ display: 'none' }} />
                        </label>
                    </div>
                )}

                {/* Editor Workspace */}
                <div
                    id="workspace-container"
                    className={styles.workspace}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                >
                    {currentPost ? (
                        <>
                            <div
                                className={`${styles.pane} ${styles.editorPane}`}
                                style={{
                                    display: (viewMode === 'preview' || viewMode === 'live') ? 'none' : 'flex',
                                    borderRight: viewMode === 'both' ? 'none' : '1px solid #e9ecef',
                                    flex: viewMode === 'both' ? `${editorRatio}` : '1'
                                }}
                            >
                                <textarea
                                    ref={textareaRef}
                                    className={styles.textarea}
                                    value={content}
                                    onChange={e => setContent(e.target.value)}
                                    onPaste={handlePaste}
                                    placeholder="Start writing..."
                                />
                            </div>

                            {viewMode === 'both' && (
                                <div
                                    className={styles.paneResizer}
                                    onMouseDown={startPaneResizing}
                                />
                            )}

                            <div
                                className={`${styles.pane} ${styles.previewPane}`}
                                style={{
                                    display: (viewMode === 'source' || viewMode === 'live') ? 'none' : 'flex',
                                    flex: viewMode === 'both' ? `${1 - editorRatio}` : '1'
                                }}
                            >
                                <div className={`${styles.previewContent} prose max-w-none`}>
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        rehypePlugins={[rehypeRaw]}
                                        urlTransform={(url) => {
                                            if (url.startsWith('./img/') && currentPost) {
                                                return `/api/image_preview?slug=${currentPost}&file=${url.replace('./img/', '')}`
                                            }
                                            return url
                                        }}
                                        components={{
                                            pre: ({ children }: any) => <>{children}</>,
                                            code({ node, inline, className, children, ...props }: any) {
                                                const match = /language-(\w+)/.exec(className || '')
                                                const codeContent = String(children).replace(/\n$/, '')
                                                if (!inline && match) {
                                                    // It's a code block with language
                                                    return (
                                                        <CodeBlock language={match[1]} value={codeContent} />
                                                    )
                                                } else if (!inline && codeContent.includes('\n')) {
                                                    // It's a multi-line code block without explicit language
                                                    return (
                                                        <CodeBlock language="text" value={codeContent} />
                                                    )
                                                }
                                                // Otherwise it's inline code
                                                return (
                                                    <code className={className} {...props}>
                                                        {children}
                                                    </code>
                                                )
                                            },
                                            h1: ({ children }) => <h1 id={generateSlug(String(children))}>{children}</h1>,
                                            h2: ({ children }) => <h2 id={generateSlug(String(children))}>{children}</h2>,
                                            h3: ({ children }) => <h3 id={generateSlug(String(children))}>{children}</h3>,
                                            a: ({ href, children }: any) => {
                                                const url = href || '';
                                                const videoId = getYouTubeId(url);

                                                // Flexible raw link detection that handles both string and array children
                                                // and checks if the link text matches or contains the URL
                                                const linkText = Array.isArray(children)
                                                    ? children.map(c => typeof c === 'string' ? c : '').join('')
                                                    : String(children || '');

                                                const isRawLink = linkText.trim().includes(url.trim());

                                                if (videoId && isRawLink) {
                                                    return (
                                                        <>
                                                            <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#42b883', textDecoration: 'underline' }}>{children}</a>
                                                            <YouTubeEmbed url={url} />
                                                        </>
                                                    );
                                                }

                                                // Generic Link Preview for other raw links
                                                if (isRawLink && (url.startsWith('http://') || url.startsWith('https://'))) {
                                                    return (
                                                        <>
                                                            <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#42b883', textDecoration: 'underline' }}>{children}</a>
                                                            <LinkPreview url={url} />
                                                        </>
                                                    );
                                                }

                                                return <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#42b883', textDecoration: 'underline' }}>{children}</a>;
                                            }
                                        }}
                                    >
                                        {content}
                                    </ReactMarkdown>
                                </div>
                            </div>

                            {/* Live Mode Editor */}
                            <div
                                className={`${styles.pane} ${styles.livePane}`}
                                style={{ display: viewMode === 'live' ? 'block' : 'none' }}
                            >
                                <div className={styles.liveEditorContainer}>
                                    <LiveEditor
                                        value={content}
                                        onValueChange={code => setContent(code)}
                                        highlight={code => Prism.highlight(code, Prism.languages.markdown, 'markdown')}
                                        padding={30}
                                        className={styles.liveEditor}
                                        textareaClassName={styles.liveEditorTextarea}
                                        onPaste={handlePaste}
                                        style={{
                                            fontFamily: '"Fira Code", "Fira Mono", monospace',
                                            fontSize: 16,
                                            backgroundColor: '#ffffff',
                                            minHeight: '100%'
                                        }}
                                    />
                                </div>
                            </div>

                            {/* TOC Sidebar */}
                            <div className={styles.tocSidebar} style={{ width: tocWidth }}>
                                <div className={styles.resizer} onMouseDown={startResizing} />
                                <div className={styles.tocHeader}>
                                    <List size={18} />
                                    <span>Outline</span>
                                </div>
                                <div className={styles.tocList}>
                                    {toc.map((item, index) => (
                                        <a
                                            key={index}
                                            className={`${styles.tocItem} ${styles['h' + item.level]}`}
                                            onClick={() => scrollToHeader(item.id)}
                                        >
                                            {item.text}
                                        </a>
                                    ))}
                                    {toc.length === 0 && (
                                        <div style={{ padding: '1rem', color: '#999', fontSize: '0.9rem' }}>
                                            No headers found
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className={styles.emptyState}>
                            <FileText size={48} />
                            <p>Select a file from the sidebar to edit</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
