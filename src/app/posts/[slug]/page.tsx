import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAllPosts, getPostBySlug } from '@/lib/posts';
import { formatDate } from '@/lib/utils';
import TableOfContents from '@/components/TableOfContents';
import '@/styles/post.css';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map((post) => ({
    slug: post.slug,
  }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    return { title: 'Post Not Found' };
  }

  return {
    title: `${post.title} | Devlog`,
    description: post.excerpt || post.title,
  };
}

export default async function PostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  return (
    <>
      <TableOfContents />
      <article className="post">
        <header className="post-header">
          {post.categories && (
            <div className="post-category-label">
              <Link href={`/categories/${encodeURIComponent(post.categories)}`}>
                {post.categories}
              </Link>
            </div>
          )}
          <h1 className="post-title">{post.title}</h1>
          <div className="post-meta-wrapper">
            <p className="post-meta">
              <time dateTime={post.date}>
                {formatDate(post.date)}
              </time>
              {post.author && (
                <span className="post-author"> • {post.author.join(', ')}</span>
              )}
            </p>
            {post.tags && post.tags.length > 0 && (
              <div className="post-tags-inline">
                {post.tags.map((tag) => (
                  <Link
                    key={tag}
                    href={`/tags/${encodeURIComponent(tag)}`}
                    className="post-tag-chip"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            )}
          </div>
      </header>
      <div
        className="post-content"
        dangerouslySetInnerHTML={{ __html: post.contentHtml }}
      />
      </article>
    </>
  );
}
