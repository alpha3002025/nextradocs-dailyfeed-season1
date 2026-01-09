import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { YouTubeEmbed, getYouTubeId } from "@/components/YouTubeEmbed";
import { LinkPreview } from "@/components/LinkPreview";

// Standard SVG paths for icons
const COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
const CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#42b883" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

function Toast({ message }: { message: string }) {
  if (!message) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div style={{
      position: 'fixed',
      bottom: '2rem',
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: '#42b883',
      color: 'white',
      padding: '0.5rem 1rem',
      borderRadius: '4px',
      fontSize: '0.9rem',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      zIndex: 2000,
      animation: 'fadeInOut 2s ease-in-out forwards'
    }}>
      {message}
    </div>,
    document.body
  );
}

// Enhanced CodeBlockEnhancer (Lines 37-164 replacement)
function CodeBlockEnhancer() {
  const router = useRouter();

  useEffect(() => {
    const enhance = () => {
      const preElements = document.querySelectorAll('pre');
      preElements.forEach((pre: any) => {
        if (pre.getAttribute('data-enhanced-interact')) return;

        // Basic Structure Check
        const code = pre.querySelector('code');
        if (!code) return;

        // Ensure Pre is relative
        if (window.getComputedStyle(pre).position === 'static') {
          pre.style.position = 'relative';
        }

        // --- 1. Overlay Container for Highlights ---
        // We render this BEHIND the text if possible, or using mix-blend-mode if on top?
        // Code blocks usually have a background color.
        // We can place this container absolutely.
        // To ensure it's behind text but above bg, we might need z-index tricks.
        // Easier: render on top with semi-transparent color and pointer-events: none.
        const overlay = document.createElement('div');
        overlay.className = 'code-interaction-overlay';
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.pointerEvents = 'none'; // Pass through clicks to text selection
        overlay.style.zIndex = '1';
        pre.appendChild(overlay);

        // Hover Highlight Element
        const hoverEl = document.createElement('div');
        hoverEl.style.position = 'absolute';
        hoverEl.style.left = '0';
        hoverEl.style.right = '0'; // Full width
        hoverEl.style.height = '1.5em'; // Default, will update
        hoverEl.style.backgroundColor = 'rgba(66, 184, 131, 0.1)';
        hoverEl.style.borderLeft = '3px solid #42b883';
        hoverEl.style.display = 'none';
        hoverEl.style.pointerEvents = 'none';
        overlay.appendChild(hoverEl);

        // Active (Clicked) Highlight Element
        const activeEl = document.createElement('div');
        activeEl.style.position = 'absolute';
        activeEl.style.left = '0';
        activeEl.style.right = '0';
        activeEl.style.height = '1.5em';
        activeEl.style.backgroundColor = 'rgba(66, 184, 131, 0.2)';
        activeEl.style.borderLeft = '3px solid #33a06f';
        activeEl.style.display = 'none';
        activeEl.style.pointerEvents = 'none';
        overlay.appendChild(activeEl);

        // State
        let activeLineIndex: number | null = null;
        let lineHeight = 24; // Default guess

        // Measure line height from code element
        const computedStyle = window.getComputedStyle(code);
        const lhStr = computedStyle.lineHeight;
        if (lhStr && lhStr !== 'normal') {
          lineHeight = parseFloat(lhStr);
        } else {
          // Fallback measurement
          const fontSize = parseFloat(computedStyle.fontSize);
          lineHeight = fontSize * 1.5;
        }

        // Event Handler
        const handleMouseMove = (e: MouseEvent) => {
          const rect = pre.getBoundingClientRect();
          const padding = parseFloat(window.getComputedStyle(pre).paddingTop);
          const relY = e.clientY - rect.top - padding;
          // Calculate index
          // Adjust for scroll? Pre usually scrolls.
          const scrollY = pre.scrollTop;
          const actualY = relY + scrollY;

          const index = Math.floor(actualY / lineHeight);
          if (index < 0) return;

          // Move Hover Element
          hoverEl.style.display = 'block';
          // Visual position must account for padding
          hoverEl.style.top = `${(index * lineHeight) + padding}px`;
          hoverEl.style.height = `${lineHeight}px`;
        };

        const handleMouseLeave = () => {
          hoverEl.style.display = 'none';
        };

        const handleClick = (e: MouseEvent) => {
          const rect = pre.getBoundingClientRect();
          const padding = parseFloat(window.getComputedStyle(pre).paddingTop);
          const relY = e.clientY - rect.top - padding;
          const scrollY = pre.scrollTop;
          const actualY = relY + scrollY;
          const index = Math.floor(actualY / lineHeight);

          // Toggle active
          if (activeLineIndex === index) {
            activeLineIndex = null;
            activeEl.style.display = 'none';
          } else {
            activeLineIndex = index;
            activeEl.style.display = 'block';
            activeEl.style.top = `${(index * lineHeight) + padding}px`;
            activeEl.style.height = `${lineHeight}px`;
          }
        };

        // Attach Refined Listeners
        // We attach to PRE because it contains everything.
        pre.addEventListener('mousemove', handleMouseMove);
        pre.addEventListener('mouseleave', handleMouseLeave);
        pre.addEventListener('click', handleClick);

        // Copy Button Logic (Restoring previous simplified logic but appending to wrapper usually)
        // ... (We keep your existing Copy Button logic simpler or integrated? 
        // User didn't complain about copy button, but we overwrote the whole function.
        // Let's bring back the copy button part quickly.)

        // Finding wrapper for Copy Button (Nextra usually wraps pre)
        const wrapper = pre.closest('.nextra-code-block') || pre.parentElement;
        if (wrapper && window.getComputedStyle(wrapper).position === 'static') {
          wrapper.style.position = 'relative';
        }

        if (wrapper && !wrapper.querySelector('.enhanced-controls')) {
          const controls = document.createElement('div');
          controls.className = 'enhanced-controls';
          controls.style.position = 'absolute';
          controls.style.top = '0.5rem';
          controls.style.right = '0.5rem';
          controls.style.display = 'flex';
          controls.style.alignItems = 'center';
          controls.style.gap = '0.5rem';
          controls.style.zIndex = '10';
          wrapper.appendChild(controls);

          // Determine Language
          let language = '';
          // Check code class
          let match = code.className.match(/language-(\w+)/);
          if (match) language = match[1];

          // Check pre class
          if (!language) {
            match = pre.className.match(/language-(\w+)/);
            if (match) language = match[1];
          }

          // Check data attributes
          if (!language) {
            language = pre.getAttribute('data-language') || code.getAttribute('data-language') || '';
          }

          // Render Language Label
          if (language) {
            const label = document.createElement('div');
            label.innerText = language;
            label.style.fontSize = '0.75rem';
            label.style.color = '#888';
            label.style.fontWeight = '600';
            label.style.textTransform = 'uppercase';
            label.style.userSelect = 'none';
            label.style.pointerEvents = 'none';
            label.style.transition = 'opacity 0.2s';
            controls.appendChild(label);

            // attach to wrapper for hover handling
            (wrapper as any)._langLabel = label;
          }

          const btn = document.createElement('button');
          btn.innerHTML = COPY_ICON;
          btn.style.background = 'rgba(255,255,255,0.1)';
          btn.style.border = '1px solid rgba(255,255,255,0.2)';
          btn.style.borderRadius = '4px';
          btn.style.padding = '4px';
          btn.style.cursor = 'pointer';
          btn.style.display = 'flex';
          btn.style.alignItems = 'center';
          btn.style.justifyContent = 'center';
          btn.style.color = '#ccc';
          btn.style.opacity = '0';
          btn.style.transition = 'all 0.2s';
          btn.onclick = () => {
            const text = pre.innerText;
            navigator.clipboard.writeText(text).then(() => {
              btn.innerHTML = CHECK_ICON;
              btn.style.borderColor = '#42b883';
              window.dispatchEvent(new CustomEvent('show-viewer-toast', { detail: 'Copied to clipboard' }));
              setTimeout(() => {
                btn.innerHTML = COPY_ICON;
                btn.style.borderColor = 'rgba(255,255,255,0.2)';
              }, 2000);
            });
          };
          controls.appendChild(btn);

          wrapper.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
          wrapper.addEventListener('mouseleave', () => { btn.style.opacity = '0'; });
        }


        pre.setAttribute('data-enhanced-interact', 'true');
      });
    };

    const observer = new MutationObserver(enhance);
    if (typeof document !== 'undefined') {
      observer.observe(document.body, { childList: true, subtree: true });
      enhance();
    }
    return () => observer.disconnect();
  }, [router.asPath]);

  return null;
}

function EditButton() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Check path.
    // Root is home.
    // Anything else under / (e.g. /hello-next) is a post, unless it's /admin.
    if (router.pathname.startsWith('/admin')) {
      setSlug("");
      return;
    }

    if (router.pathname === '/') {
      setSlug('home');
    } else {
      // Extract slug from /slug
      const parts = router.pathname.split('/').filter(Boolean);
      if (parts.length > 0) {
        setSlug(parts.join('/'));
      } else {
        setSlug("");
      }
    }
  }, [router]);

  // Hide in production
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  if (!mounted || !slug) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '2rem',
      right: '2rem',
      zIndex: 100
    }}>
      <Link
        href={`/admin/editor?open=${slug}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '3.5rem',
          height: '3.5rem',
          backgroundColor: '#42b883', // Vue Green background
          color: 'white',
          borderRadius: '50%',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          transition: 'all 0.2s',
          textDecoration: 'none'
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.transform = 'scale(1.1)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
        title="Edit this post"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
      </Link>
    </div>
  );
}

export default function App({ Component, pageProps }: AppProps) {
  const [toastMsg, setToastMsg] = useState('');

  useEffect(() => {
    const handleToast = (e: any) => {
      setToastMsg(e.detail);
      setTimeout(() => setToastMsg(''), 2000);
    };
    window.addEventListener('show-viewer-toast', handleToast);
    return () => window.removeEventListener('show-viewer-toast', handleToast);
  }, []);

  return (
    <>
      <CodeBlockEnhancer />
      <EditButton />
      <Toast message={toastMsg} />
      <Component {...pageProps} components={{
        a: ({ href, children }: any) => {
          const url = href || '';
          const videoId = getYouTubeId(url);

          // Flexible raw link detection
          const linkText = Array.isArray(children)
            ? children.map(c => typeof c === 'string' ? c : '').join('')
            : String(children || '');

          const isRawLink = linkText.trim().replace(/\/$/, '') === url.trim().replace(/\/$/, '');

          if (videoId && isRawLink) {
            return (
              <>
                <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#42b883', textDecoration: 'underline' }}>{children}</a>
                <YouTubeEmbed url={url} />
              </>
            );
          }

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
      }} />
    </>
  );
}
