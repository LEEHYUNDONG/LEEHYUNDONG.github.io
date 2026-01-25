import Link from 'next/link';
import { getAllPosts } from '@/lib/posts';
import { formatDate } from '@/lib/utils';

export default function Home() {
  const posts = getAllPosts();

  return (
    <div className="home">
      <ul className="post-list">
        {posts.map((post) => (
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
    </div>
  );
}
