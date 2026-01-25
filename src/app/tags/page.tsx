import Link from 'next/link';
import { getAllTags } from '@/lib/posts';

export const metadata = {
  title: 'Tags | Devlog',
  description: '태그별 포스트 목록',
};

export default function TagsPage() {
  const tags = getAllTags();

  return (
    <div className="taxonomy-page">
      <h1 className="taxonomy-title">Tags</h1>
      <div className="taxonomy-list tags-cloud">
        {tags.map((tag) => (
          <Link
            key={tag.name}
            href={`/tags/${encodeURIComponent(tag.name)}`}
            className="taxonomy-item tag-item"
          >
            <span className="taxonomy-name">#{tag.name}</span>
            <span className="taxonomy-count">{tag.count}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
