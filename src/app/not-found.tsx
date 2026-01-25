import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{
      textAlign: 'center',
      padding: '4rem 1rem',
    }}>
      <h1 style={{
        fontSize: '4rem',
        marginBottom: '1rem',
      }}>404</h1>
      <p style={{
        marginBottom: '2rem',
        color: 'var(--text-secondary)',
      }}>페이지를 찾을 수 없습니다.</p>
      <Link href="/">홈으로 돌아가기</Link>
    </div>
  );
}
