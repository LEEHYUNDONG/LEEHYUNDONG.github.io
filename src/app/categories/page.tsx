import Link from 'next/link';
import { getAllCategories } from '@/lib/posts';

export const metadata = {
  title: 'Categories | Devlog',
  description: '카테고리별 포스트 목록',
};

export default function CategoriesPage() {
  const categories = getAllCategories();

  return (
    <div className="taxonomy-page">
      <h1 className="taxonomy-title">Categories</h1>
      <div className="taxonomy-list">
        {categories.map((category) => (
          <Link
            key={category.name}
            href={`/categories/${encodeURIComponent(category.name)}`}
            className="taxonomy-item"
          >
            <span className="taxonomy-name">{category.name}</span>
            <span className="taxonomy-count">{category.count}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
