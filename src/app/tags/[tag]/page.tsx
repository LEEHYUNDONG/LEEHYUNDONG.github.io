import Link from 'next/link';
import { getAllTags, getPostsByTag } from '@/lib/posts';
import { formatDate } from '@/lib/utils';

interface PageProps {
  params: Promise<{ tag: string }>;
}

export async function generateStaticParams() {
  const tags = getAllTags();
  return tags.map((t) => ({
    tag: t.name,
  }));
}

export async function generateMetadata({ params }: PageProps) {
  const { tag } = await params;
  const decodedTag = decodeURIComponent(tag);
  return {
    title: `#${decodedTag} | Devlog`,
    description: `#${decodedTag} 태그의 포스트 목록`,
  };
}

export default async function TagPage({ params }: PageProps) {
  const { tag } = await params;
  const decodedTag = decodeURIComponent(tag);
  const posts = getPostsByTag(decodedTag);

  return (
    <div className="taxonomy-page">
      <div className="taxonomy-header">
        <Link href="/tags" className="taxonomy-back">
          ← 모든 태그
        </Link>
        <h1 className="taxonomy-title">#{decodedTag}</h1>
        <p className="taxonomy-count-label">{posts.length}개의 포스트</p>
      </div>
      <ul className="post-list">
        {posts.map((post) => (
          <li key={post.slug} className="post-item">
            <h2 className="post-title">
              <Link href={`/posts/${post.slug}`}>{post.title}</Link>
            </h2>
            <div className="post-meta">
              <time dateTime={post.date}>{formatDate(post.date)}</time>
              {post.categories && (
                <Link
                  href={`/categories/${encodeURIComponent(post.categories)}`}
                  className="post-category"
                >
                  {post.categories}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
