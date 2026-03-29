'use client';

import { useEffect } from 'react';

export default function CodeCopyButton() {
  useEffect(() => {
    // 모든 코드 블록에 복사 버튼 추가
    const codeBlocks = document.querySelectorAll('pre code');

    codeBlocks.forEach((codeBlock) => {
      const pre = codeBlock.parentElement;
      if (!pre || pre.querySelector('.copy-button')) return; // 이미 버튼이 있으면 스킵

      // 버튼 컨테이너 생성
      const buttonContainer = document.createElement('div');
      buttonContainer.className = 'code-block-header';

      // 복사 버튼 생성
      const copyButton = document.createElement('button');
      copyButton.className = 'copy-button';
      copyButton.innerHTML = `
        <svg class="copy-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <svg class="check-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: none;">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;

      // 복사 기능
      copyButton.addEventListener('click', async () => {
        const code = codeBlock.textContent || '';

        try {
          await navigator.clipboard.writeText(code);

          // 아이콘 전환 (복사 완료 표시)
          const copyIcon = copyButton.querySelector('.copy-icon') as HTMLElement;
          const checkIcon = copyButton.querySelector('.check-icon') as HTMLElement;

          if (copyIcon && checkIcon) {
            copyIcon.style.display = 'none';
            checkIcon.style.display = 'block';
            copyButton.classList.add('copied');

            setTimeout(() => {
              copyIcon.style.display = 'block';
              checkIcon.style.display = 'none';
              copyButton.classList.remove('copied');
            }, 2000);
          }
        } catch (err) {
          console.error('Failed to copy code:', err);
        }
      });

      buttonContainer.appendChild(copyButton);
      pre.insertBefore(buttonContainer, pre.firstChild);
      pre.style.position = 'relative';
    });
  }, []);

  return null;
}
