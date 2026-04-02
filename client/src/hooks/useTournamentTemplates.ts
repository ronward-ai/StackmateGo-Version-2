import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { TournamentTemplate } from '@/types';
import { sanitizeForFirestore } from '@/lib/utils';

export function useTournamentTemplates() {
  const [templates, setTemplates] = useState<TournamentTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    if (!auth.currentUser) {
      setTemplates([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const q = query(
        collection(db, 'tournamentTemplates'),
        where('ownerId', '==', auth.currentUser.uid)
      );
      
      const querySnapshot = await getDocs(q);
      const fetchedTemplates: TournamentTemplate[] = [];
      querySnapshot.forEach((doc) => {
        fetchedTemplates.push({ id: doc.id, ...doc.data() } as TournamentTemplate);
      });
      
      // Sort locally by createdAt desc
      fetchedTemplates.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
      
      setTemplates(fetchedTemplates);
    } catch (err) {
      console.error('Error fetching tournament templates:', err);
      setError('Failed to load templates');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const saveTemplate = async (template: Omit<TournamentTemplate, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>) => {
    if (!auth.currentUser) {
      throw new Error('Must be logged in to save templates');
    }

    try {
      const newTemplate = {
        ...template,
        ownerId: auth.currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'tournamentTemplates'), sanitizeForFirestore(newTemplate));
      
      // Optimistically update local state
      setTemplates(prev => [{
        ...newTemplate,
        id: docRef.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      } as TournamentTemplate, ...prev]);
      
      return docRef.id;
    } catch (err) {
      console.error('Error saving template:', err);
      throw new Error('Failed to save template');
    }
  };

  const deleteTemplate = async (id: string) => {
    if (!auth.currentUser) {
      throw new Error('Must be logged in to delete templates');
    }

    try {
      await deleteDoc(doc(db, 'tournamentTemplates', id));
      
      // Optimistically update local state
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      console.error('Error deleting template:', err);
      throw new Error('Failed to delete template');
    }
  };

  return {
    templates,
    isLoading,
    error,
    saveTemplate,
    deleteTemplate,
    refreshTemplates: fetchTemplates
  };
}
