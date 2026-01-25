import Link from 'next/link';
import { getAllCategories, getPostsByCategory } from '@/lib/posts';
import { formatDate } from '@/lib/utils';

interface PageProps {
  params: Promise<{ category: string }>;
}

export async function generateStaticParams() {
  const categories = getAllCategories();
  return categories.map((cat) => ({
    category: cat.name,
  }));
}

export async function generateMetadata({ params }: PageProps) {
  const { category } = await params;
  const decodedCategory = decodeURIComponent(category);
  return {
    title: `${decodedCategory} | Devlog`,
    description: `${decodedCategory} 카테고리의 포스트 목록`,
  };
}

export default async function CategoryPage({ params }: PageProps) {
  const { category } = await params;
  const decodedCategory = decodeURIComponent(category);
  const posts = getPostsByCategory(decodedCategory);

  return (
    <div className="taxonomy-page">
      <div className="taxonomy-header">
        <Link href="/categories" className="taxonomy-back">
          ← 모든 카테고리
        </Link>
        <h1 className="taxonomy-title">{decodedCategory}</h1>
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
            </div>
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
