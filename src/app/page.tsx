import { getAllPosts } from '@/lib/posts';
import PostListWithFilters from '@/components/PostListWithFilters';

export default function Home() {
  const posts = getAllPosts();

  return <PostListWithFilters posts={posts} />;
}
