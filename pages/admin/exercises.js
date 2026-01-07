import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function AdminExercisesRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/exercise-bank');
  }, [router]);

  return null;
}