'use client';

import { PostMeta } from '@/lib/posts';

interface TagFilterSidebarProps {
  posts: PostMeta[];
  selectedTag: string | null;
  onTagSelect: (tag: string | null) => void;
}

export default function TagFilterSidebar({
  posts,
  selectedTag,
  onTagSelect,
}: TagFilterSidebarProps) {
  // Extract unique tags with counts
  const tagCounts = posts.reduce((acc, post) => {
    post.tags?.forEach((tag) => {
      acc[tag] = (acc[tag] || 0) + 1;
    });
    return acc;
  }, {} as Record<string, number>);

  const tags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  const totalPosts = posts.length;

  return (
    <ul className="tag-filter-list">
      <li
        className={`tag-filter-item ${selectedTag === null ? 'active' : ''}`}
        onClick={() => onTagSelect(null)}
      >
        <span className="tag-name">All Posts</span>
        <span className="tag-filter-count">{totalPosts}</span>
      </li>
      {tags.map(([tag, count]) => (
        <li
          key={tag}
          className={`tag-filter-item ${selectedTag === tag ? 'active' : ''}`}
          onClick={() => onTagSelect(tag)}
        >
          <span className="tag-name">{tag}</span>
          <span className="tag-filter-count">{count}</span>
        </li>
      ))}
    </ul>
  );
}
