import { useEffect } from 'react';

/**
 * Sets document.title and restores previous title on unmount.
 */
export function useDocumentTitle(title) {
  useEffect(() => {
    const prevTitle = document.title;
    if (title) {
      document.title = `${title} | PayPost`;
    } else {
      document.title = 'PayPost';
    }
    return () => {
      document.title = prevTitle;
    };
  }, [title]);
}
