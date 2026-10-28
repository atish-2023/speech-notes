import { useState, useEffect, useCallback } from 'react';
import { fetchTranscripts } from '../services/api.js';

/**
 * Owns the transcript history list: the loaded rows, the search term, the
 * loading/error flags and the debounced fetch. App.jsx keeps only the UI
 * orchestration (notifications, modals) around these values.
 */
export function useTranscripts() {
  const [transcripts, setTranscripts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [listError, setListError] = useState(null);

  const loadTranscripts = useCallback(async (search = '') => {
    setIsLoadingList(true);
    setListError(null);
    try {
      const data = await fetchTranscripts(search);
      setTranscripts(data);
    } catch (err) {
      setListError(err.message || 'Could not load saved transcripts.');
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  // Initial fetch and search debouncing
  useEffect(() => {
    const timer = setTimeout(() => {
      loadTranscripts(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, loadTranscripts]);

  return {
    transcripts,
    searchQuery,
    setSearchQuery,
    isLoadingList,
    listError,
    loadTranscripts
  };
}

export default useTranscripts;
