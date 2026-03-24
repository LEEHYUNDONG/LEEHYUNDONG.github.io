'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { PostMeta } from '@/lib/posts';
import { formatDate } from '@/lib/utils';
import TagFilterSidebar from './TagFilterSidebar';
import Pagination from './Pagination';

const POSTS_PER_PAGE = 5;

interface PostListWithFiltersProps {
  posts: PostMeta[];
}

export default function PostListWithFilters({ posts }: PostListWithFiltersProps) {
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Reset to page 1 when tag filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedTag]);

  // Filter posts by selected tag
  const filteredPosts = selectedTag === null
    ? posts
    : posts.filter((post) => post.tags?.includes(selectedTag));

  // Calculate pagination
  const totalPages = Math.ceil(filteredPosts.length / POSTS_PER_PAGE);
  const paginatedPosts = filteredPosts.slice(
    (currentPage - 1) * POSTS_PER_PAGE,
    currentPage * POSTS_PER_PAGE
  );

  return (
    <div className="home-container">
      <div className={`tags-container ${isSidebarOpen ? 'open' : ''}`}>
        <div className="tags-wrapper">
          <div
            className="tags-indicator"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          >
            <span>#</span>
          </div>
          <div className="tags-content">
            <TagFilterSidebar
              posts={posts}
              selectedTag={selectedTag}
              onTagSelect={setSelectedTag}
            />
          </div>
        </div>
      </div>

      <div className="post-list-view">
        {paginatedPosts.length === 0 ? (
          <div className="no-posts">
            No posts found with this tag.
          </div>
        ) : (
          <>
            <ul className="post-list">
              {paginatedPosts.map((post) => (
                <li key={post.slug} className="post-item">
                  <h2 className="post-title">
                    <Link href={`/posts/${post.slug}`}>
                      {post.title}
                    </Link>
                  </h2>
                  <div className="post-meta">
                    <time dateTime={post.date}>
                      {formatDate(post.date)}
                    </time>
                    {post.categories && (
                      <Link
                        href={`/categories/${encodeURIComponent(post.categories)}`}
                        className="post-category"
                      >
                        {post.categories}
                      </Link>
                    )}
                  </div>
                  {post.excerpt && (
                    <p className="post-excerpt">{post.excerpt}</p>
                  )}
                  {post.tags && post.tags.length > 0 && (
                    <div className="post-tags">
                      {post.tags.map((tag) => (
                        <Link
                          key={tag}
                          href={`/tags/${encodeURIComponent(tag)}`}
                          className="tag"
                        >
                          #{tag}
                        </Link>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
