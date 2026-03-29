'use client';

import { useEffect, useState } from 'react';

export default function ImageLightbox() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentImage, setCurrentImage] = useState<string>('');
  const [currentAlt, setCurrentAlt] = useState<string>('');

  useEffect(() => {
    // 포스트 내 모든 이미지에 클릭 이벤트 추가
    const images = document.querySelectorAll<HTMLImageElement>('.post-content img');

    const handleImageClick = (e: Event) => {
      const img = e.target as HTMLImageElement;
      setCurrentImage(img.src);
      setCurrentAlt(img.alt || '');
      setIsOpen(true);
    };

    images.forEach((img) => {
      img.style.cursor = 'pointer';
      img.addEventListener('click', handleImageClick);
    });

    // ESC 키로 닫기
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      images.forEach((img) => {
        img.removeEventListener('click', handleImageClick);
      });
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="image-lightbox-overlay" onClick={() => setIsOpen(false)}>
      <button
        className="lightbox-close"
        onClick={() => setIsOpen(false)}
        aria-label="Close"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        <img src={currentImage} alt={currentAlt} />
      </div>
    </div>
  );
}
