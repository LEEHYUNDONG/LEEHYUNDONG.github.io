'use client';

import { useEffect, useState } from 'react';

interface TocItem {
  id: string;
  text: string;
  level: number;
}

export default function TableOfContents() {
  const [headings, setHeadings] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    // Extract headings from post content
    const postContent = document.querySelector('.post-content');
    if (!postContent) return;

    const elements = postContent.querySelectorAll('h1, h2, h3, h4');
    const items: TocItem[] = [];

    elements.forEach((el) => {
      // rehype-slug generates id from heading text
      if (el.id) {
        items.push({
          id: el.id,
          text: el.textContent || '',
          level: parseInt(el.tagName[1]),
        });
      }
    });

    setHeadings(items);

    // Intersection Observer for active heading
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: '-80px 0px -80% 0px' }
    );

    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  if (headings.length === 0) return null;

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const element = document.getElementById(id);
    if (element) {
      const top = element.offsetTop - 80;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  return (
    <nav className="toc-container">
      <div className="toc-wrapper">
        <div className="toc-indicator">
          <span>목차</span>
        </div>
        <div className="toc-content">
          <ul className="toc-list">
            {headings.map((heading) => (
              <li
                key={heading.id}
                className={`toc-item toc-level-${heading.level} ${
                  activeId === heading.id ? 'active' : ''
                }`}
              >
                <a
                  href={`#${heading.id}`}
                  onClick={(e) => handleClick(e, heading.id)}
                >
                  {heading.text}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </nav>
  );
}
